import ExcelJS from 'exceljs'

const groupColors = {
  'REQ-20260424-000018': 'FFE0F2FE',
  'REQ-20260424-000020': 'FFFEF3C7',
  'REQ-20260424-000001': 'FFDCFCE7',
  'REQ-20260424-000003': 'FFFCE7F3',
  'REQ-20260424-000006': 'FFF3E8FF',
}

// schedule display_id → request display_id 매핑
const schedReqMap = {
  'PSC-20260424-000001': 'REQ-20260424-000018',
  'PSC-20260424-000002': 'REQ-20260424-000020',
  'PSC-20260501-000001': 'REQ-20260424-000001',
  'PSC-20260505-000001': 'REQ-20260424-000003',
  'PSC-20260510-000001': 'REQ-20260424-000006',
}

// installment display_id → request display_id 매핑
const instReqMap = {
  'PIN-20260424-000001': 'REQ-20260424-000018',
  'PIN-20260424-000002': 'REQ-20260424-000018',
  'PIN-20260424-000003': 'REQ-20260424-000018',
  'PIN-20260424-000004': 'REQ-20260424-000020',
  'PIN-20260501-000001': 'REQ-20260424-000001',
  'PIN-20260501-000002': 'REQ-20260424-000001',
  'PIN-20260501-000003': 'REQ-20260424-000001',
  'PIN-20260505-000001': 'REQ-20260424-000003',
  'PIN-20260505-000002': 'REQ-20260424-000003',
  'PIN-20260505-000003': 'REQ-20260424-000003',
  'PIN-20260510-000001': 'REQ-20260424-000006',
  'PIN-20260510-000002': 'REQ-20260424-000006',
}

const tables = [
  {
    name: 'quote_settlements',
    headers: ['display_id', 'request_id', 'quote_id', 'landco_id', 'agency_id', 'landco_quote_total', 'platform_fee_rate', 'platform_fee', 'platform_fee_supply', 'platform_fee_vat', 'agency_markup', 'agency_commission_rate', 'platform_gross_revenue', 'agency_payout', 'agency_payout_supply', 'agency_payout_vat', 'platform_net_revenue', 'landco_payout', 'gmv', 'landco_settled', 'agency_settled', 'created_at'],
    descriptions: [
      'text UNIQUE — 정산 표시 ID (STL-YYYYMMDD-NNNNNN)',
      'uuid FK → quote_requests (1:1)',
      'uuid FK → quotes',
      'uuid FK → profiles (랜드사)',
      'uuid FK → profiles (여행사)',
      'numeric — 랜드사 견적가 (원본 총액)',
      'numeric — 플랫폼 수수료율 (0.05 = 5%)',
      'numeric — 플랫폼 수수료 = 견적가 × 수수료율',
      'numeric — 플랫폼 수수료 공급가액 = round(수수료 / 1.1)',
      'numeric — 플랫폼 수수료 부가세 = 수수료 - 공급가액',
      'numeric — 여행사 마크업 금액',
      'numeric — 여행사 커미션율 (기본 1.0)',
      'numeric — 플랫폼 총수익 = 수수료 + 마크업',
      'numeric — 여행사 지급액 = 마크업 × 커미션율',
      'numeric — 여행사 지급액 공급가액 = round(agency_payout / 1.1)',
      'numeric — 여행사 지급액 부가세 = agency_payout - 공급가액',
      'numeric — 플랫폼 순수익 = 총수익 - 여행사 지급',
      'numeric — 랜드사 수취액 = 견적가 - 수수료',
      'numeric — GMV = 견적가 + 마크업',
      'boolean — 랜드사 정산완료 (기본 false)',
      'boolean — 여행사 정산완료 (기본 false)',
      'timestamptz — 생성일시',
    ],
    groupCol: 1,
    rows: [
      // 순서: display_id, request_id, quote_id, landco_id, agency_id, landco_quote_total, platform_fee_rate, platform_fee, platform_fee_supply, platform_fee_vat, agency_markup, agency_commission_rate, platform_gross_revenue, agency_payout, agency_payout_supply, agency_payout_vat, platform_net_revenue, landco_payout, gmv, landco_settled, agency_settled, created_at
      ['STL-20260424-000001', 'REQ-20260424-000018', 'QOT-20260424-000008', 'L000001', 'A000003', 10580000, 0.05, 529000, 480909, 48091, 210000, 1.0, 739000, 210000, 190909, 19091, 529000, 10051000, 10790000, false, false, '2026-04-21T07:34:31'],
      ['STL-20260424-000002', 'REQ-20260424-000020', 'QOT-20260424-000015', 'L000001', 'A000003', 22800000, 0.05, 1140000, 1036364, 103636, 2100000, 1.0, 3240000, 2100000, 1909091, 190909, 1140000, 21660000, 24900000, false, false, '2026-04-21T12:27:11'],
      ['STL-20260501-000001', 'REQ-20260424-000001', 'QOT-20260501-000001', 'L000002', 'A000001', 45000000, 0.05, 2250000, 2045455, 204545, 5000000, 1.0, 7250000, 5000000, 4545455, 454545, 2250000, 42750000, 50000000, true, true, '2026-05-01T10:00:00'],
      ['STL-20260505-000001', 'REQ-20260424-000003', 'QOT-20260505-000001', 'L000001', 'A000002', 8000000, 0.05, 400000, 363636, 36364, 800000, 1.0, 1200000, 800000, 727273, 72727, 400000, 7600000, 8800000, false, false, '2026-05-05T09:00:00'],
      ['STL-20260510-000001', 'REQ-20260424-000006', 'QOT-20260510-000001', 'L000002', 'A000003', 30000000, 0.05, 1500000, 1363636, 136364, 3000000, 1.0, 4500000, 3000000, 2727273, 272727, 1500000, 28500000, 33000000, true, false, '2026-05-10T14:00:00'],
    ],
  },
  {
    name: 'payment_schedules',
    headers: ['display_id', 'request_id', 'settlement_id', 'template_type', 'approval_status', 'total_amount', 'total_people', 'created_at', 'updated_at'],
    descriptions: [
      'text UNIQUE — 결제일정 표시 ID (PSC-YYYYMMDD-NNNNNN)',
      'uuid FK → quote_requests (1:1)',
      'uuid FK → quote_settlements',
      'text — standard / large_event / immediate / post_travel',
      'text — approved / pending / rejected (post_travel만 승인 필요)',
      'numeric — 총 결제금액 (= GMV)',
      'integer — 총 인원',
      'timestamptz — 생성일시',
      'timestamptz — 수정일시',
    ],
    groupCol: 1,
    rows: [
      ['PSC-20260424-000001', 'REQ-20260424-000018', 'STL-20260424-000001', 'post_travel', 'approved', 10790000, 7, '2026-04-21T07:44:23', '2026-04-22T16:03:14'],
      ['PSC-20260424-000002', 'REQ-20260424-000020', 'STL-20260424-000002', 'immediate', 'approved', 24900000, 21, '2026-04-21T12:27:11', '2026-04-23T07:33:54'],
      ['PSC-20260501-000001', 'REQ-20260424-000001', 'STL-20260501-000001', 'large_event', 'approved', 50000000, 80, '2026-05-01T10:05:00', '2026-05-01T10:05:00'],
      ['PSC-20260505-000001', 'REQ-20260424-000003', 'STL-20260505-000001', 'post_travel', 'pending', 8800000, 15, '2026-05-05T09:05:00', '2026-05-05T09:05:00'],
      ['PSC-20260510-000001', 'REQ-20260424-000006', 'STL-20260510-000001', 'standard', 'approved', 33000000, 40, '2026-05-10T14:05:00', '2026-05-10T14:05:00'],
    ],
  },
  {
    name: 'payment_installments',
    headers: ['display_id', 'schedule_id', 'label', 'rate', 'amount', 'paid_amount', 'due_date', 'status', 'allow_split', 'paid_at', 'created_at', 'updated_at'],
    descriptions: [
      'text UNIQUE — 결제회차 표시 ID (PIN-YYYYMMDD-NNNNNN)',
      'uuid FK → payment_schedules',
      'text — 회차명 (계약금/중도금/잔금/전액 등)',
      'numeric — 비율 (합계 = 1.0)',
      'numeric — 금액 = total_amount × rate',
      'numeric — 납부 금액 (기본 0)',
      'date — 결제 기한',
      'text — pending / partial / paid / overdue / cancelled',
      'boolean — 분할결제(카드+현금) 허용',
      'timestamptz — 결제 완료 시각 (nullable)',
      'timestamptz — 생성일시',
      'timestamptz — 수정일시',
    ],
    groupCol: 1, // schedule_id → request 매핑
    rows: [
      // PSC-20260424-000001 (post_travel)
      ['PIN-20260424-000001', 'PSC-20260424-000001', '계약금', 0.1, 1079000, 0, '2026-04-22', 'pending', false, null, '2026-04-22T15:29:21', '2026-04-22T15:29:21'],
      ['PIN-20260424-000002', 'PSC-20260424-000001', '중도금', 0.4, 4316000, 0, '2026-04-15', 'pending', true, null, '2026-04-22T15:29:21', '2026-04-22T15:29:21'],
      ['PIN-20260424-000003', 'PSC-20260424-000001', '잔금 (여행 후)', 0.5, 5395000, 0, '2026-05-25', 'pending', true, null, '2026-04-22T15:29:22', '2026-04-22T15:29:22'],
      // PSC-20260424-000002 (immediate)
      ['PIN-20260424-000004', 'PSC-20260424-000002', '전액', 1.0, 24900000, 0, '2026-04-23', 'pending', true, null, '2026-04-23T07:33:53', '2026-04-23T07:33:53'],
      // PSC-20260501-000001 (large_event) 전액 완납
      ['PIN-20260501-000001', 'PSC-20260501-000001', '계약금', 0.1, 5000000, 5000000, '2026-05-08', 'paid', false, '2026-05-07T10:00:00', '2026-05-01T10:05:00', '2026-05-07T10:00:00'],
      ['PIN-20260501-000002', 'PSC-20260501-000001', '중도금', 0.4, 20000000, 20000000, '2026-06-01', 'paid', true, '2026-05-30T14:00:00', '2026-05-01T10:05:00', '2026-05-30T14:00:00'],
      ['PIN-20260501-000003', 'PSC-20260501-000001', '잔금', 0.5, 25000000, 25000000, '2026-06-20', 'paid', true, '2026-06-19T09:00:00', '2026-05-01T10:05:00', '2026-06-19T09:00:00'],
      // PSC-20260505-000001 (post_travel pending)
      ['PIN-20260505-000001', 'PSC-20260505-000001', '계약금', 0.1, 880000, 0, '2026-05-12', 'pending', false, null, '2026-05-05T09:05:00', '2026-05-05T09:05:00'],
      ['PIN-20260505-000002', 'PSC-20260505-000001', '중도금', 0.4, 3520000, 0, '2026-05-25', 'pending', true, null, '2026-05-05T09:05:00', '2026-05-05T09:05:00'],
      ['PIN-20260505-000003', 'PSC-20260505-000001', '잔금 (여행 후)', 0.5, 4400000, 0, '2026-07-10', 'pending', true, null, '2026-05-05T09:05:00', '2026-05-05T09:05:00'],
      // PSC-20260510-000001 (standard) 계약금 완납 + 잔금 overdue
      ['PIN-20260510-000001', 'PSC-20260510-000001', '계약금', 0.1, 3300000, 3300000, '2026-05-17', 'paid', false, '2026-05-16T11:00:00', '2026-05-10T14:05:00', '2026-05-16T11:00:00'],
      ['PIN-20260510-000002', 'PSC-20260510-000001', '잔금', 0.9, 29700000, 0, '2026-04-20', 'overdue', true, null, '2026-05-10T14:05:00', '2026-05-10T14:05:00'],
    ],
  },
  {
    name: 'payment_transactions',
    headers: ['display_id', 'installment_id', 'amount', 'base_amount', 'card_surcharge_rate', 'card_surcharge', 'payment_method', 'status', 'pg_transaction_id', 'pg_response', 'virtual_account_info', 'created_at', 'updated_at'],
    descriptions: [
      'text UNIQUE — 트랜잭션 표시 ID (TXN-YYYYMMDD-NNNNNN)',
      'uuid FK → payment_installments (한 회차에 여러 건 가능)',
      'numeric — 실결제금액 = base_amount + card_surcharge',
      'numeric — 수수료 전 금액 (nullable)',
      'numeric — 카드 수수료율 (가상계좌=0, 카드=0.025)',
      'numeric — 카드 수수료 (기본 0)',
      'text — virtual_account / card_link / card_keyin',
      'text — pending / success / failed / cancelled',
      'text — PG사 거래 ID (nullable)',
      'jsonb — PG사 응답 원본 (nullable)',
      'jsonb — {bank, account_number, holder, expires_at} (nullable)',
      'timestamptz — 생성일시',
      'timestamptz — 수정일시',
    ],
    groupCol: 1, // installment_id → request 매핑
    rows: [
      // PIN-20260501-000001 계약금 가상계좌
      ['TXN-20260507-000001', 'PIN-20260501-000001', 5000000, 5000000, 0, 0, 'virtual_account', 'success', 'PG-20260507-001', null, '{"bank":"신한","account_number":"110-123-456789","holder":"마이랜드픽"}', '2026-05-07T09:30:00', '2026-05-07T10:00:00'],
      // PIN-20260501-000002 중도금: 카드실패 → 카드성공 → 가상계좌
      ['TXN-20260528-000001', 'PIN-20260501-000002', 10250000, 10000000, 0.025, 250000, 'card_keyin', 'failed', 'PG-20260528-002', null, null, '2026-05-28T11:00:00', '2026-05-28T11:00:00'],
      ['TXN-20260528-000002', 'PIN-20260501-000002', 10250000, 10000000, 0.025, 250000, 'card_keyin', 'success', 'PG-20260528-003', null, null, '2026-05-28T11:30:00', '2026-05-28T11:30:00'],
      ['TXN-20260529-000001', 'PIN-20260501-000002', 10000000, 10000000, 0, 0, 'virtual_account', 'success', 'PG-20260529-004', null, '{"bank":"국민","account_number":"123-45-6789012","holder":"마이랜드픽"}', '2026-05-29T09:00:00', '2026-05-30T14:00:00'],
      // PIN-20260501-000003 잔금 가상계좌
      ['TXN-20260618-000001', 'PIN-20260501-000003', 25000000, 25000000, 0, 0, 'virtual_account', 'success', 'PG-20260618-005', null, '{"bank":"우리","account_number":"1002-456-789012","holder":"마이랜드픽"}', '2026-06-18T10:00:00', '2026-06-19T09:00:00'],
      // PIN-20260510-000001 계약금 카드링크
      ['TXN-20260516-000001', 'PIN-20260510-000001', 3382500, 3300000, 0.025, 82500, 'card_link', 'success', 'PG-20260516-006', null, null, '2026-05-16T10:30:00', '2026-05-16T11:00:00'],
    ],
  },
  {
    name: 'agency_markups',
    headers: ['display_id', 'quote_id', 'agency_id', 'markup_per_person', 'markup_total', 'created_at', 'updated_at'],
    descriptions: [
      'text UNIQUE — 마크업 표시 ID (MKP-YYYYMMDD-NNNNNN)',
      'uuid FK → quotes (UNIQUE: quote_id + agency_id)',
      'uuid FK → profiles (여행사)',
      'numeric — 1인당 마크업 (기본 0)',
      'numeric — 마크업 총액 (기본 0)',
      'timestamptz — 생성일시',
      'timestamptz — 수정일시',
    ],
    groupCol: null,
    rows: [
      ['MKP-20260424-000001', 'QOT-20260424-000008', 'A000003', 30000, 210000, '2026-04-20T15:47:52', '2026-04-20T15:47:52'],
      ['MKP-20260424-000002', 'QOT-20260424-000015', 'A000003', 100000, 2100000, '2026-04-21T12:23:27', '2026-04-21T12:27:11'],
      ['MKP-20260501-000001', 'QOT-20260501-000001', 'A000001', 62500, 5000000, '2026-05-01T09:50:00', '2026-05-01T09:50:00'],
      ['MKP-20260505-000001', 'QOT-20260505-000001', 'A000002', 53333, 800000, '2026-05-05T08:50:00', '2026-05-05T08:50:00'],
      ['MKP-20260510-000001', 'QOT-20260510-000001', 'A000003', 75000, 3000000, '2026-05-10T13:50:00', '2026-05-10T13:50:00'],
    ],
  },
  {
    name: 'platform_settings',
    headers: ['key', 'value', 'updated_at'],
    descriptions: [
      'text PK — 설정 키',
      'jsonb — 설정값',
      'timestamptz — 수정일시',
    ],
    groupCol: null,
    rows: [
      ['margin_rate', 0.05, '2026-04-20T15:44:05'],
    ],
  },
]

function getReqColor(table, rowData) {
  const col = table.groupCol
  if (col === null) return null
  const val = String(rowData[col])

  // direct match (settlements, schedules)
  if (groupColors[val]) return groupColors[val]

  // schedule_id → request
  if (schedReqMap[val]) return groupColors[schedReqMap[val]] || null

  // installment_id → request
  if (instReqMap[val]) return groupColors[instReqMap[val]] || null

  return null
}

async function main() {
  const wb = new ExcelJS.Workbook()

  for (const table of tables) {
    const sheetName = table.name.length > 31 ? table.name.slice(0, 31) : table.name
    const ws = wb.addWorksheet(sheetName)

    const descRow = ws.addRow(table.descriptions)
    descRow.font = { size: 9, color: { argb: 'FF374151' } }
    descRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    descRow.alignment = { vertical: 'top', wrapText: true }
    descRow.height = 50

    const headerRow = ws.addRow(table.headers)
    headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 24

    for (const rowData of table.rows) {
      const row = ws.addRow(rowData)
      row.alignment = { vertical: 'middle' }
      row.height = 22

      const color = getReqColor(table, rowData)
      if (color) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
      }
    }

    ws.columns.forEach((col, idx) => {
      const header = table.headers[idx] || ''
      let maxLen = header.length
      for (const r of table.rows) maxLen = Math.max(maxLen, String(r[idx] ?? '').length)
      col.width = Math.min(Math.max(maxLen * 1.2 + 2, 12), 50)
    })

    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        }
      })
    })

    const moneyKw = ['amount', 'total', 'fee', 'markup', 'payout', 'revenue', 'gmv', 'surcharge', 'supply', 'vat']
    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return
      row.eachCell((cell, colNum) => {
        const h = table.headers[colNum - 1]?.toLowerCase() || ''
        if (moneyKw.some(k => h.includes(k)) && typeof cell.value === 'number') cell.numFmt = '#,##0'
        if (h === 'rate' && typeof cell.value === 'number') cell.numFmt = '0%'
      })
    })

    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: table.headers.length } }
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }

  const outPath = '/Users/youngjun-hwang/Desktop/Claude/my-land-pick/결제_정산_스키마_display_id_v2.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`완료: ${outPath}`)
}

main()
