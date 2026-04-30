import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { extractQuotePricing } from '@/lib/excel/parse'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: request, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles').select('role, country_codes').eq('id', user.id).single()

  const isOwner = request.agency_id === user.id
  const isLandco = profile?.role === 'landco'
  const isAdmin = profile?.role === 'admin'

  if (!isOwner && !isLandco && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 랜드사는 담당 국가 요청 또는 이미 견적을 제출한 요청만 접근 가능
  if (isLandco) {
    const assignedCodes = (profile?.country_codes ?? []) as string[]
    const isAssignedCountry = assignedCodes.includes(request.destination_country)
    if (!isAssignedCountry) {
      const { count } = await supabase
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('request_id', id)
        .eq('landco_id', user.id)
      if (!count || count === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*')
    .eq('request_id', id)
    .order('version', { ascending: false })

  const landcoIds = [...new Set((quotes ?? []).map(q => q.landco_id))]
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const profilesResult = landcoIds.length > 0
    ? await adminClient.from('profiles').select('id, company_name').in('id', landcoIds)
    : { data: [], error: null }
  const landcoProfiles = profilesResult.data

  const profileMap = Object.fromEntries((landcoProfiles ?? []).map(p => [p.id, p]))

  const quotesWithPricing = await Promise.all(
    (quotes ?? []).map(async q => {
      let pricing
      if (q.pricing_mode === 'summary') {
        // KRW 환산
        const pricingData = q.pricing as { currencies?: Record<string, string>; exchangeRates?: Record<string, number> } | null
        const summaryCurrency = pricingData?.currencies?.['summary'] ?? 'KRW'
        const exRate = pricingData?.exchangeRates?.[summaryCurrency] ?? 0
        const rawTotal = q.summary_total ?? 0
        const rawPerPerson = q.summary_per_person ?? 0
        const total = summaryCurrency === 'KRW' ? rawTotal : (exRate > 0 ? Math.round(rawTotal * exRate) : rawTotal)
        const per_person = summaryCurrency === 'KRW' ? rawPerPerson : (exRate > 0 ? Math.round(rawPerPerson * exRate) : rawPerPerson)
        pricing = { total, per_person }
      } else {
        pricing = await extractQuotePricing(q.file_url)
      }
      return {
        ...q,
        profiles: profileMap[q.landco_id] ?? null,
        pricing,
      }
    })
  )

  return NextResponse.json({ request, quotes: quotesWithPricing })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: existing } = await supabase
    .from('quote_requests').select('agency_id, status').eq('id', id).single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (existing.status === 'finalized') return NextResponse.json({ error: '확정된 요청은 수정할 수 없습니다.' }, { status: 400 })

  const body = await request.json()

  const { error } = await supabase.from('quote_requests').update({
    event_name: body.event_name,
    destination_country: body.destination_country,
    destination_city: body.destination_city,
    depart_date: body.depart_date,
    return_date: body.return_date,
    adults: body.adults,
    children: body.children,
    infants: body.infants,
    leaders: body.leaders,
    hotel_grade: body.hotel_grade,
    shopping_option: body.shopping_option ?? null,
    shopping_count: body.shopping_option === true ? (body.shopping_count ?? null) : null,
    tip_option: body.tip_option ?? null,
    local_option: body.local_option ?? null,
    deadline: body.deadline,
    notes: body.notes ?? null,
    attachment_url: body.attachment_url ?? null,
    attachment_name: body.attachment_name ?? null,
    flight_schedule: body.flight_schedule ?? null,
    travel_type: body.travel_type || null,
    religion_type: body.travel_type === 'religion' ? (body.religion_type || null) : null,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
