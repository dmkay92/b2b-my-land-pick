import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'agency') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

  // ── 견적 요청 통계 (agency 소유 건만) ──
  let allRequests: { id: string; status: string; created_at: string; closed_at?: string | null }[] | null = null
  const reqRes = await admin.from('quote_requests').select('id, status, created_at, closed_at').eq('agency_id', user.id)
  if (reqRes.error) {
    const fallback = await admin.from('quote_requests').select('id, status, created_at').eq('agency_id', user.id)
    allRequests = (fallback.data ?? []).map(r => ({ ...r, closed_at: null }))
  } else {
    allRequests = reqRes.data
  }
  const requests = allRequests ?? []
  const totalRequests = requests.length
  const thisMonthRequests = requests.filter(r => r.created_at?.slice(0, 10) >= monthStart).length
  const lastMonthRequests = requests.filter(r => r.created_at?.slice(0, 10) >= lastMonthStart && r.created_at?.slice(0, 10) <= lastMonthEnd).length

  // 상태별 카운트
  const openCount = requests.filter(r => r.status === 'open').length
  const inProgressCount = requests.filter(r => r.status === 'in_progress').length
  const paymentPendingCount = requests.filter(r => r.status === 'payment_pending').length
  const finalizedCount = requests.filter(r => r.status === 'finalized').length
  const closedCount = requests.filter(r => r.status === 'closed').length

  // 체결률: finalized / 전체
  const conversionRate = totalRequests > 0 ? Math.round((finalizedCount / totalRequests) * 100) : 0

  // finalized_at 조회
  const { data: selections } = await admin.from('quote_selections').select('request_id, finalized_at').not('finalized_at', 'is', null)
  const finalizedAtMap: Record<string, string> = {}
  for (const s of selections ?? []) { if (s.finalized_at) finalizedAtMap[s.request_id] = s.finalized_at }

  // 월별 체결률 추이
  function monthEnd(year: number, month: number): string {
    const d = new Date(year, month + 1, 0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T23:59:59`
  }
  function monthLabel(year: number, month: number): string {
    return `${year}.${String(month + 1).padStart(2, '0')}`
  }
  function monthRange(year: number, month: number): [string, string] {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const end = new Date(year, month + 1, 0)
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    return [start, endStr]
  }

  const conversionMatrix: {
    createdMonth: string
    total: number
    snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[]
  }[] = []

  for (let i = 5; i >= 0; i--) {
    const cDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const [cStart, cEnd] = monthRange(cDate.getFullYear(), cDate.getMonth())
    const cLabel = monthLabel(cDate.getFullYear(), cDate.getMonth())
    const monthReqs = requests.filter(r => r.created_at?.slice(0, 10) >= cStart && r.created_at?.slice(0, 10) <= cEnd)
    const snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[] = []
    for (let j = i; j >= 0; j--) {
      const oDate = new Date(now.getFullYear(), now.getMonth() - j, 1)
      const oLabel = monthLabel(oDate.getFullYear(), oDate.getMonth())
      const oEnd = monthEnd(oDate.getFullYear(), oDate.getMonth())
      const cutoff = j === 0 ? now.toISOString() : oEnd
      const closed = monthReqs.filter(r => { if (r.status !== 'closed') return false; const cAt = r.closed_at; if (cAt) return cAt <= cutoff; return true }).length
      const finalized = monthReqs.filter(r => {
        const fAt = finalizedAtMap[r.id]
        if (!fAt || fAt > cutoff) return false
        if (r.status === 'closed') { const cAt = r.closed_at; if (cAt && cAt <= cutoff) return false; if (!cAt) return false }
        return true
      }).length
      const rate = monthReqs.length > 0 ? Math.round((finalized / monthReqs.length) * 100) : 0
      snapshots.push({ observedMonth: oLabel, finalized, closed, rate })
    }
    conversionMatrix.push({ createdMonth: cLabel, total: monthReqs.length, snapshots })
  }

  // 응답률: 견적 요청 중 견적서가 1건 이상 제출된 비율
  const requestIds = requests.map(r => r.id)
  let responseRate = 0
  let respondedCount = 0
  if (requestIds.length > 0) {
    const { data: quotes } = await admin.from('quotes').select('request_id').in('request_id', requestIds)
    const respondedRequestIds = new Set((quotes ?? []).map(q => q.request_id))
    respondedCount = requests.filter(r => respondedRequestIds.has(r.id)).length
    responseRate = totalRequests > 0 ? Math.round((respondedCount / totalRequests) * 100) : 0
  }

  // ── 결제 통계 (agency 소유 request에 연결된 schedule/installment) ──
  let pendingCount = 0
  let pendingTotal = 0
  let overdueCount = 0
  let paidCount = 0
  let paidTotal = 0
  let thisMonthPaidCount = 0
  let thisMonthPaidTotal = 0
  let pendingList: { id: string; label: string; amount: number; due_date: string; overdue: boolean; event_name: string; display_id: string; request_id: string }[] = []

  if (requestIds.length > 0) {
    const { data: schedules } = await admin.from('payment_schedules').select('id, request_id').in('request_id', requestIds)
    const scheduleIds = (schedules ?? []).map(s => s.id)
    const scheduleRequestMap: Record<string, string> = {}
    for (const s of schedules ?? []) { scheduleRequestMap[s.id] = s.request_id }

    if (scheduleIds.length > 0) {
      const { data: installments } = await admin.from('payment_installments').select('id, schedule_id, label, status, amount, paid_amount, paid_at, due_date').in('schedule_id', scheduleIds)
      const allInst = installments ?? []

      const pendingInst = allInst.filter(i => i.status === 'pending' || i.status === 'overdue')
      const overdueInst = allInst.filter(i => i.status === 'overdue' || (i.status === 'pending' && i.due_date < today))
      const paidInst = allInst.filter(i => i.status === 'paid')
      const thisMonthPaid = paidInst.filter(i => i.paid_at && i.paid_at.slice(0, 10) >= monthStart)

      pendingCount = pendingInst.length
      pendingTotal = pendingInst.reduce((s, i) => s + i.amount, 0)
      overdueCount = overdueInst.length
      paidCount = paidInst.length
      paidTotal = paidInst.reduce((s, i) => s + i.paid_amount, 0)
      thisMonthPaidCount = thisMonthPaid.length
      thisMonthPaidTotal = thisMonthPaid.reduce((s, i) => s + i.paid_amount, 0)

      // 결제 대기 상세 목록
      const requestMap: Record<string, { event_name: string; display_id: string | null }> = {}
      for (const r of requests) { requestMap[r.id] = { event_name: (r as unknown as { event_name: string }).event_name ?? '', display_id: null } }

      const pendingRequestIds = [...new Set(pendingInst.map(i => scheduleRequestMap[i.schedule_id]))]
      if (pendingRequestIds.length > 0) {
        const { data: reqDetails } = await admin.from('quote_requests').select('id, event_name, display_id').in('id', pendingRequestIds)
        for (const r of reqDetails ?? []) { requestMap[r.id] = { event_name: r.event_name, display_id: r.display_id } }
      }

      pendingList = [...pendingInst, ...overdueInst.filter(i => i.status === 'pending')]
        .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
        .slice(0, 10)
        .map(i => {
          const reqId = scheduleRequestMap[i.schedule_id]
          const req = requestMap[reqId]
          return {
            id: i.id,
            label: i.label,
            amount: i.amount,
            due_date: i.due_date,
            overdue: i.status === 'overdue' || (i.status === 'pending' && i.due_date < today),
            event_name: req?.event_name ?? '',
            display_id: req?.display_id ?? '',
            request_id: reqId,
          }
        })
    }
  }

  // ── 매출 통계 (취소 건 제외) ──
  const excludedRequestIds = new Set(requests.filter(r => r.status === 'closed').map(r => r.id))
  const activeRequestIds = requestIds.filter(id => !excludedRequestIds.has(id))

  let totalGmv = 0
  let totalLandcoQuote = 0
  let totalAgencyCommission = 0

  if (activeRequestIds.length > 0) {
    const { data: settlements } = await admin.from('quote_settlements').select('request_id, gmv, landco_quote_total, agency_commission').in('request_id', activeRequestIds)
    const activeSettlements = settlements ?? []
    totalGmv = activeSettlements.reduce((s, r) => s + (r.gmv ?? 0), 0)
    totalLandcoQuote = activeSettlements.reduce((s, r) => s + (r.landco_quote_total ?? 0), 0)
    totalAgencyCommission = activeSettlements.reduce((s, r) => s + (r.agency_commission ?? 0), 0)
  }

  return NextResponse.json({
    quotes: {
      totalRequests,
      thisMonthRequests,
      lastMonthRequests,
      conversionRate,
      responseRate,
      respondedCount,
      conversionMatrix,
      byStatus: {
        open: openCount,
        in_progress: inProgressCount,
        payment_pending: paymentPendingCount,
        finalized: finalizedCount,
        closed: closedCount,
      },
      closedCount,
    },
    payments: {
      pendingCount,
      pendingTotal,
      overdueCount,
      paidCount,
      paidTotal,
      thisMonthPaidCount,
      thisMonthPaidTotal,
      pendingList,
    },
    revenue: {
      totalGmv,
      totalLandcoQuote,
      totalAgencyCommission,
    },
  })
}
