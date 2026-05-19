import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
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

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

  // 견적 요청 통계
  // closed_at 컬럼이 없을 수 있으므로 fallback
  let allRequests: { id: string; status: string; created_at: string; closed_at?: string | null }[] | null = null
  const reqRes = await admin.from('quote_requests').select('id, status, created_at, closed_at')
  if (reqRes.error) {
    // closed_at 컬럼이 없는 경우 fallback
    const fallback = await admin.from('quote_requests').select('id, status, created_at')
    allRequests = (fallback.data ?? []).map(r => ({ ...r, closed_at: null }))
  } else {
    allRequests = reqRes.data
  }
  const requests = allRequests ?? []
  const totalRequests = requests.length
  const todayRequests = requests.filter(r => r.created_at?.slice(0, 10) === today).length
  const yesterdayRequests = requests.filter(r => r.created_at?.slice(0, 10) === yesterday).length
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

  // 월별 체결률 추이 (생성월 × 관측월 매트릭스)
  // 각 생성월에 대해, 각 관측 시점(월말)에서의 확정/취소 수를 계산
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

  // 데이터가 있는 월만 포함 (최근 6개월)
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

    // 생성월부터 현재월까지 각 월말 시점의 스냅샷 (최근 3개월 범위만)
    for (let j = i; j >= 0; j--) {
      const oDate = new Date(now.getFullYear(), now.getMonth() - j, 1)
      const oLabel = monthLabel(oDate.getFullYear(), oDate.getMonth())
      const oEnd = monthEnd(oDate.getFullYear(), oDate.getMonth())
      // 현재월이면 현재 시각 기준
      const cutoff = j === 0 ? now.toISOString() : oEnd

      const closed = monthReqs.filter(r => {
        if (r.status !== 'closed') return false
        const cAt = r.closed_at
        if (cAt) return cAt <= cutoff
        return true
      }).length

      // 체결: finalized된 건 중 closed가 아닌 건 (취소된 건 제외)
      const finalized = monthReqs.filter(r => {
        const fAt = finalizedAtMap[r.id]
        if (!fAt || fAt > cutoff) return false
        // 이 시점에 이미 closed인지 확인
        if (r.status === 'closed') {
          const cAt = r.closed_at
          if (cAt && cAt <= cutoff) return false
          if (!cAt) return false
        }
        return true
      }).length

      const rate = monthReqs.length > 0 ? Math.round((finalized / monthReqs.length) * 100) : 0
      snapshots.push({ observedMonth: oLabel, finalized, closed, rate })
    }

    conversionMatrix.push({ createdMonth: cLabel, total: monthReqs.length, snapshots })
  }

  // 단순 월별 현재 체결률 (차트 막대용)
  const monthlyConversion: { month: string; total: number; finalized: number; closed: number; rate: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const [mStart, mEndStr] = monthRange(d.getFullYear(), d.getMonth())
    const mLabel = monthLabel(d.getFullYear(), d.getMonth())
    const monthRequests = requests.filter(r => r.created_at?.slice(0, 10) >= mStart && r.created_at?.slice(0, 10) <= mEndStr)
    const mTotal = monthRequests.length
    const mFinalized = monthRequests.filter(r => r.status === 'finalized').length
    const mClosed = monthRequests.filter(r => r.status === 'closed').length
    const mRate = mTotal > 0 ? Math.round((mFinalized / mTotal) * 100) : 0
    monthlyConversion.push({ month: mLabel, total: mTotal, finalized: mFinalized, closed: mClosed, rate: mRate })
  }

  // 응답률: 견적 요청 중 견적서가 1건 이상 제출된 비율
  const { data: allQuotes } = await admin.from('quotes').select('request_id')
  const respondedRequestIds = new Set((allQuotes ?? []).map(q => q.request_id))
  const respondedCount = requests.filter(r => respondedRequestIds.has(r.id)).length
  const responseRate = totalRequests > 0 ? Math.round((respondedCount / totalRequests) * 100) : 0

  // 견적서 통계
  const totalQuotes = allQuotes?.length ?? 0

  // 정산 통계 — 취소(closed) 건 제외, 확정(finalized) + 결제대기(payment_pending) 포함
  const excludedRequestIds = new Set(requests.filter(r => r.status === 'closed').map(r => r.id))
  const { data: settlements } = await admin.from('quote_settlements').select('request_id, gmv, platform_fee, platform_net_revenue, landco_payout, agency_payout, landco_quote_total, agency_commission')
  const activeSettlements = (settlements ?? []).filter(s => !excludedRequestIds.has(s.request_id))
  const totalGmv = activeSettlements.reduce((s, r) => s + (r.gmv ?? 0), 0)
  const totalLandcoQuote = activeSettlements.reduce((s, r) => s + (r.landco_quote_total ?? 0), 0)
  const totalAgencyCommission = activeSettlements.reduce((s, r) => s + (r.agency_commission ?? 0), 0)
  const totalPlatformFee = activeSettlements.reduce((s, r) => s + (r.platform_fee ?? 0), 0)
  const totalNetRevenue = activeSettlements.reduce((s, r) => s + (r.platform_net_revenue ?? 0), 0)
  const totalLandcoPayout = activeSettlements.reduce((s, r) => s + (r.landco_payout ?? 0), 0)
  const totalAgencyPayout = activeSettlements.reduce((s, r) => s + (r.agency_payout ?? 0), 0)

  // 결제 통계
  const { data: installments } = await admin.from('payment_installments').select('status, amount, paid_amount, paid_at, due_date')
  const allInst = installments ?? []
  const pendingInst = allInst.filter(i => i.status === 'pending' || i.status === 'overdue')
  const overdueInst = allInst.filter(i => i.status === 'overdue' || (i.status === 'pending' && i.due_date < today))
  const paidInst = allInst.filter(i => i.status === 'paid')
  const thisMonthPaid = paidInst.filter(i => i.paid_at && i.paid_at.slice(0, 10) >= monthStart)

  const pendingTotal = pendingInst.reduce((s, i) => s + i.amount, 0)
  const paidTotal = paidInst.reduce((s, i) => s + i.paid_amount, 0)
  const thisMonthPaidTotal = thisMonthPaid.reduce((s, i) => s + i.paid_amount, 0)

  return NextResponse.json({
    quotes: {
      totalRequests,
      todayRequests,
      yesterdayRequests,
      thisMonthRequests,
      lastMonthRequests,
      totalQuotes: totalQuotes ?? 0,
      conversionRate,
      responseRate,
      respondedCount,
      byStatus: { open: openCount, in_progress: inProgressCount, payment_pending: paymentPendingCount, finalized: finalizedCount, closed: closedCount },
      monthlyConversion,
      conversionMatrix,
    },
    payments: {
      pendingCount: pendingInst.length,
      pendingTotal,
      overdueCount: overdueInst.length,
      paidCount: paidInst.length,
      paidTotal,
      thisMonthPaidCount: thisMonthPaid.length,
      thisMonthPaidTotal,
    },
    settlements: {
      totalGmv,
      totalLandcoQuote,
      totalAgencyCommission,
      totalPlatformFee,
      totalNetRevenue,
      totalLandcoPayout,
      totalAgencyPayout,
    },
  })
}
