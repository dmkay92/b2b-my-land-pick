import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSelectedEmail } from '@/lib/email/notifications'
import { extractQuotePricing } from '@/lib/excel/parse'

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

  // 이미 입금대기 또는 확정된 경우 차단
  if (qr?.status === 'payment_pending' || qr?.status === 'finalized') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 409 })
  }

  // 선택 기록 저장 (finalized_at은 null — 랜드사 입금확인 후 설정)
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
    .from('quotes').select('file_url').eq('id', quoteId).single()
  const pricingResult = await extractQuotePricing(quoteData!.file_url)

  const landcoQuoteTotal = pricingResult.total ?? 0
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
    agency_markup: agencyMarkup,
    agency_commission_rate: agencyCommissionRate,
    platform_gross_revenue: platformGrossRevenue,
    agency_payout: agencyPayout,
    platform_net_revenue: platformNetRevenue,
    landco_payout: landcoPayout,
    gmv,
  }, { onConflict: 'request_id' })

  return NextResponse.json({ success: true })
}
