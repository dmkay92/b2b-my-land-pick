import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scheduleId, action } = await request.json() as { scheduleId: string; action: 'approve' | 'reject' }

  if (!scheduleId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'scheduleId와 action(approve/reject)이 필요합니다.' }, { status: 400 })
  }

  // 스케줄 조회
  const { data: schedule, error: scheduleError } = await supabase
    .from('payment_schedules').select('*, quote_requests!inner(agency_id)').eq('id', scheduleId).single()

  if (scheduleError || !schedule) {
    return NextResponse.json({ error: '결제 일정을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (schedule.template_type !== 'post_travel' || schedule.approval_status !== 'pending') {
    return NextResponse.json({ error: '승인 대기 상태가 아닙니다.' }, { status: 400 })
  }

  // 권한 확인: 해당 견적의 랜드사만 승인 가능
  const { data: selection } = await supabase
    .from('quote_selections').select('landco_id').eq('request_id', schedule.request_id).single()

  if (!selection || selection.landco_id !== user.id) {
    return NextResponse.json({ error: '승인 권한이 없습니다.' }, { status: 403 })
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  await supabase.from('payment_schedules')
    .update({ approval_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', scheduleId)

  // 여행사에 알림
  const agencyId = (schedule as Record<string, unknown>).quote_requests
    ? ((schedule as Record<string, unknown>).quote_requests as { agency_id: string }).agency_id
    : null

  if (agencyId) {
    const notifType = action === 'approve' ? 'post_travel_approved' : 'post_travel_rejected'
    await supabase.from('notifications').insert({
      user_id: agencyId,
      type: notifType,
      payload: { request_id: schedule.request_id, schedule_id: scheduleId },
    })
  }

  // 채팅방에 결과 메시지
  const { data: room } = await supabase
    .from('chat_rooms').select('id')
    .eq('request_id', schedule.request_id).eq('landco_id', user.id).maybeSingle()

  if (room) {
    const content = action === 'approve'
      ? '여행 후 정산 플랜을 승인했습니다. 결제 일정이 확정되었습니다.'
      : '여행 후 정산 플랜을 거부했습니다. 다른 결제 플랜을 선택해주세요.'

    await supabase.from('chat_messages').insert({
      room_id: room.id,
      sender_id: user.id,
      content,
      message_type: 'approval_result',
      metadata: { schedule_id: scheduleId, request_id: schedule.request_id, action },
    })
  }

  return NextResponse.json({ success: true, approval_status: newStatus })
}
