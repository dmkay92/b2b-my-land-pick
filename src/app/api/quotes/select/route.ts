import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSelectedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // agency 역할만 견적 선택 가능
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'agency') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { requestId, landcoId, quoteId } = await request.json()
  if (!requestId || !landcoId || !quoteId) {
    return NextResponse.json({ error: 'requestId, landcoId, quoteId required' }, { status: 400 })
  }

  // 요청 소유자 확인
  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id, event_name').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // quoteId가 해당 requestId + landcoId 소속인지 검증
  const { data: quote } = await supabase
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('request_id', requestId)
    .eq('landco_id', landcoId)
    .single()
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  // 기존 선택된 quote가 있으면 상태를 submitted로 되돌림
  const { data: existing } = await supabase
    .from('quote_selections')
    .select('selected_quote_id')
    .eq('request_id', requestId)
    .maybeSingle()
  if (existing?.selected_quote_id && existing.selected_quote_id !== quoteId) {
    await supabase.from('quotes')
      .update({ status: 'submitted' })
      .eq('id', existing.selected_quote_id)
  }

  // quote_selections upsert
  const { error: selError } = await supabase
    .from('quote_selections')
    .upsert(
      { request_id: requestId, selected_quote_id: quoteId, landco_id: landcoId },
      { onConflict: 'request_id' }
    )

  if (selError) return NextResponse.json({ error: selError.message }, { status: 500 })

  // quote status 업데이트
  await supabase.from('quotes')
    .update({ status: 'selected' })
    .eq('id', quoteId)

  // quote_requests 상태 유지 (in_progress)
  await supabase.from('quote_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)

  // 랜드사에게 인앱 알림 생성
  await supabase.from('notifications').insert({
    user_id: landcoId,
    type: 'quote_selected',
    payload: { request_id: requestId, event_name: qr?.event_name },
  })

  // 이메일 알림
  const { data: landco } = await supabase
    .from('profiles').select('email, company_name').eq('id', landcoId).single()
  if (landco) {
    await sendQuoteSelectedEmail({
      to: landco.email,
      company_name: landco.company_name,
      event_name: qr?.event_name ?? '',
      request_id: requestId,
    })
  }

  return NextResponse.json({ success: true })
}
