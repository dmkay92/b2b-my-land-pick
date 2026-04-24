import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { buildInstallments, getDefaultTemplateType } from '@/lib/payment/schedule'
import { calculateTotalPeople } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  // admin client로 조회 (RLS 우회 — 인증은 위에서 완료)
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: schedule } = await admin
    .from('payment_schedules').select('*').eq('request_id', requestId).maybeSingle()
  if (!schedule) return NextResponse.json({ schedule: null, installments: [] })

  const { data: installments } = await admin
    .from('payment_installments').select('*')
    .eq('schedule_id', schedule.id).order('rate', { ascending: true })

  // 정산 데이터도 같이 반환
  const { data: settlement } = await admin
    .from('quote_settlements').select('landco_quote_total, agency_commission, gmv')
    .eq('request_id', requestId).maybeSingle()

  return NextResponse.json({ schedule, installments: installments ?? [], settlement })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, templateType } = await request.json()
  const validTypes = ['onetime', 'default', 'post_travel']
  if (!requestId || !validTypes.includes(templateType)) {
    return NextResponse.json({ error: 'Invalid templateType' }, { status: 400 })
  }

  const { data: schedule } = await supabase
    .from('payment_schedules').select('*').eq('request_id', requestId).single()
  if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

  const { data: installments } = await supabase
    .from('payment_installments').select('status')
    .eq('schedule_id', schedule.id)
  const hasPaid = (installments ?? []).some(i => i.status === 'paid' || i.status === 'partial')
  if (hasPaid) {
    return NextResponse.json({ error: '이미 결제가 진행된 스케줄은 변경할 수 없습니다.' }, { status: 400 })
  }

  const { data: qr } = await supabase
    .from('quote_requests').select('depart_date, return_date, adults, children, infants, leaders')
    .eq('id', requestId).single()

  // Determine target template type
  let targetType: import('@/lib/supabase/types').PaymentTemplateType
  if (templateType === 'onetime') {
    targetType = 'onetime'
  } else if (templateType === 'post_travel') {
    targetType = 'post_travel'
  } else {
    targetType = getDefaultTemplateType(calculateTotalPeople({
      adults: qr?.adults ?? 0, children: qr?.children ?? 0,
      infants: qr?.infants ?? 0, leaders: qr?.leaders ?? 0,
    }))
  }

  const approvalStatus = targetType === 'post_travel' ? 'pending' : 'approved'

  await supabase.from('payment_installments').delete().eq('schedule_id', schedule.id)

  const newInstallments = buildInstallments(targetType, schedule.total_amount, qr!.depart_date, qr!.return_date)
  for (const inst of newInstallments) {
    await supabase.from('payment_installments').insert({
      schedule_id: schedule.id,
      ...inst,
    })
  }

  await supabase.from('payment_schedules')
    .update({ template_type: targetType, approval_status: approvalStatus, updated_at: new Date().toISOString() })
    .eq('id', schedule.id)

  // post_travel: 랜드사에 승인 요청 알림 + 채팅 메시지
  if (targetType === 'post_travel') {
    // 견적 선택 정보에서 랜드사 ID 조회
    const { data: selection } = await supabase
      .from('quote_selections').select('landco_id').eq('request_id', requestId).single()

    if (selection) {
      // 알림 생성
      await supabase.from('notifications').insert({
        user_id: selection.landco_id,
        type: 'post_travel_approval_request',
        payload: { request_id: requestId, schedule_id: schedule.id },
      })

      // 채팅방 찾기 + 시스템 메시지 발송
      const { data: room } = await supabase
        .from('chat_rooms').select('id')
        .eq('request_id', requestId).eq('landco_id', selection.landco_id).maybeSingle()

      if (room) {
        await supabase.from('messages').insert({
          room_id: room.id,
          sender_id: user.id,
          content: '여행 후 정산 플랜 승인을 요청했습니다. (계약금 10% + 중도금 40% + 잔금 50% 귀국 후 30일)',
          message_type: 'approval_request',
          metadata: { schedule_id: schedule.id, request_id: requestId },
        })
      }
    }
  }

  return NextResponse.json({ success: true })
}
