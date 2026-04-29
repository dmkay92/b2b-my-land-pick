import ExcelJS from 'exceljs'

const tables = [
  {
    name: 'quote_settlements (정산)',
    columns: [
      ['id', 'uuid', 'PK', '정산 레코드 고유 ID'],
      ['request_id', 'uuid', 'FK → quote_requests', '견적 요청 ID (1:1)'],
      ['quote_id', 'uuid', 'FK → quotes', '확정된 견적 ID'],
      ['landco_id', 'uuid', 'FK → profiles', '랜드사 ID'],
      ['agency_id', 'uuid', 'FK → profiles', '여행사 ID'],
      ['landco_quote_total', 'numeric', '', '랜드사 견적가 (원본 총액)'],
      ['platform_fee_rate', 'numeric', '', '플랫폼 수수료율 (예: 0.05 = 5%)'],
      ['platform_fee', 'numeric', '', '플랫폼 수수료 (landco_quote_total × platform_fee_rate)'],
      ['agency_markup', 'numeric', '', '여행사 마크업 금액'],
      ['agency_commission_rate', 'numeric', '기본값 1.0', '여행사 커미션율 (마크업 중 여행사에 돌려주는 비율)'],
      ['platform_gross_revenue', 'numeric', '', '플랫폼 총 수익 (platform_fee + agency_markup)'],
      ['agency_payout', 'numeric', '', '여행사 지급액 (agency_markup × agency_commission_rate)'],
      ['platform_net_revenue', 'numeric', '', '플랫폼 순수익 (platform_gross_revenue - agency_payout)'],
      ['landco_payout', 'numeric', '', '랜드사 수취액 (landco_quote_total - platform_fee)'],
      ['gmv', 'numeric', '', '총 거래액 (landco_quote_total + agency_markup)'],
      ['landco_settled', 'boolean', '기본값 false', '랜드사 정산 완료 여부'],
      ['agency_settled', 'boolean', '기본값 false', '여행사 정산 완료 여부'],
      ['created_at', 'timestamptz', '자동생성', '생성 시각'],
    ],
  },
  {
    name: 'payment_schedules (결제 일정)',
    columns: [
      ['id', 'uuid', 'PK', '결제 일정 고유 ID'],
      ['request_id', 'uuid', 'FK → quote_requests (1:1)', '견적 요청 ID'],
      ['settlement_id', 'uuid', 'FK → quote_settlements', '정산 ID'],
      ['template_type', 'text', 'standard / large_event / immediate', '결제 일정 유형 (일반 / 대형행사 / 즉시)'],
      ['total_amount', 'numeric', '', '총 결제 금액'],
      ['total_people', 'integer', '', '총 인원수'],
      ['created_at', 'timestamptz', '자동생성', '생성 시각'],
      ['updated_at', 'timestamptz', '자동생성', '수정 시각'],
    ],
  },
  {
    name: 'payment_installments (결제 회차)',
    columns: [
      ['id', 'uuid', 'PK', '결제 회차 고유 ID'],
      ['schedule_id', 'uuid', 'FK → payment_schedules', '결제 일정 ID'],
      ['label', 'text', '', '회차 이름 (예: 계약금, 중도금, 잔금)'],
      ['rate', 'numeric', '', '비율 (예: 0.3 = 30%)'],
      ['amount', 'numeric', '', '해당 회차 결제 금액'],
      ['paid_amount', 'numeric', '기본값 0', '실제 납부된 금액'],
      ['due_date', 'date', '', '결제 기한'],
      ['status', 'text', 'pending / partial / paid / overdue / cancelled', '결제 상태'],
      ['allow_split', 'boolean', '기본값 false', '분할 결제 허용 여부'],
      ['paid_at', 'timestamptz', '', '결제 완료 시각'],
      ['created_at', 'timestamptz', '자동생성', '생성 시각'],
      ['updated_at', 'timestamptz', '자동생성', '수정 시각'],
    ],
  },
  {
    name: 'payment_transactions (결제 트랜잭션)',
    columns: [
      ['id', 'uuid', 'PK', '트랜잭션 고유 ID'],
      ['installment_id', 'uuid', 'FK → payment_installments', '결제 회차 ID'],
      ['amount', 'numeric', '', '실 결제 금액 (base_amount + card_surcharge)'],
      ['base_amount', 'numeric', '', '카드 결제 시 원래 금액 (수수료 적용 전)'],
      ['card_surcharge_rate', 'numeric', '기본값 0', '카드 수수료율'],
      ['card_surcharge', 'numeric', '기본값 0', '카드 수수료 (base_amount × card_surcharge_rate)'],
      ['payment_method', 'text', 'virtual_account / card_link / card_keyin', '결제 수단'],
      ['status', 'text', 'pending / success / failed / cancelled', '결제 상태'],
      ['pg_transaction_id', 'text', '', 'PG사 거래 ID'],
      ['pg_response', 'jsonb', '', 'PG사 응답 원본 데이터'],
      ['virtual_account_info', 'jsonb', '', '가상계좌 정보 (은행, 계좌번호, 예금주, 만료일)'],
      ['created_at', 'timestamptz', '자동생성', '생성 시각'],
      ['updated_at', 'timestamptz', '자동생성', '수정 시각'],
    ],
  },
  {
    name: 'agency_markups (여행사 마크업)',
    columns: [
      ['id', 'uuid', 'PK', '마크업 고유 ID'],
      ['quote_id', 'uuid', 'FK → quotes', '견적 ID'],
      ['agency_id', 'uuid', 'FK → profiles', '여행사 ID'],
      ['markup_per_person', 'numeric', '기본값 0', '1인당 마크업 금액'],
      ['markup_total', 'numeric', '기본값 0', '마크업 총액'],
      ['created_at', 'timestamptz', '자동생성', '생성 시각'],
      ['updated_at', 'timestamptz', '자동생성', '수정 시각'],
    ],
  },
  {
    name: 'platform_settings (플랫폼 설정)',
    columns: [
      ['key', 'text', 'PK', '설정 키 (예: platform_fee_rate, agency_commission_rate)'],
      ['value', 'jsonb', '', '설정 값 (JSON 형태)'],
      ['updated_at', 'timestamptz', '자동생성', '수정 시각'],
    ],
  },
]

async function main() {
  const wb = new ExcelJS.Workbook()

  for (const table of tables) {
    const ws = wb.addWorksheet(table.name.length > 31 ? table.name.slice(0, 31) : table.name)

    // 헤더
    ws.columns = [
      { header: '컬럼명', key: 'col', width: 28 },
      { header: '타입', key: 'type', width: 16 },
      { header: '제약조건 / 기본값', key: 'constraint', width: 40 },
      { header: '설명', key: 'desc', width: 55 },
    ]

    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    headerRow.alignment = { vertical: 'middle' }

    for (const [col, type, constraint, desc] of table.columns) {
      const row = ws.addRow({ col, type, constraint, desc })
      row.alignment = { vertical: 'middle', wrapText: true }
    }

    // 테두리
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
    })
  }

  const outPath = '/Users/youngjun-hwang/Desktop/Claude/my-land-pick/결제_정산_테이블_스키마.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`완료: ${outPath}`)
}

main()
