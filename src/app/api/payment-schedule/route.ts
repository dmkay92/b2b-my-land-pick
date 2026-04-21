import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildInstallments, getDefaultTemplateType } from '@/lib/payment/schedule'
import { calculateTotalPeople } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const { data: schedule } = await supabase
    .from('payment_schedules').select('*').eq('request_id', requestId).maybeSingle()
  if (!schedule) return NextResponse.json({ schedule: null, installments: [] })

  const { data: installments } = await supabase
    .from('payment_installments').select('*')
    .eq('schedule_id', schedule.id).order('rate', { ascending: true })

  return NextResponse.json({ schedule, installments: installments ?? [] })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, templateType } = await request.json()
  const validTypes = ['immediate', 'default']
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
    .from('quote_requests').select('depart_date, adults, children, infants, leaders')
    .eq('id', requestId).single()

  // Determine target template type
  const targetType = templateType === 'immediate'
    ? 'immediate' as const
    : getDefaultTemplateType(calculateTotalPeople({
        adults: qr?.adults ?? 0, children: qr?.children ?? 0,
        infants: qr?.infants ?? 0, leaders: qr?.leaders ?? 0,
      }))

  await supabase.from('payment_installments').delete().eq('schedule_id', schedule.id)

  const newInstallments = buildInstallments(targetType, schedule.total_amount, qr!.depart_date)
  for (const inst of newInstallments) {
    await supabase.from('payment_installments').insert({
      schedule_id: schedule.id,
      ...inst,
    })
  }

  await supabase.from('payment_schedules')
    .update({ template_type: targetType, updated_at: new Date().toISOString() })
    .eq('id', schedule.id)

  return NextResponse.json({ success: true })
}
