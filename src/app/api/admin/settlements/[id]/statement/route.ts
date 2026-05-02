import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { calculateSettlement } from '@/lib/settlement'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = getAdmin()

  // 정산 데이터
  const { data: settlement } = await admin
    .from('quote_settlements')
    .select('*')
    .eq('id', id)
    .single()
  if (!settlement) return new NextResponse('Not found', { status: 404 })

  // 견적 요청
  const { data: qr } = await admin
    .from('quote_requests')
    .select('*')
    .eq('id', settlement.request_id)
    .single()
  if (!qr) return new NextResponse('Quote request not found', { status: 404 })

  // 랜드사 프로필
  const { data: landco } = await admin
    .from('profiles')
    .select('company_name, business_registration_number, representative_name, bank_name, bank_account, bank_holder')
    .eq('id', settlement.landco_id)
    .single()

  // 결제 현황
  const { data: schedule } = await admin
    .from('payment_schedules')
    .select('id')
    .eq('request_id', settlement.request_id)
    .single()

  let paidAmount = 0
  if (schedule) {
    const { data: installments } = await admin
      .from('payment_installments')
      .select('paid_amount, status')
      .eq('schedule_id', schedule.id)
      .neq('status', 'cancelled')
    paidAmount = (installments ?? []).reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  }

  // 공제 합계
  const { data: claims } = await admin
    .from('deduction_claims')
    .select('approved_amount, total_amount')
    .eq('request_id', settlement.request_id)
    .eq('status', 'approved')

  const approvedDeduction = (claims ?? []).reduce((s, c) => s + (c.approved_amount ?? c.total_amount ?? 0), 0)

  // 정산 계산
  const isCancelled = qr.status === 'cancelled'
  const departDate = new Date(qr.depart_date)
  const now = new Date()
  const daysUntilDepart = Math.ceil((departDate.getTime() - now.getTime()) / 86400000)

  const calc = calculateSettlement({
    landcoQuoteTotal: Number(settlement.landco_quote_total),
    agencyCommission: Number(settlement.agency_markup ?? 0),
    totalCustomerPrice: Number(settlement.gmv),
    paidAmount,
    approvedDeduction,
    isCancelled,
    daysUntilDepart,
  })

  const totalPeople = (qr.adults ?? 0) + (qr.children ?? 0) + (qr.infants ?? 0) + (qr.leaders ?? 0)
  const nights = Math.round((new Date(qr.return_date).getTime() - new Date(qr.depart_date).getTime()) / 86400000)

  const COUNTRY_NAMES: Record<string, string> = {
    JP: '일본', CN: '중국', VN: '베트남', FR: '프랑스', TH: '태국',
    ID: '인도네시아', PH: '필리핀', US: '미국', AU: '호주', TW: '대만',
  }
  const countryName = COUNTRY_NAMES[qr.destination_country] ?? qr.destination_country

  const today = new Date()
  const stlNumber = `STL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${(settlement.display_id ?? id).replace('STL-', '')}`

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>정산 명세서 - ${qr.event_name}</title>
<style>
  @page { size: A4; margin: 0; }
  @media print { body { background: #fff; padding: 0; margin: 0; } .page { box-shadow: none; padding: 52px 56px 48px; width: 100%; } .no-print { display: none !important; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #e5e7eb; display: flex; flex-direction: column; align-items: center; padding: 20px; }
  .no-print { margin-bottom: 16px; }
  .no-print button { padding: 10px 24px; background: #7c3aed; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .no-print button:hover { background: #6d28d9; }
  .page { width: 210mm; background: #fff; padding: 52px 56px 48px; box-shadow: none; }
  .header { margin-bottom: 36px; }
  .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  .logo-area { display: flex; align-items: center; gap: 8px; }
  .logo-area .name { font-size: 22px; font-weight: 800; color: #1e293b; }
  .logo-area .by { font-size: 12px; color: #94a3b8; }
  .header-meta { text-align: right; font-size: 11px; color: #64748b; line-height: 1.5; }
  .invoice-label { font-size: 20px; font-weight: 800; color: #1e293b; text-align: center; letter-spacing: 4px; padding: 12px 0; border-top: 2px solid #1e293b; border-bottom: 2px solid #1e293b; }
  .parties { margin: 28px 0; display: flex; gap: 40px; }
  .party-section { flex: 1; }
  .party-tag { font-size: 11px; font-weight: 700; color: #1e293b; text-decoration: underline; text-underline-offset: 3px; margin-bottom: 8px; }
  .party-name { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
  .party-details { font-size: 12px; color: #64748b; line-height: 1.7; }
  .event-section { border: 1px solid #d1d5db; padding: 16px 20px; margin-bottom: 28px; }
  .event-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
  .event-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 32px; }
  .event-item { display: flex; font-size: 12px; line-height: 1.8; }
  .event-item .el { color: #94a3b8; width: 60px; flex-shrink: 0; }
  .event-item .ev { color: #334155; font-weight: 600; }
  .calc-table { width: 100%; border-collapse: collapse; border: 1px solid #1e293b; margin-bottom: 0; }
  .calc-table thead th { background: #1e293b; color: #fff; font-size: 11px; font-weight: 600; padding: 10px 16px; text-align: left; }
  .calc-table thead th:last-child { text-align: right; }
  .calc-table tbody td { font-size: 13px; color: #334155; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
  .calc-table tbody td:last-child { text-align: right; font-weight: 600; }
  .calc-table tbody tr.sub td { background: #f8fafc; color: #64748b; font-size: 12px; padding-left: 32px; }
  .total-row { width: 100%; border-collapse: collapse; margin-top: 0; }
  .total-row td { padding: 14px 16px; font-size: 14px; font-weight: 700; color: #1e293b; border: 2px solid #1e293b; }
  .total-row td:first-child { text-align: center; background: #f8fafc; width: 50%; }
  .total-row td:last-child { text-align: right; font-size: 18px; color: #7c3aed; }
  .bank-section { margin-top: 28px; }
  .bank-title { font-size: 13px; font-weight: 700; color: #1e293b; text-decoration: underline; text-underline-offset: 3px; margin-bottom: 10px; }
  .bank-grid { font-size: 12px; color: #334155; line-height: 1.8; }
  .bank-row { display: flex; }
  .bank-row .rl { color: #64748b; width: 72px; flex-shrink: 0; }
  .bank-row .rv { font-weight: 500; }
  .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-left { font-size: 10px; color: #94a3b8; line-height: 1.6; }
  .footer-right { display: flex; align-items: center; gap: 4px; font-size: 10px; }
  .footer-right .name { font-weight: 700; color: #94a3b8; }
  .footer-right .sub { color: #cbd5e1; }
</style>
</head>
<body>
<div class="no-print"><button onclick="window.print()">PDF 다운로드 / 인쇄</button></div>
<div class="page">
  <div class="header">
    <div class="header-top">
      <div class="logo-area">
        <span class="name">마이랜드픽</span>
        <span class="by">by Myrealtrip</span>
      </div>
      <div class="header-meta">${stlNumber}<br>${formatDate(today.toISOString())} 발행</div>
    </div>
    <div class="invoice-label">정산 명세서</div>
  </div>

  <div class="parties">
    <div class="party-section">
      <div class="party-tag">공급자</div>
      <div class="party-name">주식회사 마이리얼트립</div>
      <div class="party-details">서울특별시 서초구 강남대로 311, 18층<br>사업자등록번호 : 209-81-55339<br>대표자 : 이동건</div>
    </div>
    <div class="party-section">
      <div class="party-tag">공급받는자 (랜드사)</div>
      <div class="party-name">${landco?.company_name ?? '-'}</div>
      <div class="party-details">
        ${landco?.business_registration_number ? `사업자등록번호 : ${landco.business_registration_number}<br>` : ''}
        ${landco?.representative_name ? `대표자 : ${landco.representative_name}` : ''}
      </div>
    </div>
  </div>

  <div class="event-section">
    <div class="event-title">${qr.event_name}${isCancelled ? ' (취소)' : ''}</div>
    <div class="event-grid">
      <div class="event-item"><span class="el">목적지</span><span class="ev">${countryName} ${qr.destination_city}</span></div>
      <div class="event-item"><span class="el">여행기간</span><span class="ev">${qr.depart_date.slice(0, 10)} ~ ${qr.return_date.slice(0, 10)}</span></div>
      <div class="event-item"><span class="el">인원</span><span class="ev">${totalPeople}명</span></div>
      <div class="event-item"><span class="el">일정</span><span class="ev">${nights}박 ${nights + 1}일</span></div>
    </div>
  </div>

  <table class="calc-table">
    <thead>
      <tr>
        <th>항목</th>
        <th>금액 (원)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>랜드사 견적가</td>
        <td>${fmt(Number(settlement.landco_quote_total))}</td>
      </tr>
      <tr class="sub">
        <td>플랫폼 수수료 (5%)</td>
        <td>-${fmt(calc.platformFee)}</td>
      </tr>
      ${approvedDeduction > 0 ? `
      <tr class="sub">
        <td>공제 내역 (승인 합계)</td>
        <td>-${fmt(approvedDeduction)}</td>
      </tr>
      ` : ''}
      ${isCancelled ? `
      <tr class="sub">
        <td>취소 환불율</td>
        <td>${calc.refundRateLabel}</td>
      </tr>
      ` : ''}
    </tbody>
  </table>

  <table class="total-row">
    <tr>
      <td>랜드사 정산금</td>
      <td>KRW ${fmt(calc.landcoPayout)}</td>
    </tr>
  </table>

  <div style="margin-top: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0;">
    <div style="font-size: 12px; color: #64748b; line-height: 1.8;">
      <div style="display: flex; justify-content: space-between;"><span>여행사 수수료</span><span style="color: #334155; font-weight: 600;">${fmt(calc.agencyPayout)}원</span></div>
      <div style="display: flex; justify-content: space-between;"><span>플랫폼 수익</span><span style="color: #334155; font-weight: 600;">${fmt(calc.platformRevenue)}원</span></div>
      ${calc.customerRefund > 0 ? `<div style="display: flex; justify-content: space-between;"><span>고객 환불액</span><span style="color: #dc2626; font-weight: 600;">${fmt(calc.customerRefund)}원</span></div>` : ''}
    </div>
  </div>

  <div class="bank-section">
    <div class="bank-title">랜드사 입금 계좌</div>
    <div class="bank-grid">
      <div class="bank-row"><span class="rl">은행</span><span class="rv">${landco?.bank_name ?? '-'}</span></div>
      <div class="bank-row"><span class="rl">계좌번호</span><span class="rv">${landco?.bank_account ?? '-'}</span></div>
      <div class="bank-row"><span class="rl">예금주</span><span class="rv">${landco?.bank_holder ?? '-'}</span></div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-left">주식회사 마이리얼트립 &middot; 209-81-55339<br>서울특별시 서초구 강남대로 311, 18층</div>
    <div class="footer-right"><span class="name">마이랜드픽</span><span class="sub">by Myrealtrip</span></div>
  </div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
