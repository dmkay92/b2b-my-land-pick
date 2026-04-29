import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { validateQuoteRequest } from '@/lib/validators'
import { sendNewRequestEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()
  if (profile?.role !== 'agency' || profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()

  const requiredFields = ['event_name', 'destination_country', 'destination_city', 'depart_date', 'return_date', 'deadline'] as const
  for (const field of requiredFields) {
    if (!body[field] || typeof body[field] !== 'string') {
      return NextResponse.json({ errors: [`${field}은(는) 필수입니다.`] }, { status: 400 })
    }
  }
  const quoteType = body.quote_type === 'land' ? 'land' : 'hotel_land'
  if (quoteType === 'hotel_land' && ![3, 4, 5].includes(body.hotel_grade)) {
    return NextResponse.json({ errors: ['호텔 등급은 3, 4, 5 중 하나여야 합니다.'] }, { status: 400 })
  }

  const errors = validateQuoteRequest(body)
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 })
  }

  const { data, error } = await supabase.from('quote_requests').insert({
    agency_id: user.id,
    event_name: body.event_name,
    destination_country: body.destination_country,
    destination_city: body.destination_city,
    depart_date: body.depart_date,
    return_date: body.return_date,
    adults: body.adults,
    children: body.children,
    infants: body.infants,
    leaders: body.leaders,
    quote_type: quoteType,
    hotel_grade: quoteType === 'land' ? null : body.hotel_grade,
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
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 해당 국가+도시를 담당하는 랜드사 찾기
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: allLandcos } = await admin
    .from('profiles')
    .select('id, email, service_areas, country_codes')
    .eq('role', 'landco')
    .eq('status', 'approved')

  const matchingLandcos = (allLandcos ?? []).filter(l => {
    const areas = (l.service_areas ?? []) as { country: string; city: string }[]
    if (areas.length > 0) {
      return areas.some(a => a.country === body.destination_country && a.city === body.destination_city)
    }
    // fallback: country_codes만 있는 경우
    return (l.country_codes ?? []).includes(body.destination_country)
  })

  if (matchingLandcos.length > 0) {
    // 이메일 발송
    await sendNewRequestEmail({
      to: matchingLandcos.map(l => l.email),
      event_name: body.event_name,
      destination: `${body.destination_city} (${body.destination_country})`,
      deadline: body.deadline,
      request_id: data.id,
    })

    // 알림 발송
    for (const landco of matchingLandcos) {
      await admin.from('notifications').insert({
        user_id: landco.id,
        type: 'new_request',
        payload: { request_id: data.id, event_name: body.event_name },
      })
    }
  }

  return NextResponse.json({ data }, { status: 201 })
}
