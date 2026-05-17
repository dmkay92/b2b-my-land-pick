import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendCancellationEmail } from '@/lib/email/notifications'
import { decryptField } from '@/lib/privacy'

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
  const admin = getAdmin()

  // 요청 조회
  const { data: qr } = await admin
    .from('quote_requests').select('agency_id, event_name, status, depart_date').eq('id', id).single()
  if (!qr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (qr.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (qr.status !== 'payment_pending' && qr.status !== 'finalized') {
    return NextResponse.json({ error: '취소할 수 없는 상태입니다.' }, { status: 400 })
  }

  // 환불 비율 계산
  const today = new Date()
  const departDate = new Date(qr.depart_date)
  const daysUntilDepart = Math.ceil((departDate.getTime() - today.getTime()) / 86400000)

  let refundRate: number
  let refundPolicy: string
  if (daysUntilDepart >= 7) {
    refundRate = 100
    refundPolicy = '출발 7일 이전: 견적가의 100% 환불 (실비 및 취소 수수료 공제)'
  } else if (daysUntilDepart >= 1) {
    refundRate = 50
    refundPolicy = '출발 1~6일 이전: 견적가의 50% 환불 (실비 초과분 추가 공제 가능)'
  } else {
    refundRate = 0
    refundPolicy = '출발 당일 또는 노쇼: 환불 불가'
  }

  // 상태 변경 → closed
  await admin.from('quote_requests').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id)

  // 결제 회차 중 미결제 건 취소 처리
  const { data: schedule } = await admin.from('payment_schedules').select('id').eq('request_id', id).single()
  if (schedule) {
    await admin.from('payment_installments')
      .update({ status: 'cancelled' })
      .eq('schedule_id', schedule.id)
      .in('status', ['pending', 'overdue'])
  }

  // 선택된 랜드사 조회
  const { data: sel } = await admin.from('quote_selections').select('landco_id').eq('request_id', id).single()

  // Admin 알림
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
  for (const a of (admins ?? [])) {
    await admin.from('notifications').insert({
      user_id: a.id,
      type: 'refund_request',
      payload: { request_id: id, event_name: qr.event_name, refund_rate: refundRate, days_until_depart: daysUntilDepart },
    })
  }

  // 랜드사 알림
  if (sel) {
    await admin.from('notifications').insert({
      user_id: sel.landco_id,
      type: 'refund_request',
      payload: { request_id: id, event_name: qr.event_name, refund_rate: refundRate },
    })

    // 랜드사에게 취소 이메일 발송
    const { data: landcoProfile } = await admin
      .from('profiles').select('email').eq('id', sel.landco_id).single()
    if (landcoProfile?.email) {
      const decryptedEmail = await decryptField(landcoProfile.email)
      await sendCancellationEmail({
        to: decryptedEmail,
        event_name: qr.event_name,
        request_id: id,
        refund_rate: refundRate,
      })
    }

    // 채팅 메시지
    let { data: room } = await admin
      .from('chat_rooms').select('id')
      .eq('request_id', id).eq('landco_id', sel.landco_id).maybeSingle()

    if (!room) {
      const { data: newRoom } = await admin
        .from('chat_rooms')
        .upsert({ request_id: id, agency_id: user.id, landco_id: sel.landco_id }, { onConflict: 'request_id,landco_id' })
        .select('id').single()
      room = newRoom
    }

    if (room) {
      await admin.from('messages').insert({
        room_id: room.id,
        sender_id: user.id,
        content: `행사 취소 및 환불이 요청되었습니다. (환불 비율: ${refundRate}%, ${refundPolicy})`,
        message_type: 'refund_request',
      })
    }
  }

  return NextResponse.json({ success: true, refundRate, refundPolicy, daysUntilDepart })
}
