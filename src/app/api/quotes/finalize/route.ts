import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFinalizedEmail } from '@/lib/email/notifications'
import { decryptField } from '@/lib/privacy'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId } = await request.json()
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id, event_name').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: selection } = await supabase
    .from('quote_selections').select('*').eq('request_id', requestId).single()
  if (!selection) return NextResponse.json({ error: 'No selection found' }, { status: 400 })
  if (selection.finalized_at) return NextResponse.json({ error: 'Already finalized' }, { status: 409 })

  // 최종 확정 처리
  await supabase.from('quote_selections')
    .update({ finalized_at: new Date().toISOString() })
    .eq('request_id', requestId)

  await supabase.from('quotes')
    .update({ status: 'finalized' })
    .eq('id', selection.selected_quote_id)

  await supabase.from('quote_requests')
    .update({ status: 'finalized' })
    .eq('id', requestId)

  // 랜드사 인앱 알림
  await supabase.from('notifications').insert({
    user_id: selection.landco_id,
    type: 'quote_finalized',
    payload: { request_id: requestId, event_name: qr?.event_name },
  })

  // 여행사에게 최종 확정 이메일 알림
  const { data: agency } = await supabase
    .from('profiles').select('email').eq('id', user.id).single()
  if (agency?.email) {
    const decryptedEmail = await decryptField(agency.email)
    await sendFinalizedEmail({
      to: decryptedEmail,
      event_name: qr?.event_name ?? '',
      request_id: requestId,
    })
  }

  return NextResponse.json({ success: true })
}
