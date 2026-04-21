import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: quoteId } = await params

  const { data: quote } = await supabase
    .from('quotes').select('*').eq('id', quoteId).single()
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: req } = await supabase
    .from('quote_requests').select('*').eq('id', quote.request_id).single()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Read itinerary/pricing from quote record (persisted at submit time)
  if (!quote.itinerary || !quote.pricing) {
    return NextResponse.json({ error: 'Quote data not found' }, { status: 404 })
  }
  const draft = { itinerary: quote.itinerary, pricing: quote.pricing }

  // Get agency markup — try this quote first, then fallback to any quote in the same request
  let markup = null
  const { data: directMarkup } = await supabase
    .from('agency_markups').select('markup_per_person, markup_total')
    .eq('quote_id', quoteId).eq('agency_id', user.id).maybeSingle()
  if (directMarkup) {
    markup = directMarkup
  } else {
    const { data: requestQuotes } = await supabase
      .from('quotes').select('id').eq('request_id', quote.request_id)
    const qIds = (requestQuotes ?? []).map(q => q.id)
    if (qIds.length > 0) {
      const { data: fallbackMarkup } = await supabase
        .from('agency_markups').select('markup_per_person, markup_total')
        .eq('agency_id', user.id).in('quote_id', qIds).limit(1).maybeSingle()
      markup = fallbackMarkup
    }
  }

  // Check selection
  const { data: selection } = await supabase
    .from('quote_selections').select('selected_quote_id')
    .eq('request_id', quote.request_id).maybeSingle()
  const isSelected = selection?.selected_quote_id === quoteId

  // Get landco name
  const { data: landcoProfile } = await adminClient
    .from('profiles').select('company_name').eq('id', quote.landco_id).single()

  return NextResponse.json({
    quote: { id: quote.id, request_id: quote.request_id, landco_id: quote.landco_id, status: quote.status, file_name: quote.file_name },
    request: req,
    draft: { itinerary: draft.itinerary, pricing: draft.pricing },
    pricing_mode: quote.pricing_mode ?? 'detailed',
    summary_total: quote.summary_total ?? 0,
    summary_per_person: quote.summary_per_person ?? 0,
    markup: markup ?? null,
    isSelected,
    landcoName: landcoProfile?.company_name ?? '',
  })
}
