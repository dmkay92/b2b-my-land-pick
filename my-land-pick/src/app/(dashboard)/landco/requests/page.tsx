// src/app/(dashboard)/landco/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { LandcoDashboardClient } from './LandcoDashboardClient'
import type { PhasedLandcoRequest } from './LandcoDashboardClient'
import type { QuoteRequest } from '@/lib/supabase/types'

function getPhase(req: QuoteRequest, today: string): 'ing' | 'pre' | 'mid' | 'end' | 'lost' {
  if (req.status !== 'finalized') return 'ing'
  const d = req.depart_date.slice(0, 10)
  const r = req.return_date.slice(0, 10)
  if (today < d) return 'pre'
  if (today > r) return 'end'
  return 'mid'
}

function getDday(req: QuoteRequest, phase: 'ing' | 'pre' | 'mid' | 'end' | 'lost', today: string): number | null {
  if (phase === 'pre') {
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

export default async function LandcoDashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('country_codes, service_areas, status, approved_at').eq('id', user.id).single()

  const isRejected = profile?.status === 'rejected'
  const serviceAreas = (profile?.service_areas ?? []) as { country: string; city: string }[]
  const countryCodes = (profile?.country_codes ?? []) as string[]

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().slice(0, 10)

  const { data: myQuotesRaw } = await admin
    .from('quotes')
    .select('request_id, submitted_at')
    .eq('landco_id', user.id)
    .order('submitted_at', { ascending: false })

  const latestSubmittedAt = new Map<string, string>()
  for (const q of (myQuotesRaw ?? []) as { request_id: string; submitted_at: string }[]) {
    if (!latestSubmittedAt.has(q.request_id)) {
      latestSubmittedAt.set(q.request_id, q.submitted_at)
    }
  }

  const submittedRequestIds = new Set(latestSubmittedAt.keys())

  const { data: mySelectionsRaw } = await admin
    .from('quote_selections')
    .select('request_id')
    .eq('landco_id', user.id)

  const selectedRequestIds = new Set(
    (mySelectionsRaw ?? []).map((s: { request_id: string }) => s.request_id)
  )

  const { data: myAbandonmentsRaw } = await admin
    .from('quote_abandonments')
    .select('request_id')
    .eq('landco_id', user.id)

  const abandonedRequestIds = new Set(
    (myAbandonmentsRaw ?? []).map((a: { request_id: string }) => a.request_id)
  )

  // 다른 랜드사가 이미 선택된 요청 조회 (미제출 마감 판정용)
  const { data: allSelections } = await admin
    .from('quote_selections')
    .select('request_id')

  const allSelectedRequestIds = new Set(
    (allSelections ?? []).map((s: { request_id: string }) => s.request_id)
  )

  let openQuery = admin
    .from('quote_requests')
    .select('*')
    .in('status', ['open', 'in_progress'])
    .order('deadline', { ascending: true })

  if (serviceAreas.length > 0) {
    const orConditions = serviceAreas.map(a => `and(destination_country.eq.${a.country},destination_city.eq.${a.city})`).join(',')
    openQuery = openQuery.or(orConditions)
  } else if (countryCodes.length > 0) {
    openQuery = openQuery.in('destination_country', countryCodes)
  } else {
    openQuery = openQuery.in('destination_country', ['__none__'])
  }

  const { data: openRaw } = isRejected ? { data: [] } : await openQuery

  // open/in_progress 중 다른 랜드사가 선택되었고 내가 미제출인 건은 missed로 분리
  const trueOpenRaw = (openRaw ?? []).filter((r: { id: string }) => {
    if (!submittedRequestIds.has(r.id) && allSelectedRequestIds.has(r.id)) return false
    return true
  })
  const openMissedRaw = (openRaw ?? []).filter((r: { id: string }) => {
    return !submittedRequestIds.has(r.id) && allSelectedRequestIds.has(r.id)
  })

  const openRequestIds = new Set(trueOpenRaw.map((r: { id: string }) => r.id))

  const submittedNotOpen = [...submittedRequestIds].filter(id => !openRequestIds.has(id))

  // payment_pending과 finalized 모두 조회 (제출한 건)
  const { data: nonOpenRaw } = submittedNotOpen.length > 0
    ? await admin
        .from('quote_requests')
        .select('*')
        .in('id', submittedNotOpen)
        .in('status', ['payment_pending', 'finalized', 'closed'])
    : { data: [] }

  // 미제출 마감 건: status가 이미 변경된 건 + open/in_progress이지만 다른 랜드사 선택된 건
  // 랜드사 가입 승인 이전에 생성된 요청은 제외
  let missedQuery = admin
    .from('quote_requests')
    .select('*')
    .in('status', ['payment_pending', 'finalized', 'closed'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (profile?.approved_at) {
    missedQuery = missedQuery.gte('created_at', profile.approved_at)
  }

  if (serviceAreas.length > 0) {
    const orConditions = serviceAreas.map(a => `and(destination_country.eq.${a.country},destination_city.eq.${a.city})`).join(',')
    missedQuery = missedQuery.or(orConditions)
  } else if (countryCodes.length > 0) {
    missedQuery = missedQuery.in('destination_country', countryCodes)
  } else {
    missedQuery = missedQuery.in('destination_country', ['__none__'])
  }

  const { data: missedRaw } = isRejected ? { data: [] } : await missedQuery
  const missedFromStatusChange = (missedRaw ?? []).filter((r: { id: string; status: string }) =>
    !submittedRequestIds.has(r.id) &&
    !abandonedRequestIds.has(r.id) &&
    !openRequestIds.has(r.id) &&
    (allSelectedRequestIds.has(r.id) || r.status === 'closed')
  )
  // open/in_progress이지만 이미 다른 랜드사 선택된 미제출 건 합산
  const missedRequests = [...missedFromStatusChange, ...openMissedRaw]

  const openRequests: PhasedLandcoRequest[] = trueOpenRaw.map(r => {
    const req = r as unknown as QuoteRequest
    if (abandonedRequestIds.has(req.id)) {
      return { ...req, phase: 'abandoned' as const, dday: null, submitted: submittedRequestIds.has(req.id) }
    }
    return { ...req, phase: 'ing' as const, dday: null, submitted: submittedRequestIds.has(req.id) }
  })

  const nonOpenRequests: PhasedLandcoRequest[] = (nonOpenRaw ?? []).map(r => {
    const req = r as unknown as QuoteRequest
    if (req.status === 'closed') {
      return { ...req, phase: 'cancelled' as const, dday: null, submitted: true }
    }
    if (!selectedRequestIds.has(req.id)) {
      return { ...req, phase: 'lost' as const, dday: null, submitted: true }
    }
    if (req.status === 'payment_pending') {
      const [ty, tm, td] = today.split('-').map(Number)
      const [dy, dm, dd] = req.depart_date.slice(0, 10).split('-').map(Number)
      const dday = Math.ceil((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000)
      return { ...req, phase: 'payment_pending' as const, dday, submitted: true }
    }
    const phase = getPhase(req, today)
    const dday = getDday(req, phase, today)
    return { ...req, phase, dday, submitted: true }
  })

  // 미제출 마감 건
  const missedPhasedRequests: PhasedLandcoRequest[] = missedRequests.map(r => {
    const req = r as unknown as QuoteRequest
    if (req.status === 'closed') {
      return { ...req, phase: 'cancelled' as const, dday: null, submitted: false }
    }
    return { ...req, phase: 'missed' as const, dday: null, submitted: false }
  })

  const requests: PhasedLandcoRequest[] = [...openRequests, ...nonOpenRequests, ...missedPhasedRequests]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return <LandcoDashboardClient requests={requests} isRejected={isRejected} today={today} initialRequestFrom={params.from} initialRequestTo={params.to} />
}
