import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
  if (![3, 4, 5].includes(body.hotel_grade)) {
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
    hotel_grade: body.hotel_grade,
    deadline: body.deadline,
    notes: body.notes ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: landcos } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'landco')
    .eq('status', 'approved')
    .contains('country_codes', [body.destination_country])

  if (landcos && landcos.length > 0) {
    await sendNewRequestEmail({
      to: landcos.map((l: { email: string }) => l.email),
      event_name: body.event_name,
      destination: `${body.destination_city} (${body.destination_country})`,
      deadline: body.deadline,
      request_id: data.id,
    })
  }

  return NextResponse.json({ data }, { status: 201 })
}
