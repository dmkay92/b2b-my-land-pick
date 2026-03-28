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

export default async function LandcoDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('country_codes').eq('id', user.id).single()

  const countryCodes = (profile?.country_codes ?? []) as string[]

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().slice(0, 10)

  // 1. 내가 제출한 견적의 고유 request_id 목록 + 최신 제출 시간
  const { data: myQuotesRaw } = await admin
    .from('quotes')
    .select('request_id, submitted_at')
    .eq('landco_id', user.id)
    .order('submitted_at', { ascending: false })

  // request_id별 최신 submitted_at 맵
  const latestSubmittedAt = new Map<string, string>()
  for (const q of (myQuotesRaw ?? []) as { request_id: string; submitted_at: string }[]) {
    if (!latestSubmittedAt.has(q.request_id)) {
      latestSubmittedAt.set(q.request_id, q.submitted_at)
    }
  }

  const submittedRequestIds = new Set(latestSubmittedAt.keys())

  // 2. 내 견적이 선택된 request_id 목록
  const { data: mySelectionsRaw } = await admin
    .from('quote_selections')
    .select('request_id')
    .eq('landco_id', user.id)

  const selectedRequestIds = new Set(
    (mySelectionsRaw ?? []).map((s: { request_id: string }) => s.request_id)
  )

  // 3. 내가 포기한 request_id 목록
  const { data: myAbandonmentsRaw } = await admin
    .from('quote_abandonments')
    .select('request_id')
    .eq('landco_id', user.id)

  const abandonedRequestIds = new Set(
    (myAbandonmentsRaw ?? []).map((a: { request_id: string }) => a.request_id)
  )

  // 4. 진행중인 요청: 담당 국가의 open/in_progress 요청 전체
  const { data: openRaw } = await supabase
    .from('quote_requests')
    .select('*')
    .in('destination_country', countryCodes.length > 0 ? countryCodes : ['__none__'])
    .in('status', ['open', 'in_progress'])
    .order('deadline', { ascending: true })

  const openRequestIds = new Set((openRaw ?? []).map((r: { id: string }) => r.id))

  // 5. 내가 참여한 확정 요청: 제출한 견적 중 open이 아닌 것을 admin으로 직접 조회
  const submittedNotOpen = [...submittedRequestIds].filter(id => !openRequestIds.has(id))

  const { data: finalizedRaw } = submittedNotOpen.length > 0
    ? await admin
        .from('quote_requests')
        .select('*')
        .in('id', submittedNotOpen)
        .eq('status', 'finalized')
    : { data: [] }

  // 진행중 요청 목록 (포기한 요청 포함 분류)
  const openRequests: PhasedLandcoRequest[] = (openRaw ?? []).map(r => {
    const req = r as unknown as QuoteRequest
    if (abandonedRequestIds.has(req.id)) {
      return { ...req, phase: 'abandoned' as const, dday: null, submitted: submittedRequestIds.has(req.id) }
    }
    return { ...req, phase: 'ing' as const, dday: null, submitted: submittedRequestIds.has(req.id) }
  })

  // 확정된 요청 - 선택됨 / 미선택 분류
  const finalizedRequests: PhasedLandcoRequest[] = (finalizedRaw ?? []).map(r => {
    const req = r as unknown as QuoteRequest
    if (selectedRequestIds.has(req.id)) {
      const phase = getPhase(req, today)
      const dday = getDday(req, phase, today)
      return { ...req, phase, dday, submitted: true }
    } else {
      return { ...req, phase: 'lost' as const, dday: null, submitted: true }
    }
  })

  const requests: PhasedLandcoRequest[] = [...openRequests, ...finalizedRequests]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return <LandcoDashboardClient requests={requests} />
}
