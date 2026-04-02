import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSelectedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, quoteId, landcoId } = await request.json()
  if (!requestId || !quoteId || !landcoId) {
    return NextResponse.json({ error: 'requestId, quoteId, landcoId required' }, { status: 400 })
  }

  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id, event_name, status').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 이미 입금대기 또는 확정된 경우 차단
  if (qr?.status === 'payment_pending' || qr?.status === 'finalized') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 409 })
  }

  // 선택 기록 저장 (finalized_at은 null — 랜드사 입금확인 후 설정)
  await supabase.from('quote_selections').upsert({
    request_id: requestId,
    selected_quote_id: quoteId,
    landco_id: landcoId,
    finalized_at: null,
  }, { onConflict: 'request_id' })

  // 선택된 견적서 상태: selected
  await supabase.from('quotes').update({ status: 'selected' }).eq('id', quoteId)

  // 요청 상태: payment_pending
  await supabase.from('quote_requests').update({ status: 'payment_pending' }).eq('id', requestId)

  // 랜드사 알림 (선택됨)
  await supabase.from('notifications').insert({
    user_id: landcoId,
    type: 'quote_selected',
    payload: { request_id: requestId, event_name: qr?.event_name },
  })

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
