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

const STATUS_LABELS: Record<string, string> = {
  pending: '미납',
  partial: '부분납',
  paid: '납부완료',
  overdue: '연체',
  cancelled: '취소',
}

const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  reviewing: '검토중',
  confirmed: '확정',
  settled: '정산완료',
}

// GET — 결제 회차 목록 엑셀 다운로드
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const statusFilter = request.nextUrl.searchParams.get('status') // 'pending' | 'paid' | 'cancelled' | 'all'

  let query = admin
    .from('payment_installments')
    .select(`
      id,
      display_id,
      label,
      amount,
      paid_amount,
      due_date,
      status,
      settlement_status,
      created_at,
      payment_schedules!inner (
        request_id,
        quote_requests!inner (
          display_id,
          event_name,
          depart_date,
          return_date,
          created_at,
          profiles!quote_requests_agency_id_fkey ( company_name )
        )
      )
    `)
    .order('due_date', { ascending: true })

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'pending') {
      query = query.in('status', ['pending', 'overdue'])
    } else {
      query = query.eq('status', statusFilter)
    }
  }

  const { data: installments, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Build Excel workbook
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MyLandPick Admin'
  wb.created = new Date()

  const ws = wb.addWorksheet('결제 목록')

  // Column definitions
  ws.columns = [
    { header: '결제ID', key: 'display_id', width: 18 },
    { header: '요청ID', key: 'request_display_id', width: 18 },
    { header: '행사명', key: 'event_name', width: 30 },
    { header: '여행사', key: 'company_name', width: 22 },
    { header: '항목', key: 'label', width: 16 },
    { header: '금액', key: 'amount', width: 16 },
    { header: '납부액', key: 'paid_amount', width: 16 },
    { header: '납부기한', key: 'due_date', width: 14 },
    { header: '상태', key: 'status', width: 12 },
    { header: '정산상태', key: 'settlement_status', width: 12 },
    { header: '요청일', key: 'request_created_at', width: 14 },
    { header: '여행시작일', key: 'depart_date', width: 14 },
    { header: '여행종료일', key: 'return_date', width: 14 },
  ]

  // Style header row (blue background, white bold text)
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
  for (const inst of installments ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedule = (inst as any).payment_schedules
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qr = schedule?.quote_requests as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agency = qr?.profiles as any

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settlementStatus = (inst as any).settlement_status as string | null

    const row = ws.addRow({
      display_id: (inst as any).display_id ?? inst.id,
      request_display_id: qr?.display_id ?? '',
      event_name: qr?.event_name ?? '',
      company_name: agency?.company_name ?? '',
      label: inst.label ?? '',
      amount: inst.amount ?? 0,
      paid_amount: inst.paid_amount ?? 0,
      due_date: inst.due_date ? inst.due_date.slice(0, 10) : '',
      status: STATUS_LABELS[inst.status] ?? inst.status,
      settlement_status: settlementStatus ? (SETTLEMENT_STATUS_LABELS[settlementStatus] ?? settlementStatus) : '-',
      request_created_at: qr?.created_at ? qr.created_at.slice(0, 10) : '',
      depart_date: qr?.depart_date ? qr.depart_date.slice(0, 10) : '',
      return_date: qr?.return_date ? qr.return_date.slice(0, 10) : '',
    })

    // Number formatting for amount columns
    row.getCell('amount').numFmt = '#,##0'
    row.getCell('paid_amount').numFmt = '#,##0'

    // Alternating row color for readability
    const isEven = (row.number - 2) % 2 === 0
    row.eachCell((cell) => {
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
      'Content-Disposition': `attachment; filename="payments_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
