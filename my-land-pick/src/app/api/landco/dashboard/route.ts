import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role, country_codes').eq('id', user.id).single()
  if (profile?.role !== 'landco') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const countryCodes: string[] = profile.country_codes ?? []

  // 1. 받은 견적 요청: 이 랜드사의 서비스 지역 국가에 해당하는 요청
  const { data: allRequests } = await admin
    .from('quote_requests')
    .select('id, status, destination_country, created_at, closed_at')
  const requests = (allRequests ?? []).filter(r => countryCodes.includes(r.destination_country))
  const receivedRequests = requests.length

  // 2. 이 랜드사가 제출한 견적
  const { data: myQuotes } = await admin
    .from('quotes')
    .select('id, request_id, submitted_at, status')
    .eq('landco_id', user.id)
  const quotes = myQuotes ?? []
  const submittedRequestIds = new Set(quotes.map(q => q.request_id))
  const submittedQuotes = submittedRequestIds.size
  const thisMonthSubmittedIds = new Set(quotes.filter(q => q.submitted_at?.slice(0, 10) >= monthStart).map(q => q.request_id))
  const thisMonthSubmitted = thisMonthSubmittedIds.size

  // 3. 낙찰 건수: quote_selections에서 이 랜드사가 선택된 건
  const { data: selections } = await admin
    .from('quote_selections')
    .select('request_id, selected_quote_id, finalized_at')
    .eq('landco_id', user.id)
  const wonSelections = selections ?? []
  const closedRequestIds = new Set(requests.filter(r => r.status === 'closed').map(r => r.id))
  // 체결 건수: 취소 건 제외
  const wonCount = wonSelections.filter(s => !closedRequestIds.has(s.request_id)).length
  // 체결률: 체결 / 응답한 건
  const winRate = submittedQuotes > 0 ? Math.round((wonCount / submittedQuotes) * 100) : 0

  // 낙찰된 request_id 목록
  const wonRequestIds = new Set(wonSelections.map(s => s.request_id))
  const finalizedAtMap: Record<string, string> = {}
  for (const s of wonSelections) { if (s.finalized_at) finalizedAtMap[s.request_id] = s.finalized_at }



  // 월별 체결률 추이 (이 랜드사가 견적 제출한 요청 기준)
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

  // 이 랜드사가 견적 제출한 요청만 필터
  const submittedRequests = requests.filter(r => submittedRequestIds.has(r.id))

  const conversionMatrix: {
    createdMonth: string
    total: number
    snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[]
  }[] = []

  for (let i = 5; i >= 0; i--) {
    const cDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const [cStart, cEnd] = monthRange(cDate.getFullYear(), cDate.getMonth())
    const cLabel = monthLabel(cDate.getFullYear(), cDate.getMonth())

    const monthReqs = submittedRequests.filter(r => r.created_at?.slice(0, 10) >= cStart && r.created_at?.slice(0, 10) <= cEnd)

    const snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[] = []

    for (let j = i; j >= 0; j--) {
      const oDate = new Date(now.getFullYear(), now.getMonth() - j, 1)
      const oLabel = monthLabel(oDate.getFullYear(), oDate.getMonth())
      const oEnd = monthEnd(oDate.getFullYear(), oDate.getMonth())
      const cutoff = j === 0 ? now.toISOString() : oEnd

      const closed = monthReqs.filter(r => {
        if (r.status !== 'closed') return false
        const cAt = r.closed_at
        if (cAt) return cAt <= cutoff
        return true
      }).length

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
  const activeWonRequestIds = [...wonRequestIds].filter(id => !closedRequestIds.has(id))

  // 4. 결제 현황: 낙찰된 건의 payment_schedules → payment_installments
  const { data: schedules } = await admin
    .from('payment_schedules')
    .select('id, request_id')
    .in('request_id', activeWonRequestIds.length > 0 ? activeWonRequestIds : ['__none__'])
  const scheduleIds = (schedules ?? []).map(s => s.id)
  const scheduleRequestMap: Record<string, string> = {}
  for (const s of schedules ?? []) { scheduleRequestMap[s.id] = s.request_id }

  const { data: installments } = await admin
    .from('payment_installments')
    .select('id, schedule_id, label, status, amount, paid_amount, paid_at, due_date')
    .in('schedule_id', scheduleIds.length > 0 ? scheduleIds : ['__none__'])
  const allInst = installments ?? []

  const pendingInst = allInst.filter(i => i.status === 'pending' || i.status === 'overdue' || i.status === 'verifying')
  const overdueInst = allInst.filter(i => i.status === 'overdue' || (i.status === 'pending' && i.due_date < today))
  const paidInst = allInst.filter(i => i.status === 'paid')
  const thisMonthPaid = paidInst.filter(i => i.paid_at && i.paid_at.slice(0, 10) >= monthStart)

  // 정산 비율 계산 (랜드사 정산금 / GMV)
  const { data: settlementsForRatio } = await admin
    .from('quote_settlements')
    .select('request_id, gmv, landco_quote_total, landco_payout')
    .eq('landco_id', user.id)
  // 랜드사 견적가 비율 (견적가 / GMV) — 여행사 커미션만 제외
  const ratioMap: Record<string, number> = {}
  for (const s of settlementsForRatio ?? []) {
    ratioMap[s.request_id] = (s.gmv && s.gmv > 0) ? (s.landco_quote_total ?? 0) / s.gmv : 1
  }

  function toLandcoAmount(inst: { schedule_id: string; amount?: number; paid_amount?: number }, field: 'amount' | 'paid_amount') {
    const reqId = scheduleRequestMap[inst.schedule_id]
    const ratio = ratioMap[reqId] ?? 1
    return Math.round((inst[field] ?? 0) * ratio)
  }

  const pendingTotal = pendingInst.reduce((s, i) => s + toLandcoAmount(i, 'amount'), 0)
  const paidTotal = paidInst.reduce((s, i) => s + toLandcoAmount(i, 'paid_amount'), 0)
  const thisMonthPaidTotal = thisMonthPaid.reduce((s, i) => s + toLandcoAmount(i, 'paid_amount'), 0)

  // 결제 대기 상세 목록
  const pendingRequestIds = [...new Set(pendingInst.map(i => scheduleRequestMap[i.schedule_id]).filter(Boolean))]
  const requestDetailMap: Record<string, { event_name: string; display_id: string | null }> = {}
  if (pendingRequestIds.length > 0) {
    const { data: reqDetails } = await admin.from('quote_requests').select('id, event_name, display_id').in('id', pendingRequestIds)
    for (const r of reqDetails ?? []) { requestDetailMap[r.id] = { event_name: r.event_name, display_id: r.display_id } }
  }
  const pendingList = [...pendingInst, ...overdueInst.filter(i => i.status === 'pending')]
    .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 10)
    .map(i => {
      const reqId = scheduleRequestMap[i.schedule_id]
      const req = requestDetailMap[reqId]
      return {
        id: i.id,
        label: i.label,
        amount: toLandcoAmount(i, 'amount'),
        due_date: i.due_date,
        overdue: i.status === 'overdue' || (i.status === 'pending' && i.due_date < today),
        status: i.status,
        event_name: req?.event_name ?? '',
        display_id: req?.display_id ?? '',
        request_id: reqId,
      }
    })

  // 5. 매출(정산): 낙찰 건 중 closed 제외
  const { data: settlements } = await admin
    .from('quote_settlements')
    .select('request_id, landco_quote_total, platform_fee, landco_payout')
    .eq('landco_id', user.id)
  const activeSettlements = (settlements ?? []).filter(s => !closedRequestIds.has(s.request_id))

  const totalLandcoQuote = activeSettlements.reduce((s, r) => s + (r.landco_quote_total ?? 0), 0)
  const totalPlatformFee = activeSettlements.reduce((s, r) => s + (r.platform_fee ?? 0), 0)
  const totalPayout = activeSettlements.reduce((s, r) => s + (r.landco_payout ?? 0), 0)

  return NextResponse.json({
    quotes: {
      receivedRequests,
      submittedQuotes,
      wonCount,
      winRate,
      thisMonthSubmitted,
      conversionMatrix,
    },
    payments: {
      pendingCount: pendingInst.length,
      pendingTotal,
      paidCount: paidInst.length,
      paidTotal,
      thisMonthPaidCount: thisMonthPaid.length,
      thisMonthPaidTotal,
      pendingList,
    },
    revenue: {
      totalLandcoQuote,
      totalPlatformFee,
      totalPayout,
    },
  })
}
