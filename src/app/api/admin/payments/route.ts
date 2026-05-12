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

// GET — 결제 회차 목록 (pending/overdue 우선, 전체도 볼 수 있게)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const statusFilter = request.nextUrl.searchParams.get('status') // 'pending' | 'paid' | 'all'

  let query = admin
    .from('payment_installments')
    .select(`
      *,
      payment_schedules!inner (
        request_id,
        total_amount,
        template_type,
        quote_requests!inner (
          display_id,
          event_name,
          agency_id,
          profiles!quote_requests_agency_id_fkey ( company_name )
        )
      )
    `)
    .order('due_date', { ascending: true })

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'pending') {
      query = query.in('status', ['pending', 'overdue'])
    } else {
      query = query.eq('status', statusFilter)
    }
  }

  const { data, error } = await query.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ installments: data ?? [] })
}

// PATCH — installment 상태 변경 (paid 처리)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { installmentId, action } = await request.json() as { installmentId: string; action: 'paid' | 'pending' }
  if (!installmentId || !['paid', 'pending'].includes(action)) {
    return NextResponse.json({ error: 'installmentId와 action(paid/pending)이 필요합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: inst } = await admin
    .from('payment_installments')
    .select('amount, status, request_id, schedule_id')
    .eq('id', installmentId)
    .single()
  if (!inst) return NextResponse.json({ error: '결제 회차를 찾을 수 없습니다.' }, { status: 404 })

  if (action === 'paid') {
    await admin.from('payment_installments').update({
      status: 'paid',
      paid_amount: inst.amount,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', installmentId)
  } else {
    await admin.from('payment_installments').update({
      status: 'pending',
      paid_amount: 0,
      paid_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', installmentId)
  }

  // Agency fee auto-transition: when action is 'paid', check if all regular
  // installments (rate > 0) for the request are now paid, and if so transition
  // settlement_ledger rows from 'accrued' to 'payable'.
  if (action === 'paid') {
    // 1. Resolve request_id — prefer column on installment, fall back to payment_schedules
    let requestId: string | null = inst.request_id ?? null

    if (!requestId && inst.schedule_id) {
      const { data: schedule } = await admin
        .from('payment_schedules')
        .select('request_id')
        .eq('id', inst.schedule_id)
        .single()
      requestId = schedule?.request_id ?? null
    }

    if (requestId) {
      // 2. Fetch all regular installments (rate > 0) for this request via their schedule
      const { data: allInstallments } = await admin
        .from('payment_installments')
        .select('id, status, rate')
        .eq('request_id', requestId)

      // Fall back: if request_id not on installments table, join via payment_schedules
      let regularInstallments = allInstallments?.filter((r) => (r.rate ?? 0) > 0) ?? []

      if (!allInstallments) {
        // request_id lives only on payment_schedules — fetch via schedule join
        const { data: scheduleRows } = await admin
          .from('payment_schedules')
          .select('id')
          .eq('request_id', requestId)

        const scheduleIds = scheduleRows?.map((s) => s.id) ?? []
        if (scheduleIds.length > 0) {
          const { data: instViaSchedule } = await admin
            .from('payment_installments')
            .select('id, status, rate')
            .in('schedule_id', scheduleIds)

          regularInstallments = instViaSchedule?.filter((r) => (r.rate ?? 0) > 0) ?? []
        }
      }

      // 3. If every regular installment is now paid, transition settlement_ledger
      const allPaid =
        regularInstallments.length > 0 &&
        regularInstallments.every((r) => r.status === 'paid' || r.id === installmentId)

      if (allPaid) {
        await admin
          .from('settlement_ledger')
          .update({ agency_payout_status: 'payable' })
          .eq('request_id', requestId)
          .eq('agency_payout_status', 'accrued')
      }
    }
  }

  return NextResponse.json({ success: true })
}
