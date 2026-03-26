import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const { data: qr } = await supabase
    .from('quote_requests').select('*').eq('id', requestId).single()
  if (!qr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = qr.agency_id === user.id
  const isLandco = profile?.role === 'landco'
  const isAdmin = profile?.role === 'admin'
  if (!isOwner && !isLandco && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const workbook = await generateQuoteTemplate({
    event_name: qr.event_name,
    destination: `${qr.destination_city} (${qr.destination_country})`,
    depart_date: qr.depart_date,
    return_date: qr.return_date,
    total_people: calculateTotalPeople({
      adults: qr.adults, children: qr.children,
      infants: qr.infants, leaders: qr.leaders,
    }),
    hotel_grade: qr.hotel_grade,
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = encodeURIComponent(`견적서_${qr.event_name}.xlsx`)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
    },
  })
}
