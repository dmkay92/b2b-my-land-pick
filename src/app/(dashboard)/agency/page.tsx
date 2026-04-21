// src/app/(dashboard)/agency/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { AgencyDashboardClient } from './DashboardClient'
import type { PhasedRequest, TravelPhase, SelectedInfo } from './DashboardClient'
import type { QuoteRequest } from '@/lib/supabase/types'
import { extractQuotePricing } from '@/lib/excel/parse'

type InternalPhase = PhasedRequest['phase']

function getPhase(req: QuoteRequest, today: string): InternalPhase {
  if (req.status === 'closed') return 'cancelled'
  if (req.status === 'payment_pending') return 'payment_pending'
  if (req.status !== 'finalized') return 'ing'
  const d = req.depart_date.slice(0, 10)
  const r = req.return_date.slice(0, 10)
  if (today < d) return 'pre'
  if (today > r) return 'end'
  return 'mid'
}

function getDday(req: QuoteRequest, phase: InternalPhase, today: string): number | null {
  if (phase === 'pre' || phase === 'payment_pending') {
    const [ty, tm, td] = today.split('-').map(Number)
    const [dy, dm, dd] = req.depart_date.slice(0, 10).split('-').map(Number)
    return Math.ceil((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000)
  }
  if (phase === 'mid') {
    const [ty, tm, td] = today.split('-').map(Number)
    const [ry, rm, rd] = req.return_date.slice(0, 10).split('-').map(Number)
    return Math.ceil((Date.UTC(ry, rm - 1, rd) - Date.UTC(ty, tm - 1, td)) / 86400000)
  }
  return null
}

export default async function AgencyDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('status').eq('id', user!.id).single()
  const isRejected = profile?.status === 'rejected'

  const { data: raw } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('agency_id', user!.id)
    .order('created_at', { ascending: false })

  const requestIds = (raw ?? []).map(r => r.id)

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: quoteRows } = requestIds.length > 0
    ? await admin.from('quotes').select('request_id, landco_id, submitted_at')
        .in('request_id', requestIds)
        .order('submitted_at', { ascending: false })
    : { data: [] }

  const landcoSetMap: Record<string, Set<string>> = {}
  const quoteRowCountMap: Record<string, number> = {}
  const latestSubmittedAt: Record<string, string> = {}
  for (const row of (quoteRows ?? []) as { request_id: string; landco_id: string; submitted_at: string }[]) {
    if (!landcoSetMap[row.request_id]) landcoSetMap[row.request_id] = new Set()
    landcoSetMap[row.request_id].add(row.landco_id)
    quoteRowCountMap[row.request_id] = (quoteRowCountMap[row.request_id] ?? 0) + 1
    if (!latestSubmittedAt[row.request_id]) {
      latestSubmittedAt[row.request_id] = row.submitted_at
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const allRequests = (raw ?? []).map(r => r as unknown as QuoteRequest)
  // payment_pending과 finalized 모두 selectedInfo 조회 대상
  const nonIngIds = allRequests
    .filter(r => {
      const p = getPhase(r, today)
      return p !== 'ing' && p !== 'cancelled'
    })
    .map(r => r.id)

  const selectedInfoMap: Record<string, SelectedInfo> = {}
  if (nonIngIds.length > 0) {
    const { data: selections } = await admin
      .from('quote_selections')
      .select('request_id, selected_quote_id, landco_id')
      .in('request_id', nonIngIds)

    if (selections && selections.length > 0) {
      const selectedQuoteIds = selections.map((s: { selected_quote_id: string }) => s.selected_quote_id)
      const landcoIds = [...new Set(selections.map((s: { landco_id: string }) => s.landco_id))]

      const [{ data: selectedQuotes }, { data: landcoProfiles }] = await Promise.all([
        admin.from('quotes').select('id, file_url, pricing_mode, summary_total, summary_per_person, pricing').in('id', selectedQuoteIds),
        admin.from('profiles').select('id, company_name').in('id', landcoIds),
      ])

      const quoteMap = Object.fromEntries((selectedQuotes ?? []).map((q: Record<string, unknown>) => [q.id as string, q]))
      const landcoNameMap = Object.fromEntries((landcoProfiles ?? []).map((p: { id: string; company_name: string }) => [p.id, p.company_name]))
      const selectionMap = Object.fromEntries(selections.map((s: { request_id: string; selected_quote_id: string; landco_id: string }) => [s.request_id, s]))

      await Promise.all(
        nonIngIds.map(async reqId => {
          const sel = selectionMap[reqId]
          if (!sel) return
          const q = quoteMap[sel.selected_quote_id]
          const landcoName = landcoNameMap[sel.landco_id] ?? ''

          let total: number | null = null
          let per_person: number | null = null

          if (q?.pricing_mode === 'summary') {
            const pricingData = q.pricing as { currencies?: Record<string, string>; exchangeRates?: Record<string, number> } | null
            const summaryCurrency = pricingData?.currencies?.['summary'] ?? 'KRW'
            const exRate = pricingData?.exchangeRates?.[summaryCurrency] ?? 0
            const rawTotal = (q.summary_total as number) ?? 0
            const rawPP = (q.summary_per_person as number) ?? 0
            total = summaryCurrency === 'KRW' ? rawTotal : (exRate > 0 ? Math.round(rawTotal * exRate) : rawTotal)
            per_person = summaryCurrency === 'KRW' ? rawPP : (exRate > 0 ? Math.round(rawPP * exRate) : rawPP)
          } else {
            const fileUrl = q?.file_url as string | undefined
            const pricing = fileUrl ? await extractQuotePricing(fileUrl) : { total: null, per_person: null }
            total = pricing.total
            per_person = pricing.per_person
          }

          selectedInfoMap[reqId] = { landcoName, total, per_person }
        })
      )
    }
  }

  const requests: PhasedRequest[] = allRequests.map(req => {
    const phase = getPhase(req, today)
    const dday = getDday(req, phase, today)
    const quoteCount = quoteRowCountMap[req.id] ?? 0
    const landcoCount = landcoSetMap[req.id]?.size ?? 0
    const selectedInfo = selectedInfoMap[req.id]
    return { ...req, phase, dday, quoteCount, landcoCount, ...(selectedInfo ? { selectedInfo } : {}) }
  }).sort((a, b) => {
    const ta = latestSubmittedAt[a.id] ?? a.created_at
    const tb = latestSubmittedAt[b.id] ?? b.created_at
    return tb.localeCompare(ta)
  })

  const counts: Record<TravelPhase, number> = {
    all: requests.length,
    ing: requests.filter(r => r.phase === 'ing').length,
    payment_pending: requests.filter(r => r.phase === 'payment_pending').length,
    confirmed: requests.filter(r => r.phase === 'pre' || r.phase === 'mid').length,
    end: requests.filter(r => r.phase === 'end').length,
    cancelled: requests.filter(r => r.phase === 'cancelled').length,
  }

  return <AgencyDashboardClient requests={requests} counts={counts} isRejected={isRejected} />
}
