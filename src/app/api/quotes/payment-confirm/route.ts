// src/app/api/quotes/payment-confirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendFinalizedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, memo } = await request.json()
  if (!requestId) {
    return NextResponse.json({ error: 'requestId required' }, { status: 400 })
  }

  // 랜드사 역할 확인
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'landco') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 요청 상태 확인
  const { data: qr } = await admin
    .from('quote_requests').select('status, agency_id, event_name').eq('id', requestId).single()
  if (!qr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (qr.status !== 'payment_pending') {
    return NextResponse.json({ error: 'Not in payment_pending state' }, { status: 409 })
  }

  // 이 랜드사가 선택된 견적인지 확인
  const { data: selection } = await admin
    .from('quote_selections')
    .select('selected_quote_id, landco_id')
    .eq('request_id', requestId)
    .single()
  if (!selection || selection.landco_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date().toISOString()

  // 결제 확인 처리
  await admin.from('quote_selections').update({
    finalized_at: now,
    payment_memo: memo ?? null,
  }).eq('request_id', requestId)

  await admin.from('quotes').update({ status: 'finalized' }).eq('id', selection.selected_quote_id)

  await admin.from('quote_requests').update({ status: 'finalized' }).eq('id', requestId)

  // 여행사 알림
  await admin.from('notifications').insert({
    user_id: qr.agency_id,
    type: 'quote_finalized',
    payload: { request_id: requestId, event_name: qr.event_name },
  })

  // 여행사 이메일
  const { data: agency } = await admin
    .from('profiles').select('email, company_name').eq('id', qr.agency_id).single()
  if (agency) {
    await sendFinalizedEmail({
      to: agency.email,
      company_name: agency.company_name,
      event_name: qr.event_name ?? '',
    })
  }

  return NextResponse.json({ success: true })
}
