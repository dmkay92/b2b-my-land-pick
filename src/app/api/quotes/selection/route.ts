import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  // 요청 소유자(여행사) 또는 선택된 랜드사만 조회 가능
  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id').eq('id', requestId).single()
  if (!qr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const isAgencyOwner = qr.agency_id === user.id
  const isAdmin = profile?.role === 'admin'

  // 랜드사인 경우: 본인이 선택된 랜드사인지 확인
  let isSelectedLandco = false
  if (profile?.role === 'landco') {
    const { data: sel } = await supabase
      .from('quote_selections')
      .select('landco_id')
      .eq('request_id', requestId)
      .maybeSingle()
    isSelectedLandco = sel?.landco_id === user.id
  }

  if (!isAgencyOwner && !isAdmin && !isSelectedLandco) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: selection } = await supabase
    .from('quote_selections')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle()

  return NextResponse.json({ selection: selection ?? null })
}
