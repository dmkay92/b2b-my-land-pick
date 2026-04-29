import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 권한 확인: 해당 견적의 선택된 랜드사만 취소 가능
  const { data: selection } = await admin
    .from('quote_selections').select('landco_id').eq('request_id', id).single()

  if (!selection || selection.landco_id !== user.id) {
    return NextResponse.json({ error: '취소 권한이 없습니다.' }, { status: 403 })
  }

  // overdue 회차가 있는지 확인
  const { data: schedule } = await admin
    .from('payment_schedules').select('id').eq('request_id', id).single()

  if (schedule) {
    const { data: installments } = await admin
      .from('payment_installments').select('status').eq('schedule_id', schedule.id)

    const hasOverdue = (installments ?? []).some(i => i.status === 'overdue')
    if (!hasOverdue) {
      return NextResponse.json({ error: '기한초과된 결제 회차가 없어 취소할 수 없습니다.' }, { status: 400 })
    }
  }

  // 1. quote_requests status → cancelled
  await admin.from('quote_requests').update({ status: 'closed' }).eq('id', id)

  // 2. 선택된 견적 status → rejected
  const { data: selectedQuote } = await admin
    .from('quote_selections').select('selected_quote_id').eq('request_id', id).single()
  if (selectedQuote) {
    await admin.from('quotes').update({ status: 'rejected' }).eq('id', selectedQuote.selected_quote_id)
  }

  // 3. 미결제 회차 cancelled 처리
  if (schedule) {
    await admin.from('payment_installments')
      .update({ status: 'cancelled' })
      .eq('schedule_id', schedule.id)
      .in('status', ['pending', 'overdue'])
  }

  // 4. 여행사에 알림
  const { data: qr } = await admin
    .from('quote_requests').select('agency_id, event_name').eq('id', id).single()

  if (qr) {
    await admin.from('notifications').insert({
      user_id: qr.agency_id,
      type: 'landco_cancelled',
      payload: { request_id: id, event_name: qr.event_name },
    })

    // 5. 채팅 메시지
    const { data: room } = await admin
      .from('chat_rooms').select('id')
      .eq('request_id', id).eq('landco_id', user.id).maybeSingle()

    if (room) {
      await admin.from('messages').insert({
        room_id: room.id,
        sender_id: user.id,
        content: '결제 미이행으로 행사가 취소되었습니다.',
        message_type: 'system',
      })
    }
  }

  return NextResponse.json({ success: true })
}
