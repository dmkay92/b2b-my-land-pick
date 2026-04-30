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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action } = await request.json() as { action: 'approve' | 'reject' }

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action은 approve 또는 reject이어야 합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: settlement } = await admin
    .from('additional_settlements').select('*').eq('id', id).single()
  if (!settlement) return NextResponse.json({ error: '추가 정산을 찾을 수 없습니다.' }, { status: 404 })
  if (settlement.status !== 'pending') {
    return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 })
  }

  const { data: qr } = await admin
    .from('quote_requests').select('agency_id, event_name').eq('id', settlement.request_id).single()
  if (qr?.agency_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  await admin.from('additional_settlements').update({
    status: newStatus,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)

  if (action === 'approve') {
    const { data: schedule } = await admin
      .from('payment_schedules').select('id, total_amount').eq('request_id', settlement.request_id).single()

    if (schedule) {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 14)

      await admin.from('payment_installments').insert({
        schedule_id: schedule.id,
        label: `추가 정산 #${settlement.sequence_number}`,
        rate: 0,
        amount: settlement.total_amount,
        paid_amount: 0,
        due_date: dueDate.toISOString().slice(0, 10),
        status: 'pending',
      })

      await admin.from('payment_schedules').update({
        total_amount: schedule.total_amount + settlement.total_amount,
        updated_at: new Date().toISOString(),
      }).eq('id', schedule.id)
    }
  }

  const notifType = action === 'approve' ? 'additional_settlement_approved' : 'additional_settlement_rejected'
  await admin.from('notifications').insert({
    user_id: settlement.landco_id,
    type: notifType,
    payload: { request_id: settlement.request_id, settlement_id: id, event_name: qr?.event_name },
  })

  const { data: room } = await admin
    .from('chat_rooms').select('id')
    .eq('request_id', settlement.request_id).eq('landco_id', settlement.landco_id).maybeSingle()

  if (room) {
    const content = action === 'approve'
      ? `추가 정산 #${settlement.sequence_number}이 승인되었습니다. (총 ${Number(settlement.total_amount).toLocaleString('ko-KR')}원)`
      : `추가 정산 #${settlement.sequence_number}이 거부되었습니다.`

    await admin.from('messages').insert({
      room_id: room.id,
      sender_id: user.id,
      content,
      message_type: action === 'approve' ? 'additional_settlement_approved' : 'additional_settlement_rejected',
      metadata: { settlement_id: id, request_id: settlement.request_id },
    })
  }

  return NextResponse.json({ success: true, status: newStatus })
}
