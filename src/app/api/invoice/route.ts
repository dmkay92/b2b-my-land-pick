import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { calculateTotalPeople } from '@/lib/utils'

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

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return new NextResponse('requestId required', { status: 400 })

  const admin = getAdmin()

  // 데이터 조회
  const { data: qr } = await admin.from('quote_requests').select('*').eq('id', requestId).single()
  if (!qr) return new NextResponse('Not found', { status: 404 })

  const { data: schedule } = await admin.from('payment_schedules').select('*').eq('request_id', requestId).single()
  if (!schedule) return new NextResponse('Payment schedule not found', { status: 404 })

  const { data: installments } = await admin
    .from('payment_installments').select('*')
    .eq('schedule_id', schedule.id)
    .order('rate', { ascending: false })

  const regularInstallments = (installments ?? []).filter(i => i.rate > 0 && i.status !== 'cancelled')
  const additionalInstallments = (installments ?? []).filter(i => i.rate === 0 && i.status !== 'cancelled')

  const totalPeople = calculateTotalPeople({ adults: qr.adults, children: qr.children, infants: qr.infants, leaders: qr.leaders })
  const nights = Math.round((new Date(qr.return_date).getTime() - new Date(qr.depart_date).getTime()) / 86400000)

  const today = new Date()
  const invNumber = `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${(qr.display_id ?? requestId).replace('REQ-', '')}`

  // 국가명
  const COUNTRY_NAMES: Record<string, string> = { JP: '일본', CN: '중국', VN: '베트남', FR: '프랑스', TH: '태국', ID: '인도네시아', PH: '필리핀', US: '미국', AU: '호주', TW: '대만' }
  const countryName = COUNTRY_NAMES[qr.destination_country] ?? qr.destination_country

  // 결제 회차 테이블 행
  const installmentRows = regularInstallments.map((inst, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${inst.label}</td>
      <td>${Math.round(inst.rate * 100)}%</td>
      <td>${inst.due_date}</td>
      <td>${fmt(inst.amount)}</td>
    </tr>
  `).join('')

  const additionalRows = additionalInstallments.map((inst, idx) => `
    <tr>
      <td>${regularInstallments.length + idx + 1}</td>
      <td>${inst.label}</td>
      <td>-</td>
      <td>${inst.due_date}</td>
      <td>${fmt(inst.amount)}</td>
    </tr>
  `).join('')

  const totalAmount = [...regularInstallments, ...additionalInstallments].reduce((s, i) => s + i.amount, 0)

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>INVOICE - ${qr.event_name}</title>
<style>
  @page { size: A4; margin: 0; }
  @media print { body { background: #fff; padding: 0; margin: 0; } .page { box-shadow: none; padding: 52px 56px 48px; width: 100%; } .no-print { display: none !important; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #e5e7eb; display: flex; flex-direction: column; align-items: center; padding: 20px; }
  .no-print { margin-bottom: 16px; }
  .no-print button { padding: 10px 24px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .no-print button:hover { background: #1d4ed8; }
  .page {
    width: 210mm; background: #fff;
    padding: 52px 56px 48px;
    box-shadow: none;
  }
  .header { margin-bottom: 36px; }
  .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  .logo-area { display: flex; align-items: center; gap: 8px; }
  .logo-area .name { font-size: 22px; font-weight: 800; color: #1e293b; }
  .logo-area .by { font-size: 12px; color: #94a3b8; }
  .header-meta { text-align: right; font-size: 11px; color: #64748b; line-height: 1.5; }
  .invoice-label { font-size: 24px; font-weight: 800; color: #1e293b; text-align: center; letter-spacing: 6px; padding: 12px 0; }
  .parties { margin: 28px 0; }
  .party-section { margin-bottom: 20px; }
  .party-tag { font-size: 11px; font-weight: 700; color: #1e293b; text-decoration: underline; text-underline-offset: 3px; margin-bottom: 8px; }
  .party-name { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
  .party-details { font-size: 12px; color: #64748b; line-height: 1.7; }
  .event-section { border: 1px solid #d1d5db; padding: 16px 20px; margin-bottom: 28px; }
  .event-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
  .event-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 32px; }
  .event-item { display: flex; font-size: 12px; line-height: 1.8; }
  .event-item .el { color: #94a3b8; width: 60px; flex-shrink: 0; }
  .event-item .ev { color: #334155; font-weight: 600; }
  .items-table { width: 100%; border-collapse: collapse; border: 1px solid #1e293b; }
  .items-table thead th { background: #1e293b; color: #fff; font-size: 11px; font-weight: 600; padding: 10px 16px; text-align: left; }
  .items-table thead th:nth-child(3), .items-table thead th:nth-child(4) { text-align: center; }
  .items-table thead th:last-child { text-align: right; }
  .items-table tbody td { font-size: 13px; color: #334155; padding: 13px 16px; border-bottom: 1px solid #e2e8f0; }
  .items-table tbody td:first-child { font-weight: 500; }
  .items-table tbody td:nth-child(3), .items-table tbody td:nth-child(4) { text-align: center; color: #64748b; }
  .items-table tbody td:last-child { text-align: right; font-weight: 600; }
  .total-row-table { width: 100%; border-collapse: collapse; margin-top: 0; }
  .total-row-table td { padding: 12px 16px; font-size: 14px; font-weight: 700; color: #1e293b; border: 1px solid #1e293b; }
  .total-row-table td:first-child { text-align: center; background: #f8fafc; width: 50%; }
  .total-row-table td:last-child { text-align: right; font-size: 16px; }
  .remittance { margin-top: 28px; }
  .remittance-title { font-size: 13px; font-weight: 700; color: #1e293b; text-decoration: underline; text-underline-offset: 3px; margin-bottom: 10px; }
  .remittance-grid { font-size: 12px; color: #334155; line-height: 1.8; }
  .remittance-row { display: flex; }
  .remittance-row .rl { color: #64748b; width: 72px; flex-shrink: 0; }
  .remittance-row .rv { font-weight: 500; }
  .notes-box { margin-top: 20px; border: 1px solid #d1d5db; display: inline-flex; overflow: hidden; }
  .notes-box .nb-label { background: #f8fafc; padding: 10px 14px; font-size: 12px; font-weight: 700; color: #1e293b; border-right: 1px solid #d1d5db; display: flex; align-items: center; white-space: nowrap; }
  .notes-box .nb-value { padding: 10px 14px; font-size: 12px; color: #64748b; display: flex; align-items: center; }
  .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-left { font-size: 10px; color: #94a3b8; line-height: 1.6; }
  .footer-right { display: flex; align-items: center; gap: 4px; font-size: 10px; }
  .footer-right .name { font-weight: 700; color: #94a3b8; }
  .footer-right .sub { color: #cbd5e1; }
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">PDF 다운로드 / 인쇄</button>
</div>

<div class="page">
  <div class="header">
    <div class="header-top">
      <div class="logo-area">
        <span class="name">마이랜드픽</span>
        <span class="by">by Myrealtrip</span>
      </div>
      <div class="header-meta">
        ${invNumber}<br>
        ${formatDate(today.toISOString())} 발행
      </div>
    </div>
    <div class="invoice-label">INVOICE</div>
  </div>

  <div class="parties">
    <div class="party-section">
      <div class="party-tag">공급자</div>
      <div class="party-name">주식회사 마이리얼트립</div>
      <div class="party-details">
        서울특별시 서초구 강남대로 311, 18층<br>
        사업자등록번호 : 209-81-55339<br>
        대표자 : 이동건
      </div>
    </div>
  </div>

  <div class="event-section">
    <div class="event-title">${qr.event_name}</div>
    <div class="event-grid">
      <div class="event-item"><span class="el">목적지</span><span class="ev">${countryName} ${qr.destination_city}</span></div>
      <div class="event-item"><span class="el">여행기간</span><span class="ev">${qr.depart_date.slice(0, 10)} ~ ${qr.return_date.slice(0, 10)}</span></div>
      <div class="event-item"><span class="el">인원</span><span class="ev">${totalPeople}명</span></div>
      <div class="event-item"><span class="el">일정</span><span class="ev">${nights}박 ${nights + 1}일</span></div>
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>No.</th>
        <th>항목</th>
        <th>비율</th>
        <th>납부기한</th>
        <th>금액 (원)</th>
      </tr>
    </thead>
    <tbody>
      ${installmentRows}
    </tbody>
  </table>

  <table class="total-row-table">
    <tr>
      <td>총 결제금액</td>
      <td>KRW ${fmt(regularInstallments.reduce((s, i) => s + i.amount, 0))}</td>
    </tr>
  </table>

  <div class="remittance">
    <div class="remittance-title">입금 안내</div>
    <div class="remittance-grid">
      <div class="remittance-row"><span class="rl">은행</span><span class="rv">우리은행</span></div>
      <div class="remittance-row"><span class="rl">계좌번호</span><span class="rv">1005-604-520904</span></div>
      <div class="remittance-row"><span class="rl">예금주</span><span class="rv">주식회사 마이리얼트립</span></div>
    </div>
  </div>

  <div class="notes-box">
    <div class="nb-label">안내사항</div>
    <div class="nb-value">입금 시 입금자명은 회사명으로 기재해주세요. 확인까지 영업일 기준 1~2일 소요됩니다.</div>
  </div>

  <div class="footer">
    <div class="footer-left">
      주식회사 마이리얼트립 &middot; 209-81-55339<br>
      서울특별시 서초구 강남대로 311, 18층
    </div>
    <div class="footer-right">
      <span class="name">마이랜드픽</span>
      <span class="sub">by Myrealtrip</span>
    </div>
  </div>
</div>

${additionalInstallments.length > 0 ? `
<div class="page" style="page-break-before: always;">
  <div class="header">
    <div class="header-top">
      <div class="logo-area">
        <span class="name">마이랜드픽</span>
        <span class="by">by Myrealtrip</span>
      </div>
      <div class="header-meta">
        ${invNumber}<br>
        ${formatDate(today.toISOString())} 발행
      </div>
    </div>
    <div class="invoice-label">추가 정산</div>
  </div>

  <div class="parties">
    <div class="party-section">
      <div class="party-tag">공급자</div>
      <div class="party-name">주식회사 마이리얼트립</div>
      <div class="party-details">
        서울특별시 서초구 강남대로 311, 18층<br>
        사업자등록번호 : 209-81-55339<br>
        대표자 : 이동건
      </div>
    </div>
  </div>

  <div class="event-section">
    <div class="event-title">${qr.event_name}</div>
    <div class="event-grid">
      <div class="event-item"><span class="el">목적지</span><span class="ev">${countryName} ${qr.destination_city}</span></div>
      <div class="event-item"><span class="el">여행기간</span><span class="ev">${qr.depart_date.slice(0, 10)} ~ ${qr.return_date.slice(0, 10)}</span></div>
      <div class="event-item"><span class="el">인원</span><span class="ev">${totalPeople}명</span></div>
      <div class="event-item"><span class="el">일정</span><span class="ev">${nights}박 ${nights + 1}일</span></div>
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>No.</th>
        <th>항목</th>
        <th>비율</th>
        <th>납부기한</th>
        <th>금액 (원)</th>
      </tr>
    </thead>
    <tbody>
      ${additionalRows}
    </tbody>
  </table>

  <table class="total-row-table">
    <tr>
      <td>추가 정산 합계</td>
      <td>KRW ${fmt(additionalInstallments.reduce((s, i) => s + i.amount, 0))}</td>
    </tr>
  </table>

  <div style="margin-top: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
    <div style="font-size: 11px; color: #64748b; line-height: 1.6;">
      <strong style="color: #1e293b;">기본 결제: </strong>KRW ${fmt(regularInstallments.reduce((s, i) => s + i.amount, 0))}
      &nbsp;&nbsp;+&nbsp;&nbsp;
      <strong style="color: #1e293b;">추가 정산: </strong>KRW ${fmt(additionalInstallments.reduce((s, i) => s + i.amount, 0))}
      &nbsp;&nbsp;=&nbsp;&nbsp;
      <strong style="color: #1e293b; font-size: 13px;">총 합계: KRW ${fmt(totalAmount)}</strong>
    </div>
  </div>

  <div class="footer">
    <div class="footer-left">
      주식회사 마이리얼트립 &middot; 209-81-55339<br>
      서울특별시 서초구 강남대로 311, 18층
    </div>
    <div class="footer-right">
      <span class="name">마이랜드픽</span>
      <span class="sub">by Myrealtrip</span>
    </div>
  </div>
</div>
` : ''}

<script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
