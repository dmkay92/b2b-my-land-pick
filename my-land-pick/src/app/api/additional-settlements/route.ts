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
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const admin = getAdmin()
  const { data } = await admin
    .from('additional_settlements')
    .select('*')
    .eq('request_id', requestId)
    .order('sequence_number', { ascending: true })

  return NextResponse.json({ settlements: data ?? [] })
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
  if (qr?.status !== 'finalized') {
    return NextResponse.json({ error: '여행 확정 상태에서만 추가 정산을 요청할 수 있습니다.' }, { status: 400 })
  }

  const { data: sel } = await admin
    .from('quote_selections').select('landco_id').eq('request_id', requestId).single()
  if (!sel || sel.landco_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { data: existing } = await admin
    .from('additional_settlements').select('sequence_number')
    .eq('request_id', requestId).order('sequence_number', { ascending: false }).limit(1)
  const nextSeq = existing && existing.length > 0 ? existing[0].sequence_number + 1 : 1

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  const { data: settlement, error: insertError } = await admin
    .from('additional_settlements')
    .insert({
      request_id: requestId,
      landco_id: user.id,
      sequence_number: nextSeq,
      items,
      memo: memo || null,
      receipt_urls: receiptUrls ?? [],
      total_amount: totalAmount,
    })
    .select().single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await admin.from('notifications').insert({
    user_id: qr.agency_id,
    type: 'additional_settlement_request',
    payload: { request_id: requestId, settlement_id: settlement.id, event_name: qr.event_name },
  })

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

  console.log('[additional-settlement] room:', room?.id, 'user:', user.id)
  if (room) {
    const itemSummary = items.map(i => i.name).join(', ')
    const { error: msgErr } = await admin.from('messages').insert({
      room_id: room.id,
      sender_id: user.id,
      content: `추가 정산을 요청했습니다. (${items.length}건, 총 ${totalAmount.toLocaleString('ko-KR')}원 — ${itemSummary})`,
      message_type: 'additional_settlement',
      metadata: { settlement_id: settlement.id, request_id: requestId },
    })
    if (msgErr) console.error('[additional-settlement] msg insert error:', msgErr)
  } else {
    console.error('[additional-settlement] no room found or created')
  }

  return NextResponse.json({ settlement }, { status: 201 })
}
