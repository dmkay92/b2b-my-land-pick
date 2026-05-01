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
