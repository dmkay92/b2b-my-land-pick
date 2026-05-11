import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  const status = request.nextUrl.searchParams.get('status')

  const admin = getAdmin()

  if (status) {
    // Admin: fetch claims by status (or all)
    let query = admin
      .from('deduction_claims')
      .select('*, quote_requests!inner(event_name, display_id, agency_id)')
      .order('created_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)

    const { data } = await query
    return NextResponse.json({ claims: data ?? [] })
  }

  if (!requestId) {
    // No filter — return all (for admin)
    const { data } = await admin
      .from('deduction_claims')
      .select('*, quote_requests!inner(event_name, display_id, agency_id)')
      .order('created_at', { ascending: false })

    return NextResponse.json({ claims: data ?? [] })
  }

  const { data } = await admin
    .from('deduction_claims')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ claims: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, items, memo, receiptUrls } = await request.json() as {
    requestId: string
    items: { name: string; amount: number }[]
    memo?: string
    receiptUrls?: string[]
  }

  if (!requestId || !items || items.length === 0) {
    return NextResponse.json({ error: 'requestId와 항목이 필요합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: qr } = await admin
    .from('quote_requests').select('status, agency_id, event_name').eq('id', requestId).single()
  if (qr?.status !== 'closed') {
    return NextResponse.json({ error: '취소된 행사에서만 공제 신청이 가능합니다.' }, { status: 400 })
  }

  const { data: sel } = await admin
    .from('quote_selections').select('landco_id').eq('request_id', requestId).single()
  if (!sel || sel.landco_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  // 결제 미이행 취소: 결제완료액이 0원이면 공제 신청 불가
  const { data: installments } = await admin
    .from('payment_installments').select('paid_amount')
    .eq('request_id', requestId)
  const paidTotal = (installments ?? []).reduce((sum, i) => sum + (i.paid_amount ?? 0), 0)
  if (paidTotal === 0) {
    return NextResponse.json({ error: '결제 확정 전 취소 건은 공제 신청이 불가합니다.' }, { status: 400 })
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  const { data: claim, error: insertError } = await admin
    .from('deduction_claims')
    .insert({
      request_id: requestId,
      landco_id: user.id,
      items,
      memo: memo || null,
      receipt_urls: receiptUrls ?? [],
      total_amount: totalAmount,
    })
    .select().single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Notify all admins
  const { data: admins } = await admin
    .from('profiles').select('id').eq('role', 'admin')
  if (admins) {
    const notifications = admins.map(a => ({
      user_id: a.id,
      type: 'deduction_claim_request',
      payload: { request_id: requestId, claim_id: claim.id, event_name: qr.event_name },
    }))
    await admin.from('notifications').insert(notifications)
  }

  // Notify agency
  await admin.from('notifications').insert({
    user_id: qr.agency_id,
    type: 'deduction_claim_request',
    payload: { request_id: requestId, claim_id: claim.id, event_name: qr.event_name },
  })

  // Send chat message to agency
  let { data: room } = await admin
    .from('chat_rooms').select('id')
    .eq('request_id', requestId).eq('landco_id', user.id).maybeSingle()

  if (!room) {
    const { data: newRoom } = await admin
      .from('chat_rooms')
      .upsert({ request_id: requestId, agency_id: qr.agency_id, landco_id: user.id }, { onConflict: 'request_id,landco_id' })
      .select('id').single()
    room = newRoom
  }

  if (room) {
    const itemSummary = items.map(i => i.name).join(', ')
    await admin.from('messages').insert({
      room_id: room.id,
      sender_id: user.id,
      content: `공제 신청을 요청했습니다. (${items.length}건, 총 ${totalAmount.toLocaleString('ko-KR')}원 — ${itemSummary})`,
      message_type: 'deduction_claim',
      metadata: { claim_id: claim.id, request_id: requestId },
    })
  }

  return NextResponse.json({ claim }, { status: 201 })
}
