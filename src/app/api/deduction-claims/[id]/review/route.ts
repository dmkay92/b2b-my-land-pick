import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateDisplayId } from '@/lib/display-id'

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
  const { action, approvedAmount } = await request.json() as {
    action: 'approve' | 'reject'
    approvedAmount?: number
  }

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action은 approve 또는 reject이어야 합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  // Verify admin role
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 검토할 수 있습니다.' }, { status: 403 })
  }

  const { data: claim } = await admin
    .from('deduction_claims').select('*').eq('id', id).single()
  if (!claim) return NextResponse.json({ error: '공제 신청을 찾을 수 없습니다.' }, { status: 404 })
  if (claim.status !== 'pending') {
    return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 })
  }

  const { data: qr } = await admin
    .from('quote_requests').select('agency_id, event_name').eq('id', claim.request_id).single()

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  const updateData: Record<string, unknown> = {
    status: newStatus,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }
  if (action === 'approve') {
    updateData.approved_amount = approvedAmount ?? claim.total_amount
  }

  await admin.from('deduction_claims').update(updateData).eq('id', id)

  // 승인 시: 전체 공제액이 결제완료액 초과하면 추가 청구 installment 생성/갱신
  if (action === 'approve') {
    const { data: allClaims } = await admin.from('deduction_claims').select('approved_amount, total_amount')
      .eq('request_id', claim.request_id).eq('status', 'approved')
    const totalDeduction = (allClaims ?? []).reduce((s: number, c: { approved_amount: number | null; total_amount: number }) => s + (c.approved_amount ?? c.total_amount), 0)

    const { data: schedule } = await admin.from('payment_schedules').select('id').eq('request_id', claim.request_id).single()
    if (schedule) {
      const { data: installments } = await admin.from('payment_installments').select('paid_amount').eq('schedule_id', schedule.id)
      const paidTotal = (installments ?? []).reduce((s: number, i: { paid_amount: number }) => s + i.paid_amount, 0)

      const excess = totalDeduction - paidTotal
      if (excess > 0) {
        // 기존 공제 추가 청구 installment가 있으면 업데이트, 없으면 생성
        const { data: existing } = await admin.from('payment_installments').select('id')
          .eq('schedule_id', schedule.id).eq('label', '공제 추가 청구').maybeSingle()

        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + 14)

        if (existing) {
          await admin.from('payment_installments').update({
            amount: excess, due_date: dueDate.toISOString().slice(0, 10), status: 'pending', updated_at: new Date().toISOString(),
          }).eq('id', existing.id)
        } else {
          const instDisplayId = await generateDisplayId(admin, 'PIN')
          await admin.from('payment_installments').insert({
            schedule_id: schedule.id, label: '공제 추가 청구', rate: 0,
            amount: excess, paid_amount: 0, due_date: dueDate.toISOString().slice(0, 10), status: 'pending',
            display_id: instDisplayId,
          })
        }
      }
    }
  }

  // Notify landco
  const notifType = action === 'approve' ? 'deduction_claim_approved' : 'deduction_claim_rejected'
  await admin.from('notifications').insert({
    user_id: claim.landco_id,
    type: notifType,
    payload: { request_id: claim.request_id, claim_id: id, event_name: qr?.event_name },
  })

  // Notify agency
  if (qr?.agency_id) {
    await admin.from('notifications').insert({
      user_id: qr.agency_id,
      type: notifType,
      payload: { request_id: claim.request_id, claim_id: id, event_name: qr.event_name },
    })
  }

  // Send chat message
  const { data: room } = await admin
    .from('chat_rooms').select('id')
    .eq('request_id', claim.request_id).eq('landco_id', claim.landco_id).maybeSingle()

  if (room) {
    const finalAmount = action === 'approve' ? (approvedAmount ?? claim.total_amount) : 0
    const content = action === 'approve'
      ? `공제 신청이 승인되었습니다. (승인 금액: ${Number(finalAmount).toLocaleString('ko-KR')}원)`
      : `공제 신청이 거부되었습니다.`

    await admin.from('messages').insert({
      room_id: room.id,
      sender_id: user.id,
      content,
      message_type: 'deduction_claim_result',
      metadata: { claim_id: id, request_id: claim.request_id, action },
    })
  }

  return NextResponse.json({ success: true, status: newStatus })
}
