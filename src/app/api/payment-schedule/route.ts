import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildInstallments } from '@/lib/payment/schedule'

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
  if (!requestId || templateType !== 'immediate') {
    return NextResponse.json({ error: 'Only immediate switch is allowed' }, { status: 400 })
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
    .from('quote_requests').select('depart_date').eq('id', requestId).single()

  await supabase.from('payment_installments').delete().eq('schedule_id', schedule.id)

  const newInstallments = buildInstallments('immediate', schedule.total_amount, qr!.depart_date)
  for (const inst of newInstallments) {
    await supabase.from('payment_installments').insert({
      schedule_id: schedule.id,
      ...inst,
    })
  }

  await supabase.from('payment_schedules')
    .update({ template_type: 'immediate', updated_at: new Date().toISOString() })
    .eq('id', schedule.id)

  return NextResponse.json({ success: true })
}
