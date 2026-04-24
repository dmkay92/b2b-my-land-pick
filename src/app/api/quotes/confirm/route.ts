import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSelectedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, quoteId, landcoId } = await request.json()
  if (!requestId || !quoteId || !landcoId) {
    return NextResponse.json({ error: 'requestId, quoteId, landcoId required' }, { status: 400 })
  }

  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id, event_name, status').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 이미 결제대기 또는 확정된 경우 차단
  if (qr?.status === 'payment_pending' || qr?.status === 'finalized') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 409 })
  }

  // 선택 기록 저장 (finalized_at은 null — 랜드사 결제확인 후 설정)
  await supabase.from('quote_selections').upsert({
    request_id: requestId,
    selected_quote_id: quoteId,
    landco_id: landcoId,
    finalized_at: null,
  }, { onConflict: 'request_id' })

  // 선택된 견적서 상태: selected
  await supabase.from('quotes').update({ status: 'selected' }).eq('id', quoteId)

  // 요청 상태: payment_pending
  await supabase.from('quote_requests').update({ status: 'payment_pending' }).eq('id', requestId)

  // 랜드사 알림 (선택됨)
  await supabase.from('notifications').insert({
    user_id: landcoId,
    type: 'quote_selected',
    payload: { request_id: requestId, event_name: qr?.event_name },
  })

  const { data: landco } = await supabase
    .from('profiles').select('email, company_name').eq('id', landcoId).single()
  if (landco) {
    await sendQuoteSelectedEmail({
      to: landco.email,
      company_name: landco.company_name,
      event_name: qr?.event_name ?? '',
      request_id: requestId,
    })
  }

  // Create settlement record
  const { data: marginSetting } = await supabase
    .from('platform_settings').select('value').eq('key', 'margin_rate').single()
  const platformFeeRate = marginSetting ? Number(marginSetting.value) : 0.05

  const { data: markup } = await supabase
    .from('agency_markups').select('markup_total')
    .eq('quote_id', quoteId).eq('agency_id', user.id).maybeSingle()
  const agencyMarkup = markup?.markup_total ?? 0

  const { data: quoteData } = await supabase
    .from('quotes').select('file_url, pricing_mode, summary_total, summary_per_person, pricing').eq('id', quoteId).single()

  // KRW 환산된 랜드사 견적 총액
  let landcoQuoteTotal: number
  if (quoteData?.pricing_mode === 'summary') {
    const pricingJson = quoteData.pricing as { currencies?: Record<string, string>; exchangeRates?: Record<string, number> } | null
    const summaryCurrency = pricingJson?.currencies?.['summary'] ?? 'KRW'
    const exRate = pricingJson?.exchangeRates?.[summaryCurrency] ?? 0
    const rawTotal = quoteData.summary_total ?? 0
    landcoQuoteTotal = summaryCurrency === 'KRW' ? rawTotal : (exRate > 0 ? Math.round(rawTotal * exRate) : rawTotal)
  } else {
    // 항목별: pricing JSON에서 KRW 환산
    const pricingJson = quoteData?.pricing as { 호텔?: { price: number; count: number; quantity: number; currency?: string }[]; 차량?: { price: number; count: number; quantity: number; currency?: string }[]; 식사?: { price: number; count: number; quantity: number; currency?: string }[]; 입장료?: { price: number; count: number; quantity: number; currency?: string }[]; 가이드비용?: { price: number; count: number; quantity: number; currency?: string }[]; 기타?: { price: number; count: number; quantity: number; currency?: string }[]; exchangeRates?: Record<string, number> } | null
    const exchangeRates = pricingJson?.exchangeRates ?? {}
    const categories = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
    let krwTotal = 0
    for (const cat of categories) {
      for (const r of (pricingJson?.[cat] ?? [])) {
        const cur = r.currency ?? 'KRW'
        const rowTotal = (r.price ?? 0) * (r.count ?? 0) * (r.quantity ?? 0)
        if (cur === 'KRW') krwTotal += rowTotal
        else {
          const rate = exchangeRates[cur] ?? 0
          krwTotal += rate > 0 ? Math.round(rowTotal * rate) : 0
        }
      }
    }
    landcoQuoteTotal = krwTotal
  }
  const platformFee = Math.round(landcoQuoteTotal * platformFeeRate)
  const agencyCommissionRate = 1.0
  const platformGrossRevenue = platformFee + agencyMarkup
  const agencyPayout = Math.round(agencyMarkup * agencyCommissionRate)
  const platformNetRevenue = platformGrossRevenue - agencyPayout
  const landcoPayout = landcoQuoteTotal - platformFee
  const gmv = landcoQuoteTotal + agencyMarkup

  await supabase.from('quote_settlements').upsert({
    request_id: requestId,
    quote_id: quoteId,
    landco_id: landcoId,
    agency_id: user.id,
    landco_quote_total: landcoQuoteTotal,
    platform_fee_rate: platformFeeRate,
    platform_fee: platformFee,
    platform_fee_supply: Math.round(platformFee / 1.1),
    platform_fee_vat: platformFee - Math.round(platformFee / 1.1),
    agency_markup: agencyMarkup,
    agency_commission_rate: agencyCommissionRate,
    platform_gross_revenue: platformGrossRevenue,
    agency_payout: agencyPayout,
    agency_payout_supply: Math.round(agencyPayout / 1.1),
    agency_payout_vat: agencyPayout - Math.round(agencyPayout / 1.1),
    platform_net_revenue: platformNetRevenue,
    landco_payout: landcoPayout,
    gmv,
  }, { onConflict: 'request_id' })

  // Create payment schedule
  const { getDefaultTemplateType, buildInstallments } = await import('@/lib/payment/schedule')
  const { calculateTotalPeople } = await import('@/lib/utils')

  const { data: fullRequest } = await supabase
    .from('quote_requests').select('depart_date, adults, children, infants, leaders')
    .eq('id', requestId).single()

  const totalPeople = calculateTotalPeople({
    adults: fullRequest?.adults ?? 0, children: fullRequest?.children ?? 0,
    infants: fullRequest?.infants ?? 0, leaders: fullRequest?.leaders ?? 0,
  })

  const templateType = getDefaultTemplateType(totalPeople)
  const installmentDrafts = buildInstallments(templateType, gmv, fullRequest!.depart_date)

  const { data: settlement } = await supabase
    .from('quote_settlements').select('id').eq('request_id', requestId).single()

  const { data: schedule } = await supabase
    .from('payment_schedules').upsert({
      request_id: requestId,
      settlement_id: settlement?.id ?? null,
      template_type: templateType,
      total_amount: gmv,
      total_people: totalPeople,
    }, { onConflict: 'request_id' }).select().single()

  if (schedule) {
    await supabase.from('payment_installments').delete().eq('schedule_id', schedule.id)
    for (const inst of installmentDrafts) {
      await supabase.from('payment_installments').insert({
        schedule_id: schedule.id,
        ...inst,
      })
    }
  }

  return NextResponse.json({ success: true })
}
