import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { brn } = await request.json()

  if (!brn || typeof brn !== 'string') {
    return NextResponse.json({ error: 'brn required' }, { status: 400 })
  }

  const clean = brn.replace(/[^0-9]/g, '')
  if (clean.length !== 10) {
    return NextResponse.json({ valid: false, message: '사업자등록번호는 10자리입니다.' })
  }

  // 이미 가입된 사업자번호인지 확인
  const serviceClient = await createServiceClient()
  const { data: existing } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('business_registration_number', clean)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ valid: false, message: '이미 가입된 사업자입니다. 로그인하거나 관리자에게 문의해주세요.' })
  }

  const serviceKey = process.env.NTS_SERVICE_KEY
  if (!serviceKey) {
    // NTS API key 없을 때 mock: 10자리이면 유효로 처리
    return NextResponse.json({ valid: true, message: '(검증 생략: API 키 미설정)' })
  }

  try {
    const res = await fetch(
      `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(serviceKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ b_no: [clean] }),
      }
    )
    const data = await res.json()
    const item = data?.data?.[0]
    if (!item) {
      return NextResponse.json({ valid: false, message: '사업자 정보를 조회할 수 없습니다.' })
    }
    // b_stt_cd: '01' = 계속사업자, '02' = 휴업, '03' = 폐업
    const valid = item.b_stt_cd === '01'
    return NextResponse.json({
      valid,
      message: valid ? '정상 사업자입니다.' : `사업자 상태: ${item.b_stt ?? '확인 불가'}`,
    })
  } catch (err) {
    console.error('BRN validation error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ valid: false, message: '사업자번호 검증 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
