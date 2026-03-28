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

  // 랜드사는 자신의 담당 국가 요청만 접근 가능
  if (isLandco) {
    const assignedCodes = (profile?.country_codes ?? []) as string[]
    if (!assignedCodes.includes(request.destination_country)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
      const pricing = await extractQuotePricing(q.file_url)
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
    deadline: body.deadline,
    notes: body.notes ?? null,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
