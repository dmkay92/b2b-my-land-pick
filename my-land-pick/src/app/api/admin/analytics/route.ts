import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from, to required' }, { status: 400 })

  // 기간 내 견적 요청
  let allRequests: { id: string; status: string; created_at: string; closed_at?: string | null }[] = []
  const reqRes = await admin.from('quote_requests').select('id, status, created_at, closed_at')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: true })
  if (reqRes.error) {
    const fallback = await admin.from('quote_requests').select('id, status, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: true })
    allRequests = (fallback.data ?? []).map(r => ({ ...r, closed_at: null }))
  } else {
    allRequests = reqRes.data ?? []
  }

  const totalRequests = allRequests.length
  const finalizedCount = allRequests.filter(r => r.status === 'finalized').length
  const closedCount = allRequests.filter(r => r.status === 'closed').length
  const conversionRate = totalRequests > 0 ? Math.round((finalizedCount / totalRequests) * 100) : 0
  const cancelRate = totalRequests > 0 ? Math.round((closedCount / totalRequests) * 100) : 0

  // finalized_at 조회
  const { data: selections } = await admin.from('quote_selections').select('request_id, finalized_at').not('finalized_at', 'is', null)
  const finalizedAtMap: Record<string, string> = {}
  for (const s of selections ?? []) { if (s.finalized_at) finalizedAtMap[s.request_id] = s.finalized_at }

  // 월별 그룹핑
  function monthLabel(dateStr: string): string {
    return dateStr.slice(0, 7) // YYYY-MM
  }
  function monthEnd(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m, 0)
    return `${ym}-${String(d.getDate()).padStart(2, '0')}T23:59:59`
  }

  // 기간 내 모든 월 수집
  const allMonths: string[] = []
  const startDate = new Date(from)
  const endDate = new Date(to)
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  while (cursor <= endDate) {
    allMonths.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }

  // 월별 체결률 매트릭스
  const conversionMatrix: {
    createdMonth: string
    total: number
    snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[]
  }[] = []

  for (const cm of allMonths) {
    const cmStart = `${cm}-01`
    const cmEndDate = new Date(Number(cm.split('-')[0]), Number(cm.split('-')[1]), 0)
    const cmEnd = `${cm}-${String(cmEndDate.getDate()).padStart(2, '0')}`
    const monthReqs = allRequests.filter(r => r.created_at?.slice(0, 10) >= cmStart && r.created_at?.slice(0, 10) <= cmEnd)

    const snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[] = []
    const cmIdx = allMonths.indexOf(cm)
    for (let j = cmIdx; j < allMonths.length; j++) {
      const om = allMonths[j]
      const now = new Date()
      const isCurrentMonth = om === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const cutoff = isCurrentMonth ? now.toISOString() : monthEnd(om)

      const finalized = monthReqs.filter(r => {
        const fAt = finalizedAtMap[r.id]
        return fAt && fAt <= cutoff
      }).length

      const closed = monthReqs.filter(r => {
        if (r.status !== 'closed') return false
        const cAt = r.closed_at
        if (cAt) return cAt <= cutoff
        return true
      }).length

      const rate = monthReqs.length > 0 ? Math.round((finalized / monthReqs.length) * 100) : 0
      snapshots.push({ observedMonth: om, finalized, closed, rate })
    }

    conversionMatrix.push({
      createdMonth: cm,
      total: monthReqs.length,
      snapshots,
    })
  }

  // 매출 (기간 내 생성된 견적의 정산, 취소 제외)
  const excludedIds = new Set(allRequests.filter(r => r.status === 'closed').map(r => r.id))
  const requestIds = allRequests.map(r => r.id)
  let settlements: { request_id: string; gmv: number; platform_fee: number; landco_quote_total: number; agency_commission: number; landco_payout: number; agency_payout: number }[] = []
  if (requestIds.length > 0) {
    const { data } = await admin.from('quote_settlements')
      .select('request_id, gmv, platform_fee, landco_quote_total, agency_commission, landco_payout, agency_payout')
      .in('request_id', requestIds)
    settlements = (data ?? []).filter(s => !excludedIds.has(s.request_id))
  }

  const revenue = {
    totalGmv: settlements.reduce((s, r) => s + (r.gmv ?? 0), 0),
    totalLandcoQuote: settlements.reduce((s, r) => s + (r.landco_quote_total ?? 0), 0),
    totalAgencyCommission: settlements.reduce((s, r) => s + (r.agency_commission ?? 0), 0),
    totalPlatformFee: settlements.reduce((s, r) => s + (r.platform_fee ?? 0), 0),
    totalLandcoPayout: settlements.reduce((s, r) => s + (r.landco_payout ?? 0), 0),
  }

  // 결제 통계 (기간 내 생성된 견적의 installment)
  let paymentStats = { paidCount: 0, paidTotal: 0, pendingCount: 0, pendingTotal: 0 }
  if (requestIds.length > 0) {
    const { data: schedules } = await admin.from('payment_schedules').select('id, request_id').in('request_id', requestIds)
    if (schedules && schedules.length > 0) {
      const scheduleIds = schedules.map(s => s.id)
      const { data: installments } = await admin.from('payment_installments').select('status, amount, paid_amount').in('schedule_id', scheduleIds)
      const paid = (installments ?? []).filter(i => i.status === 'paid')
      const pending = (installments ?? []).filter(i => i.status === 'pending' || i.status === 'overdue')
      paymentStats = {
        paidCount: paid.length,
        paidTotal: paid.reduce((s, i) => s + i.paid_amount, 0),
        pendingCount: pending.length,
        pendingTotal: pending.reduce((s, i) => s + i.amount, 0),
      }
    }
  }

  return NextResponse.json({
    period: { from, to },
    summary: { totalRequests, finalizedCount, closedCount, conversionRate, cancelRate },
    conversionMatrix,
    allMonths,
    revenue,
    paymentStats,
  })
}
