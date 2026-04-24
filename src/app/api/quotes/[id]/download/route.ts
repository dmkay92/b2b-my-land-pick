import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateFilledQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'
import { distributeMealExcludedMarkup } from '@/lib/pricing/markup'

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

  // Admin client for cross-user profile lookup (bypasses RLS)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Read itinerary/pricing from quote record (persisted at submit time)
  if (!quote.itinerary || !quote.pricing) {
    return NextResponse.json({ error: 'Quote data not found' }, { status: 404 })
  }
  const draft = { itinerary: quote.itinerary, pricing: quote.pricing }

  // Get platform margin rate
  const { data: marginSetting } = await supabase
    .from('platform_settings').select('value').eq('key', 'margin_rate').single()
  const marginRate = marginSetting ? Number(marginSetting.value) : 0.05

  // Check user role
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  const isAgency = profile?.role === 'agency'

  // Get agency markup — query param takes priority, then DB lookup
  const markupParam = request.nextUrl.searchParams.get('markup')
  let markupTotal = 0

  if (markupParam) {
    markupTotal = Number(markupParam) || 0
  } else {
    const agencyId = isAgency ? user.id : req.agency_id
    const { data: directMarkup } = await supabase
      .from('agency_commissions').select('commission_total')
      .eq('quote_id', quoteId).eq('agency_id', agencyId).maybeSingle()
    if (directMarkup) {
      markupTotal = directMarkup.commission_total ?? 0
    } else {
      const { data: requestQuotes } = await supabase
        .from('quotes').select('id').eq('request_id', quote.request_id)
      const qIds = (requestQuotes ?? []).map(q => q.id)
      if (qIds.length > 0) {
        const { data: fallbackMarkup } = await supabase
          .from('agency_commissions').select('commission_total')
          .eq('agency_id', agencyId).in('quote_id', qIds).limit(1).maybeSingle()
        markupTotal = fallbackMarkup?.commission_total ?? 0
      }
    }
  }

  // Apply agency markup if exists
  const isSummaryMode = quote.pricing_mode === 'summary'
  let pricing = draft.pricing

  if (isSummaryMode) {
    // 합계만 모드: pricing을 빈 데이터로 교체하고 KRW 환산된 총액을 넣음
    const summaryCurrency = (draft.pricing as { currencies?: Record<string, string> })?.currencies?.['summary'] ?? 'KRW'
    const exRate = (draft.pricing as { exchangeRates?: Record<string, number> })?.exchangeRates?.[summaryCurrency] ?? 0
    const rawTotal = quote.summary_total ?? 0
    const krwTotal = summaryCurrency === 'KRW' ? rawTotal : (exRate > 0 ? Math.round(rawTotal * exRate) : rawTotal)
    const finalTotal = krwTotal + markupTotal

    // 기타 카테고리에 총액을 하나의 row로 넣어서 일정표 합계가 정확하게 나오도록
    pricing = {
      호텔: [], 차량: [], 식사: [], 입장료: [], 가이드비용: [],
      기타: [{ date: '', detail: '견적 합계', price: finalTotal, count: 1, quantity: 1, currency: 'KRW' }],
    }
  } else if (markupTotal > 0) {
    // 모든 항목이 KRW인지 확인
    const categories = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
    const allKrw = categories.every(cat =>
      (draft.pricing[cat] ?? []).every((r: { currency?: string }) => (r.currency ?? 'KRW') === 'KRW')
    )

    if (allKrw) {
      // KRW만 사용: 기존처럼 pricing에 마크업 녹임
      pricing = distributeMealExcludedMarkup(pricing, markupTotal)
    } else {
      // 외화 포함: 마크업은 pricing에 녹이지 않음 (환율 이중 적용 방지)
      // template.ts의 일정표 합계는 원본 pricing 기준으로 계산됨
      // 마크업은 일정표 합계 계산 후 별도 처리 필요 → markup 정보를 opts로 전달
      pricing = draft.pricing
    }
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

  // 외화 + 마크업일 때 markup_krw를 opts로 전달
  const allKrwCheck = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
  const isAllKrw = !isSummaryMode && allKrwCheck.every(cat =>
    (draft.pricing[cat] ?? []).every((r: { currency?: string }) => (r.currency ?? 'KRW') === 'KRW')
  )
  const markupForTemplate = (!isAllKrw && !isSummaryMode && markupTotal > 0) ? markupTotal : 0

  const workbook = await generateFilledQuoteTemplate(
    {
      event_name: req.event_name,
      destination: `${req.destination_country} ${req.destination_city}`.trim(),
      depart_date: req.depart_date,
      return_date: req.return_date,
      total_people: totalPeople,
      adults: req.adults,
      children: req.children,
      infants: req.infants,
      leaders: req.leaders,
      hotel_grade: req.hotel_grade,
      landco_name: landcoProfile?.company_name ?? '',
      markup_krw: markupForTemplate,
    },
    { itinerary: draft.itinerary, pricing },
  )

  // Remove pricing sheet:
  // - summary mode: always remove (no breakdown)
  // - agency: only show if selected
  // - landco: always show their own breakdown
  const isLandco = profile?.role === 'landco'
  const showPricingSheet = isSummaryMode ? false : (isLandco || isSelected)
  if (!showPricingSheet) {
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
