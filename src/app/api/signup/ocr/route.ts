import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const BIZ_PROMPT = `이 이미지는 한국 사업자등록증입니다. 다음 정보를 JSON으로 추출해주세요:
{
  "business_registration_number": "사업자등록번호 (숫자 10자리, 하이픈 없이)",
  "company_name": "상호(법인명)",
  "representative_name": "대표자 성명"
}
찾을 수 없는 필드는 빈 문자열("")로 반환하세요. JSON만 반환하고 다른 텍스트는 포함하지 마세요.`

const BANK_PROMPT = `이 이미지는 한국 통장 사본입니다. 다음 정보를 JSON으로 추출해주세요:
{
  "bank_name": "은행명 (예: 국민은행, 신한은행)",
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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      type === 'biz' ? BIZ_PROMPT : BANK_PROMPT,
    ])

    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'OCR 결과를 파싱할 수 없습니다.' }, { status: 422 })
    }
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({ result: parsed })
  } catch (err) {
    console.error('OCR error:', err)
    return NextResponse.json({ error: 'OCR 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
