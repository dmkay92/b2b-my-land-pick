import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSelectedEmail, sendFinalizedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, quoteId, landcoId } = await request.json()
  if (!requestId || !quoteId || !landcoId) {
    return NextResponse.json({ error: 'requestId, quoteId, landcoId required' }, { status: 400 })
  }

  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id, event_name').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 이미 확정된 경우 차단
  const { data: existing } = await supabase
    .from('quote_selections').select('finalized_at').eq('request_id', requestId).single()
  if (existing?.finalized_at) return NextResponse.json({ error: 'Already finalized' }, { status: 409 })

  const now = new Date().toISOString()

  // 선택 + 즉시 확정 (upsert)
  await supabase.from('quote_selections').upsert({
    request_id: requestId,
    selected_quote_id: quoteId,
    landco_id: landcoId,
    finalized_at: now,
  }, { onConflict: 'request_id' })

  // 선택된 견적서 상태 업데이트
  await supabase.from('quotes').update({ status: 'finalized' }).eq('id', quoteId)

  // 요청 상태 finalized로 업데이트
  await supabase.from('quote_requests').update({ status: 'finalized' }).eq('id', requestId)

  // 랜드사 알림
  await supabase.from('notifications').insert({
    user_id: landcoId,
    type: 'quote_finalized',
    payload: { request_id: requestId, event_name: qr?.event_name },
  })

  const { data: landco } = await supabase
    .from('profiles').select('email, company_name').eq('id', landcoId).single()
  if (landco) {
    await sendQuoteSelectedEmail({ to: landco.email, company_name: landco.company_name, event_name: qr?.event_name ?? '', request_id: requestId })
    await sendFinalizedEmail({ to: landco.email, company_name: landco.company_name, event_name: qr?.event_name ?? '' })
  }

  return NextResponse.json({ success: true })
}
