import ExcelJS from 'exceljs'

const groupColors = {
  'REQ-20260424-000018': 'FFE0F2FE',  // K푸드 오사카
  'REQ-20260424-000020': 'FFFEF3C7',  // K기업 도쿄
  'REQ-20260424-000001': 'FFDCFCE7',  // 마리트 T&A (샘플)
  'REQ-20260424-000003': 'FFFCE7F3',  // 파리 워크샵 (샘플)
  'REQ-20260424-000006': 'FFF3E8FF',  // L전자 (샘플)
}

const tables = [
  {
    name: 'quote_settlements',
    headers: ['display_id', 'request (display_id)', '행사명', 'quote (display_id)', '랜드사 (display_id)', '여행사 (display_id)', 'landco_quote_total', 'platform_fee_rate', 'platform_fee', 'agency_markup', 'agency_commission_rate', 'platform_gross_revenue', 'agency_payout', 'platform_net_revenue', 'landco_payout', 'gmv', 'landco_settled', 'agency_settled', 'created_at'],
    descriptions: [
      'text UNIQUE — 정산 표시 ID (자동생성)',
      'text — 견적요청 표시 ID (FK 참조용)',
      '참고용 — 행사명',
      'text — 확정 견적 표시 ID',
      'text — 랜드사 표시 ID',
      'text — 여행사 표시 ID',
      'numeric — 랜드사 견적가 (원본 총액)',
      'numeric — 플랫폼 수수료율 (0.05 = 5%)',
      'numeric — 플랫폼 수수료 = 견적가 × 수수료율',
      'numeric — 여행사 마크업 금액',
      'numeric — 여행사 커미션율 (기본 1.0)',
      'numeric — 플랫폼 총수익 = 수수료 + 마크업',
      'numeric — 여행사 지급액 = 마크업 × 커미션율',
      'numeric — 플랫폼 순수익 = 총수익 - 여행사 지급',
      'numeric — 랜드사 수취액 = 견적가 - 수수료',
      'numeric — GMV = 견적가 + 마크업',
      'boolean — 랜드사 정산완료',
      'boolean — 여행사 정산완료',
      'timestamptz — 생성일시',
    ],
    groupCol: 1,
    rows: [
      ['STL-20260424-000001', 'REQ-20260424-000018', '2026 K푸드 임직원 오사카 봄 워크샵', 'QOT-20260424-000008', 'L000001', 'A000003', 10580000, 0.05, 529000, 210000, 1.0, 739000, 210000, 529000, 10051000, 10790000, false, false, '2026-04-21T07:34:31'],
      ['STL-20260424-000002', 'REQ-20260424-000020', '2026 K기업 리더십 여름 도쿄 워크샵', 'QOT-20260424-000015', 'L000001', 'A000003', 22800000, 0.05, 1140000, 2100000, 1.0, 3240000, 2100000, 1140000, 21660000, 24900000, false, false, '2026-04-21T12:27:11'],
      // 샘플 추가
      ['STL-20260501-000001', 'REQ-20260424-000001', '2026 마리트 T&A 워크샵', 'QOT-20260501-000001', 'L000002', 'A000001', 45000000, 0.05, 2250000, 5000000, 1.0, 7250000, 5000000, 2250000, 42750000, 50000000, true, true, '2026-05-01T10:00:00'],
      ['STL-20260505-000001', 'REQ-20260424-000003', '2026 파리 워크샵', 'QOT-20260505-000001', 'L000001', 'A000002', 8000000, 0.05, 400000, 800000, 1.0, 1200000, 800000, 400000, 7600000, 8800000, false, false, '2026-05-05T09:00:00'],
      ['STL-20260510-000001', 'REQ-20260424-000006', '2026 L전자 장가게 워크샵', 'QOT-20260510-000001', 'L000002', 'A000003', 30000000, 0.05, 1500000, 3000000, 1.0, 4500000, 3000000, 1500000, 28500000, 33000000, true, false, '2026-05-10T14:00:00'],
    ],
  },
  {
    name: 'payment_schedules',
    headers: ['display_id', 'request (display_id)', '행사명', 'settlement (display_id)', 'template_type', 'approval_status', 'total_amount', 'total_people', 'created_at'],
    descriptions: [
      'text UNIQUE — 결제일정 표시 ID',
      'text — 견적요청 표시 ID',
      '참고용 — 행사명',
      'text — 정산 표시 ID',
      'text — standard / large_event / immediate / post_travel',
      'text — approved / pending / rejected',
      'numeric — 총 결제금액 (= GMV)',
      'integer — 총 인원',
      'timestamptz — 생성일시',
    ],
    groupCol: 1,
    rows: [
      ['PSC-20260424-000001', 'REQ-20260424-000018', '2026 K푸드 오사카 봄 워크샵', 'STL-20260424-000001', 'post_travel', 'approved', 10790000, 7, '2026-04-21T07:44:23'],
      ['PSC-20260424-000002', 'REQ-20260424-000020', '2026 K기업 도쿄 워크샵', 'STL-20260424-000002', 'immediate', 'approved', 24900000, 21, '2026-04-21T12:27:11'],
      ['PSC-20260501-000001', 'REQ-20260424-000001', '2026 마리트 T&A 워크샵', 'STL-20260501-000001', 'large_event', 'approved', 50000000, 80, '2026-05-01T10:05:00'],
      ['PSC-20260505-000001', 'REQ-20260424-000003', '2026 파리 워크샵', 'STL-20260505-000001', 'post_travel', 'pending', 8800000, 15, '2026-05-05T09:05:00'],
      ['PSC-20260510-000001', 'REQ-20260424-000006', '2026 L전자 장가게 워크샵', 'STL-20260510-000001', 'standard', 'approved', 33000000, 40, '2026-05-10T14:05:00'],
    ],
  },
  {
    name: 'payment_installments',
    headers: ['display_id', 'request (display_id)', '행사명', 'schedule (display_id)', 'label', 'rate', 'amount', 'paid_amount', 'due_date', 'status', 'allow_split', 'paid_at'],
    descriptions: [
      'text UNIQUE — 결제회차 표시 ID',
      'text — 견적요청 표시 ID (참고)',
      '참고용 — 행사명',
      'text — 결제일정 표시 ID',
      'text — 회차명',
      'numeric — 비율 (합계 = 1.0)',
      'numeric — 금액 = total_amount × rate',
      'numeric — 납부 금액 (기본 0)',
      'date — 결제 기한',
      'text — pending / partial / paid / overdue / cancelled',
      'boolean — 분할결제 허용',
      'timestamptz — 결제 완료 시각',
    ],
    groupCol: 1,
    rows: [
      // K푸드 오사카 (post_travel)
      ['PIN-20260424-000001', 'REQ-20260424-000018', 'K푸드 오사카', 'PSC-20260424-000001', '계약금', 0.1, 1079000, 0, '2026-04-22', 'pending', false, null],
      ['PIN-20260424-000002', 'REQ-20260424-000018', 'K푸드 오사카', 'PSC-20260424-000001', '중도금', 0.4, 4316000, 0, '2026-04-15', 'pending', true, null],
      ['PIN-20260424-000003', 'REQ-20260424-000018', 'K푸드 오사카', 'PSC-20260424-000001', '잔금 (여행 후)', 0.5, 5395000, 0, '2026-05-25', 'pending', true, null],
      // K기업 도쿄 (immediate)
      ['PIN-20260424-000004', 'REQ-20260424-000020', 'K기업 도쿄', 'PSC-20260424-000002', '전액', 1.0, 24900000, 0, '2026-04-23', 'pending', true, null],
      // 마리트 T&A (large_event) — 전액 완납
      ['PIN-20260501-000001', 'REQ-20260424-000001', '마리트 T&A', 'PSC-20260501-000001', '계약금', 0.1, 5000000, 5000000, '2026-05-08', 'paid', false, '2026-05-07T10:00:00'],
      ['PIN-20260501-000002', 'REQ-20260424-000001', '마리트 T&A', 'PSC-20260501-000001', '중도금', 0.4, 20000000, 20000000, '2026-06-01', 'paid', true, '2026-05-30T14:00:00'],
      ['PIN-20260501-000003', 'REQ-20260424-000001', '마리트 T&A', 'PSC-20260501-000001', '잔금', 0.5, 25000000, 25000000, '2026-06-20', 'paid', true, '2026-06-19T09:00:00'],
      // 파리 워크샵 (post_travel pending) — 결제 불가
      ['PIN-20260505-000001', 'REQ-20260424-000003', '파리 워크샵', 'PSC-20260505-000001', '계약금', 0.1, 880000, 0, '2026-05-12', 'pending', false, null],
      ['PIN-20260505-000002', 'REQ-20260424-000003', '파리 워크샵', 'PSC-20260505-000001', '중도금', 0.4, 3520000, 0, '2026-05-25', 'pending', true, null],
      ['PIN-20260505-000003', 'REQ-20260424-000003', '파리 워크샵', 'PSC-20260505-000001', '잔금 (여행 후)', 0.5, 4400000, 0, '2026-07-10', 'pending', true, null],
      // L전자 (standard) — 계약금 납부, 잔금 overdue
      ['PIN-20260510-000001', 'REQ-20260424-000006', 'L전자 워크샵', 'PSC-20260510-000001', '계약금', 0.1, 3300000, 3300000, '2026-05-17', 'paid', false, '2026-05-16T11:00:00'],
      ['PIN-20260510-000002', 'REQ-20260424-000006', 'L전자 워크샵', 'PSC-20260510-000001', '잔금', 0.9, 29700000, 0, '2026-04-20', 'overdue', true, null],
    ],
  },
  {
    name: 'payment_transactions',
    headers: ['display_id', 'request (display_id)', '행사명', 'installment (display_id)', '회차명', 'payment_method', 'base_amount', 'card_surcharge_rate', 'card_surcharge', 'amount', 'status', 'pg_transaction_id', 'virtual_account_info / 비고'],
    descriptions: [
      'text UNIQUE — 트랜잭션 표시 ID',
      'text — 견적요청 표시 ID (참고)',
      '참고용 — 행사명',
      'text — 결제회차 표시 ID (한 회차에 여러 건 가능)',
      '참고용 — 회차명',
      'text — virtual_account / card_link / card_keyin',
      'numeric — 수수료 전 금액',
      'numeric — 카드 수수료율 (가상계좌=0)',
      'numeric — 카드 수수료 = base × rate',
      'numeric — 실결제금액 = base + surcharge',
      'text — success / failed / pending / cancelled',
      'text — PG사 거래 ID',
      'text — 가상계좌: 은행+계좌 / 카드: 비고',
    ],
    groupCol: 1,
    rows: [
      // 마리트 T&A — 계약금 가상계좌
      ['TXN-20260507-000001', 'REQ-20260424-000001', '마리트 T&A', 'PIN-20260501-000001', '계약금', 'virtual_account', 5000000, 0, 0, 5000000, 'success', 'PG-20260507-001', '신한 110-123-456789'],
      // 마리트 T&A — 중도금: 카드 실패 → 카드 성공 → 가상계좌
      ['TXN-20260528-000001', 'REQ-20260424-000001', '마리트 T&A', 'PIN-20260501-000002', '중도금', 'card_keyin', 10000000, 0.025, 250000, 10250000, 'failed', 'PG-20260528-002', '한도초과'],
      ['TXN-20260528-000002', 'REQ-20260424-000001', '마리트 T&A', 'PIN-20260501-000002', '중도금', 'card_keyin', 10000000, 0.025, 250000, 10250000, 'success', 'PG-20260528-003', '재시도 성공'],
      ['TXN-20260529-000001', 'REQ-20260424-000001', '마리트 T&A', 'PIN-20260501-000002', '중도금', 'virtual_account', 10000000, 0, 0, 10000000, 'success', 'PG-20260529-004', '국민 123-45-6789012'],
      // 마리트 T&A — 잔금 가상계좌
      ['TXN-20260618-000001', 'REQ-20260424-000001', '마리트 T&A', 'PIN-20260501-000003', '잔금', 'virtual_account', 25000000, 0, 0, 25000000, 'success', 'PG-20260618-005', '우리 1002-456-789012'],
      // L전자 — 계약금 카드링크
      ['TXN-20260516-000001', 'REQ-20260424-000006', 'L전자 워크샵', 'PIN-20260510-000001', '계약금', 'card_link', 3300000, 0.025, 82500, 3382500, 'success', 'PG-20260516-006', ''],
    ],
  },
  {
    name: 'agency_markups',
    headers: ['id (uuid)', 'quote (display_id)', '여행사 (display_id)', 'markup_per_person', 'markup_total', 'created_at'],
    descriptions: [
      'uuid PK — 마크업 고유 ID (display_id 없음)',
      'text — 견적 표시 ID',
      'text — 여행사 표시 ID',
      'numeric — 1인당 마크업',
      'numeric — 마크업 총액',
      'timestamptz — 생성일시',
    ],
    groupCol: null,
    rows: [
      ['69cfcd78-...', 'QOT-20260424-000008', 'A000003', 30000, 210000, '2026-04-20T15:47:52'],
      ['1d6fa5a3-...', 'QOT-20260424-000015', 'A000003', 100000, 2100000, '2026-04-21T12:23:27'],
      ['sample-001', 'QOT-20260501-000001', 'A000001', 62500, 5000000, '2026-05-01T09:50:00'],
      ['sample-002', 'QOT-20260505-000001', 'A000002', 53333, 800000, '2026-05-05T08:50:00'],
      ['sample-003', 'QOT-20260510-000001', 'A000003', 75000, 3000000, '2026-05-10T13:50:00'],
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

async function main() {
  const wb = new ExcelJS.Workbook()

  for (const table of tables) {
    const sheetName = table.name.length > 31 ? table.name.slice(0, 31) : table.name
    const ws = wb.addWorksheet(sheetName)

    // 1행: 설명
    const descRow = ws.addRow(table.descriptions)
    descRow.font = { size: 9, color: { argb: 'FF374151' } }
    descRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    descRow.alignment = { vertical: 'top', wrapText: true }
    descRow.height = 50

    // 2행: 헤더
    const headerRow = ws.addRow(table.headers)
    headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 24

    // 데이터
    for (const rowData of table.rows) {
      const row = ws.addRow(rowData)
      row.alignment = { vertical: 'middle' }
      row.height = 22

      if (table.groupCol !== null) {
        const reqId = String(rowData[table.groupCol])
        const color = groupColors[reqId]
        if (color) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
        }
      }
    }

    // 컬럼 너비
    ws.columns.forEach((col, idx) => {
      const header = table.headers[idx] || ''
      let maxLen = header.length
      for (const r of table.rows) maxLen = Math.max(maxLen, String(r[idx] ?? '').length)
      col.width = Math.min(Math.max(maxLen * 1.2 + 2, 12), 45)
    })

    // 테두리
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

    // 숫자 포맷
    const moneyKw = ['amount', 'total', 'fee', 'markup', 'payout', 'revenue', 'gmv', 'surcharge']
    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return
      row.eachCell((cell, colNum) => {
        const h = table.headers[colNum - 1]?.toLowerCase() || ''
        if (moneyKw.some(k => h.includes(k)) && typeof cell.value === 'number') cell.numFmt = '#,##0'
        if (h.includes('rate') && typeof cell.value === 'number' && cell.value > 0 && cell.value < 1) cell.numFmt = '0.0%'
        if (h === 'rate' && typeof cell.value === 'number') cell.numFmt = '0%'
      })
    })

    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: table.headers.length } }
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }

  const outPath = '/Users/youngjun-hwang/Desktop/Claude/my-land-pick/결제_정산_스키마_display_id.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`완료: ${outPath}`)
}

main()
