import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const BIZ_PROMPT = `이 이미지는 한국 사업자등록증입니다. 다음 정보를 JSON으로 추출해주세요:
{
  "business_registration_number": "사업자등록번호 (숫자 10자리, 하이픈 없이)",
  "company_name": "상호(법인명)",
  "representative_name": "대표자 성명"
}
찾을 수 없는 필드는 빈 문자열("")로 반환하세요. JSON만 반환하고 다른 텍스트는 포함하지 마세요.`

const BANK_PROMPT = `이 이미지는 한국 통장 사본입니다. 다음 정보를 JSON으로 추출해주세요:
{
  "bank_name": "은행명 — 반드시 아래 목록 중 하나로만 반환하세요: 국민은행, 신한은행, 우리은행, 하나은행, NH농협은행, IBK기업은행, 카카오뱅크, 토스뱅크, SC제일은행, 씨티은행, 케이뱅크, 수협은행, 대구은행, 부산은행, 경남은행, 광주은행, 전북은행, 제주은행, 산업은행, 우체국",
  "bank_account": "계좌번호 (숫자와 하이픈만)",
  "bank_holder": "예금주명"
}
찾을 수 없는 필드는 빈 문자열("")로 반환하세요. JSON만 반환하고 다른 텍스트는 포함하지 마세요.`

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as 'biz' | 'bank' | null

  if (!file || !type) {
    return NextResponse.json({ error: 'file and type required' }, { status: 400 })
  }
  if (!['biz', 'bank'].includes(type)) {
    return NextResponse.json({ error: 'type must be biz or bank' }, { status: 400 })
  }

  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  const mimeType = file.type || 'image/jpeg'
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: '지원하지 않는 파일 형식입니다. JPG, PNG, PDF만 업로드 가능합니다.' },
      { status: 400 }
    )
  }

  const MAX_SIZE = 5 * 1024 * 1024 // 5MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: '파일 크기는 5MB 이하여야 합니다.' },
      { status: 400 }
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  try {
    const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/webp'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentBlocks: any[] = mimeType === 'application/pdf'
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: type === 'biz' ? BIZ_PROMPT : BANK_PROMPT },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: type === 'biz' ? BIZ_PROMPT : BANK_PROMPT },
        ]

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: contentBlocks }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'OCR 결과를 파싱할 수 없습니다.' }, { status: 422 })
    }
    const parsed = JSON.parse(jsonMatch[0])
    if (type === 'biz' && parsed.business_registration_number) {
      parsed.business_registration_number = parsed.business_registration_number.replace(/[^0-9]/g, '')
    }
    return NextResponse.json({ result: parsed })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('OCR error:', message)
    return NextResponse.json({ error: `OCR 처리 중 오류가 발생했습니다: ${message}` }, { status: 500 })
  }
}
