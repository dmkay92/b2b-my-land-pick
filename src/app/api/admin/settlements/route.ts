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

// GET — 정산 목록 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const statusFilter = request.nextUrl.searchParams.get('status') ?? 'pending'

  // 정산 목록 (settlement + request + agency/landco profiles)
  const { data: rawSettlements, error } = await admin
    .from('quote_settlements')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 관련 데이터 별도 조회
  const settlements = await Promise.all((rawSettlements ?? []).map(async (s) => {
    const { data: qr, error: qrErr } = await admin.from('quote_requests').select('id, display_id, event_name, depart_date, return_date, destination_country, destination_city, adults, children, infants, leaders, status, created_at').eq('id', s.request_id).maybeSingle()
    const { data: agency } = await admin.from('profiles').select('id, company_name, bank_name, bank_account, bank_holder').eq('id', s.agency_id).maybeSingle()
    const { data: landco } = await admin.from('profiles').select('id, company_name, business_registration_number, representative_name, bank_name, bank_account, bank_holder').eq('id', s.landco_id).maybeSingle()
    if (qrErr) console.error('[settlements] qr error:', s.request_id, qrErr.message)
    return { ...s, quote_requests: qr, agency, landco }
  }))

  // 결제 현황 요약 조회
  const requestIds = (settlements ?? []).map(s => s.request_id)

  let installmentsSummary: Record<string, { total: number; paid: number; count: number; paidCount: number }> = {}
  if (requestIds.length > 0) {
    const { data: schedules } = await admin
      .from('payment_schedules')
      .select('id, request_id')
      .in('request_id', requestIds)

    if (schedules && schedules.length > 0) {
      const scheduleIds = schedules.map(s => s.id)
      const scheduleToRequest = Object.fromEntries(schedules.map(s => [s.id, s.request_id]))

      const { data: installments } = await admin
        .from('payment_installments')
        .select('schedule_id, amount, paid_amount, status')
        .in('schedule_id', scheduleIds)
        .neq('status', 'cancelled')

      for (const inst of installments ?? []) {
        const reqId = scheduleToRequest[inst.schedule_id]
        if (!reqId) continue
        if (!installmentsSummary[reqId]) installmentsSummary[reqId] = { total: 0, paid: 0, count: 0, paidCount: 0 }
        installmentsSummary[reqId].total += inst.amount ?? 0
        installmentsSummary[reqId].paid += inst.paid_amount ?? 0
        installmentsSummary[reqId].count += 1
        if (inst.status === 'paid') installmentsSummary[reqId].paidCount += 1
      }
    }
  }

  // 공제 요약 조회
  let deductionSummary: Record<string, { total: number; count: number }> = {}
  if (requestIds.length > 0) {
    const { data: claims } = await admin
      .from('deduction_claims')
      .select('request_id, approved_amount, total_amount, status')
      .in('request_id', requestIds)
      .eq('status', 'approved')

    for (const c of claims ?? []) {
      if (!deductionSummary[c.request_id]) deductionSummary[c.request_id] = { total: 0, count: 0 }
      deductionSummary[c.request_id].total += c.approved_amount ?? c.total_amount ?? 0
      deductionSummary[c.request_id].count += 1
    }
  }

  // 상태 필터링
  let filtered = (settlements ?? []).map(s => ({
    ...s,
    paymentSummary: installmentsSummary[s.request_id] ?? { total: 0, paid: 0, count: 0, paidCount: 0 },
    deductionSummary: deductionSummary[s.request_id] ?? { total: 0, count: 0 },
  }))

  if (statusFilter && statusFilter !== 'all') {
    filtered = filtered.filter(s => s.settlement_status === statusFilter)
  }

  return NextResponse.json({ settlements: filtered })
}

// PATCH — 정산 상태 업데이트
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, status, memo } = await request.json() as { id: string; status?: string; memo?: string }
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const admin = getAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}

  if (status) {
    const validStatuses = ['pending', 'reviewing', 'confirmed', 'paid']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: '유효하지 않은 상태입니다.' }, { status: 400 })
    }
    updates.settlement_status = status

    if (status === 'confirmed') {
      updates.confirmed_at = new Date().toISOString()
    }
    if (status === 'paid') {
      updates.landco_paid_at = new Date().toISOString()
      updates.agency_paid_at = new Date().toISOString()
    }
  }

  if (memo !== undefined) {
    updates.memo = memo
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 })
  }

  const { error } = await admin.from('quote_settlements').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
