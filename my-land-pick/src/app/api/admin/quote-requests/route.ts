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

  const { data: allRequests } = await admin
    .from('quote_requests')
    .select('id, display_id, event_name, destination_country, destination_city, depart_date, return_date, status, created_at, agency_id')
    .order('created_at', { ascending: false })

  if (!allRequests || allRequests.length === 0) {
    return NextResponse.json({ rows: [] })
  }

  // 여행사 이름
  const agencyIds = [...new Set(allRequests.map(r => r.agency_id))]
  const { data: agencies } = await admin.from('profiles').select('id, company_name').in('id', agencyIds)
  const agencyMap = Object.fromEntries((agencies ?? []).map(a => [a.id, a.company_name]))

  // 견적 수 + 참여 랜드사 (RLS 우회)
  const requestIds = allRequests.map(r => r.id)
  const { data: quotes } = await admin.from('quotes').select('request_id, landco_id').in('request_id', requestIds)

  const countMap: Record<string, number> = {}
  const landcoMap: Record<string, Set<string>> = {}
  for (const q of quotes ?? []) {
    countMap[q.request_id] = (countMap[q.request_id] ?? 0) + 1
    if (!landcoMap[q.request_id]) landcoMap[q.request_id] = new Set()
    landcoMap[q.request_id].add(q.landco_id)
  }

  // 랜드사 이름 조회
  const allLandcoIds = [...new Set((quotes ?? []).map(q => q.landco_id))]
  const { data: landcos } = allLandcoIds.length > 0
    ? await admin.from('profiles').select('id, company_name').in('id', allLandcoIds)
    : { data: [] }
  const landcoNameMap = Object.fromEntries((landcos ?? []).map(l => [l.id, l.company_name]))

  const rows = allRequests.map(r => ({
    id: r.id,
    display_id: r.display_id,
    event_name: r.event_name,
    destination_country: r.destination_country,
    destination_city: r.destination_city,
    depart_date: r.depart_date,
    return_date: r.return_date,
    status: r.status,
    created_at: r.created_at,
    agency_name: agencyMap[r.agency_id] ?? '-',
    quote_count: countMap[r.id] ?? 0,
    landco_names: [...(landcoMap[r.id] ?? [])].map(lid => landcoNameMap[lid] ?? '-'),
  }))

  return NextResponse.json({ rows })
}
