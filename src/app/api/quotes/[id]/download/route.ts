import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateFilledQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'
import { applyPlatformMargin, distributeMealExcludedMarkup } from '@/lib/pricing/markup'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: quoteId } = await params

  // Get quote and its request
  const { data: quote } = await supabase
    .from('quotes').select('*').eq('id', quoteId).single()
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: req } = await supabase
    .from('quote_requests').select('*').eq('id', quote.request_id).single()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Get draft data (itinerary + pricing) using admin client (bypasses RLS since drafts are deleted after submit)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: draft } = await adminClient
    .from('quote_drafts').select('itinerary, pricing')
    .eq('request_id', quote.request_id).eq('landco_id', quote.landco_id).single()

  if (!draft) return NextResponse.json({ error: 'Draft data not found' }, { status: 404 })

  // Get platform margin rate
  const { data: marginSetting } = await supabase
    .from('platform_settings').select('value').eq('key', 'margin_rate').single()
  const marginRate = marginSetting ? Number(marginSetting.value) : 0.05

  // Check user role
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  const isAgency = profile?.role === 'agency'

  // Get agency markup if exists
  const { data: markup } = await supabase
    .from('agency_markups').select('*')
    .eq('quote_id', quoteId).eq('agency_id', isAgency ? user.id : req.agency_id)
    .maybeSingle()

  // Apply platform margin for agency view
  let pricing = draft.pricing
  if (isAgency) {
    pricing = applyPlatformMargin(pricing, marginRate)
  }

  // Apply agency markup if exists
  if (markup && markup.markup_total > 0) {
    pricing = distributeMealExcludedMarkup(pricing, markup.markup_total)
  }

  // Check if quote is selected (determines whether to include pricing sheet)
  const { data: selection } = await supabase
    .from('quote_selections').select('selected_quote_id')
    .eq('request_id', quote.request_id).maybeSingle()

  const isSelected = selection?.selected_quote_id === quoteId

  // Get landco profile
  const { data: landcoProfile } = await adminClient
    .from('profiles').select('company_name').eq('id', quote.landco_id).single()

  const totalPeople = calculateTotalPeople({
    adults: req.adults, children: req.children,
    infants: req.infants, leaders: req.leaders,
  })

  const workbook = await generateFilledQuoteTemplate(
    {
      event_name: req.event_name,
      destination_country: req.destination_country,
      destination_city: req.destination_city,
      depart_date: req.depart_date,
      return_date: req.return_date,
      total_people: totalPeople,
      adults: req.adults,
      children: req.children,
      infants: req.infants,
      leaders: req.leaders,
      hotel_grade: req.hotel_grade,
      landco_name: landcoProfile?.company_name ?? '',
      flight_schedule: req.flight_schedule,
    },
    { itinerary: draft.itinerary, pricing },
  )

  // If not selected, remove the pricing sheet
  if (!isSelected) {
    const pricingSheet = workbook.getWorksheet('견적서')
    if (pricingSheet) {
      workbook.removeWorksheet(pricingSheet.id)
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = encodeURIComponent(quote.file_name || 'quote.xlsx')

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
