import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const LANDCO_STATUS_LABELS: Record<string, string> = {
  reviewing: '검토중',
  confirmed: '확정',
  paid: '지급완료',
}

const AGENCY_STATUS_LABELS: Record<string, string> = {
  accrued: '적립',
  payable: '지급대기',
  paid: '지급완료',
}

// GET — 정산 원장 엑셀 다운로드
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const tab = request.nextUrl.searchParams.get('tab') ?? 'reviewing'

  // Tab filter — same logic as list API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin
    .from('settlement_ledger')
    .select('*')
    .order('created_at', { ascending: false })

  if (tab === 'reviewing') {
    query = query.eq('landco_payout_status', 'reviewing')
  } else if (tab === 'confirmed') {
    query = query.eq('landco_payout_status', 'confirmed')
  } else if (tab === 'landco_paid') {
    query = query.eq('landco_payout_status', 'paid')
  } else if (tab === 'agency_payable') {
    query = query.eq('agency_payout_status', 'payable')
  } else if (tab === 'agency_paid') {
    query = query.eq('agency_payout_status', 'paid')
  }
  // tab === 'all': no filter

  const { data: rawLedger, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = rawLedger ?? []

  // Enrich with joined data (same as list API)
  if (rows.length > 0) {
    const requestIds = [...new Set((rows as { request_id: string }[]).map(r => r.request_id))]
    const installmentIds = [...new Set((rows as { installment_id: string }[]).map(r => r.installment_id).filter(Boolean))]

    const [
      { data: requests },
      { data: settlements },
      { data: installments },
    ] = await Promise.all([
      admin
        .from('quote_requests')
        .select('id, display_id, event_name, depart_date, return_date, created_at, agency_id')
        .in('id', requestIds),
      admin
        .from('quote_settlements')
        .select('request_id, landco_id, agency_id')
        .in('request_id', requestIds),
      installmentIds.length > 0
        ? admin.from('payment_installments').select('id, display_id, label').in('id', installmentIds)
        : Promise.resolve({ data: [] }),
    ])

    const profileIds: string[] = []
    for (const s of settlements ?? []) {
      if (s.landco_id) profileIds.push(s.landco_id)
      if (s.agency_id) profileIds.push(s.agency_id)
    }
    const uniqueProfileIds = [...new Set(profileIds)]
    const { data: profiles } = uniqueProfileIds.length > 0
      ? await admin.from('profiles').select('id, company_name').in('id', uniqueProfileIds)
      : { data: [] }

    const requestMap = Object.fromEntries((requests ?? []).map(r => [r.id, r]))
    const settlementMap = Object.fromEntries((settlements ?? []).map(s => [s.request_id, s]))
    const installmentMap = Object.fromEntries((installments ?? []).map(i => [i.id, i]))
    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

    // Mutate rows in place for Excel use
    for (const row of rows) {
      const qr = requestMap[row.request_id] ?? null
      const settlement = settlementMap[row.request_id] ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst = installmentMap[(row as any).installment_id] ?? null
      const landco = settlement?.landco_id ? profileMap[settlement.landco_id] : null
      const agency = settlement?.agency_id ? profileMap[settlement.agency_id] : null

      row._request = qr
      row._installment = inst
      row._landco_name = landco?.company_name ?? null
      row._agency_name = agency?.company_name ?? null
    }
  }

  // Build Excel workbook
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MyLandPick Admin'
  wb.created = new Date()

  const ws = wb.addWorksheet('정산 원장')

  ws.columns = [
    { header: '요청ID', key: 'request_display_id', width: 18 },
    { header: '정산ID', key: 'display_id', width: 18 },
    { header: '결제ID', key: 'installment_display_id', width: 18 },
    { header: '행사명', key: 'event_name', width: 30 },
    { header: '여행사', key: 'agency_name', width: 22 },
    { header: '랜드사', key: 'landco_name', width: 22 },
    { header: '항목', key: 'installment_label', width: 16 },
    { header: '납부액', key: 'paid_amount', width: 16 },
    { header: '플랫폼수수료', key: 'platform_fee', width: 16 },
    { header: '여행사수수료', key: 'agency_fee', width: 16 },
    { header: '랜드사정산금', key: 'landco_payout_amount', width: 16 },
    { header: '랜드사상태', key: 'landco_payout_status', width: 14 },
    { header: '여행사상태', key: 'agency_payout_status', width: 14 },
    { header: '요청일', key: 'request_created_at', width: 14 },
    { header: '여행시작일', key: 'depart_date', width: 14 },
    { header: '여행종료일', key: 'return_date', width: 14 },
    { header: '생성일', key: 'created_at', width: 14 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      left: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      right: { style: 'thin', color: { argb: 'FF1D4ED8' } },
    }
  })
  headerRow.height = 22

  // Add data rows
  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const qr = r._request
    const inst = r._installment

    const dataRow = ws.addRow({
      request_display_id: qr?.display_id ?? '',
      display_id: r.display_id ?? r.id?.slice(0, 8) ?? '',
      installment_display_id: inst?.display_id ?? '',
      event_name: qr?.event_name ?? '',
      agency_name: r._agency_name ?? '',
      landco_name: r._landco_name ?? '',
      installment_label: inst?.label ?? '',
      paid_amount: r.paid_amount ?? 0,
      platform_fee: r.platform_fee ?? 0,
      agency_fee: r.agency_fee ?? 0,
      landco_payout_amount: r.landco_payout_amount ?? 0,
      landco_payout_status: LANDCO_STATUS_LABELS[r.landco_payout_status] ?? r.landco_payout_status ?? '',
      agency_payout_status: AGENCY_STATUS_LABELS[r.agency_payout_status] ?? r.agency_payout_status ?? '',
      request_created_at: qr?.created_at ? qr.created_at.slice(0, 10) : '',
      depart_date: qr?.depart_date ? qr.depart_date.slice(0, 10) : '',
      return_date: qr?.return_date ? qr.return_date.slice(0, 10) : '',
      created_at: r.created_at ? r.created_at.slice(0, 10) : '',
    })

    // Number formatting for amount columns
    dataRow.getCell('paid_amount').numFmt = '#,##0'
    dataRow.getCell('platform_fee').numFmt = '#,##0'
    dataRow.getCell('agency_fee').numFmt = '#,##0'
    dataRow.getCell('landco_payout_amount').numFmt = '#,##0'

    // Alternating row color
    const isEven = (dataRow.number - 2) % 2 === 0
    dataRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFDBEAFE' : 'FFFFFFFF' },
      }
      cell.alignment = { vertical: 'middle' }
    })
  }

  // Freeze header row
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="settlement_ledger_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
