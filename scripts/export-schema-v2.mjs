import ExcelJS from 'exceljs'

const tables = [
  {
    name: 'quote_settlements (정산)',
    headers: ['id', 'request_id', 'quote_id', 'landco_id', 'agency_id', 'landco_quote_total', 'platform_fee_rate', 'platform_fee', 'agency_markup', 'agency_commission_rate', 'platform_gross_revenue', 'agency_payout', 'platform_net_revenue', 'landco_payout', 'gmv', 'landco_settled', 'agency_settled', 'created_at'],
    descriptions: [
      '정산 레코드 고유 ID (uuid, PK)',
      '견적 요청 ID (FK → quote_requests). 하나의 요청에 하나의 정산만 존재 (1:1)',
      '확정된 견적 ID (FK → quotes)',
      '랜드사 ID (FK → profiles)',
      '여행사 ID (FK → profiles)',
      '랜드사 견적가 (원본 총액, KRW). 외화 견적은 환율 적용 후 원화 환산된 금액',
      '플랫폼 수수료율 (예: 0.05 = 5%). platform_settings에서 관리',
      '플랫폼 수수료 = landco_quote_total × platform_fee_rate',
      '여행사가 견적가 위에 추가한 마크업 금액. agency_markups 테이블에서 1인당 마크업 × 인원수로 계산',
      '여행사 커미션율 (기본값 1.0 = 100%). 마크업 중 여행사에 돌려주는 비율',
      '플랫폼 총 수익 = platform_fee + agency_markup. 커미션 지급 전 금액',
      '여행사 지급액 = agency_markup × agency_commission_rate. 현재 100%이므로 마크업 전액 지급',
      '플랫폼 순수익 = platform_gross_revenue - agency_payout. 현재 구조에서는 platform_fee와 동일',
      '랜드사 수취액 = landco_quote_total - platform_fee. 정산 완료 시 랜드사에 지급되는 금액',
      'Gross Merchandise Value. 총 거래액 = landco_quote_total + agency_markup. 여행사 고객 기준 금액',
      '랜드사 정산 완료 여부 (boolean, 기본값 false)',
      '여행사 정산 완료 여부 (boolean, 기본값 false)',
      '생성 시각 (자동)',
    ],
  },
  {
    name: 'payment_schedules (결제일정)',
    headers: ['id', 'request_id', 'settlement_id', 'template_type', 'approval_status', 'total_amount', 'total_people', 'created_at', 'updated_at'],
    descriptions: [
      '결제 일정 고유 ID (uuid, PK)',
      '견적 요청 ID (FK → quote_requests, 1:1 관계)',
      '정산 ID (FK → quote_settlements)',
      '결제 일정 유형. standard=일반(계약금10%+잔금90%), large_event=대형행사(10%+40%+50%), immediate=즉시결제(100%), post_travel=여행후정산(10%+40%+50% 귀국후30일)',
      '승인 상태. approved=승인완료(기본값), pending=랜드사 승인 대기중, rejected=거부됨. post_travel 플랜만 승인 필요',
      '총 결제 금액 (= GMV, 랜드사 견적가 + 여행사 마크업)',
      '총 인원수',
      '생성 시각 (자동)',
      '수정 시각 (자동)',
    ],
  },
  {
    name: 'payment_installments (결제회차)',
    headers: ['id', 'schedule_id', 'label', 'rate', 'amount', 'paid_amount', 'due_date', 'status', 'allow_split', 'paid_at', 'created_at', 'updated_at'],
    descriptions: [
      '결제 회차 고유 ID (uuid, PK)',
      '결제 일정 ID (FK → payment_schedules). 하나의 일정에 여러 회차 존재',
      '회차 이름 (예: 계약금, 중도금, 잔금, 잔금(여행후), 전액)',
      '전체 금액 대비 비율 (예: 0.1 = 10%). 모든 회차 비율 합 = 100%',
      '해당 회차 결제 금액 = total_amount × rate',
      '실제 납부된 금액. 분할결제 시 amount보다 작을 수 있음. 트랜잭션의 success 건 합계',
      '결제 기한 (date). 기한 내 미납 시 overdue 처리 가능',
      '결제 상태. pending=결제대기, partial=부분결제, paid=결제완료, overdue=기한초과, cancelled=취소됨',
      '분할 결제 허용 여부 (boolean). true면 카드+현금 혼합 결제 가능',
      '결제 완료 시각 (전액 납부 시 기록)',
      '생성 시각 (자동)',
      '수정 시각 (자동)',
    ],
  },
  {
    name: 'payment_transactions (트랜잭션)',
    headers: ['id', 'installment_id', 'amount', 'base_amount', 'card_surcharge_rate', 'card_surcharge', 'payment_method', 'status', 'pg_transaction_id', 'pg_response', 'virtual_account_info', 'created_at', 'updated_at'],
    descriptions: [
      '트랜잭션 고유 ID (uuid, PK)',
      '결제 회차 ID (FK → payment_installments). 하나의 회차에 여러 트랜잭션 가능 (분할납부, 재시도 등)',
      '실 결제 금액 = base_amount + card_surcharge. 여행사가 실제로 지불하는 금액',
      '카드 수수료 적용 전 원래 금액. 가상계좌는 amount와 동일',
      '카드 수수료율 (기본값 0). 카드결제 시 2.5%. platform_settings에서 관리',
      '카드 수수료 = base_amount × card_surcharge_rate. 가상계좌는 0',
      '결제 수단. virtual_account=가상계좌, card_link=카드결제(링크), card_keyin=카드결제(수기입력)',
      '결제 상태. pending=대기(가상계좌 발급 후 입금 전), success=성공, failed=실패, cancelled=취소',
      'PG사(결제대행사) 거래 고유 ID. 결제 추적 및 환불 처리 시 사용',
      'PG사 응답 원본 데이터 (jsonb). 디버깅 및 분쟁 시 참조용',
      '가상계좌 정보 (jsonb). {bank, account_number, holder, expires_at} 구조',
      '생성 시각 (자동)',
      '수정 시각 (자동)',
    ],
  },
  {
    name: 'agency_markups (여행사 마크업)',
    headers: ['id', 'quote_id', 'agency_id', 'markup_per_person', 'markup_total', 'created_at', 'updated_at'],
    descriptions: [
      '마크업 고유 ID (uuid, PK)',
      '견적 ID (FK → quotes). 여행사가 랜드사 견적을 선택한 후 마크업 설정',
      '여행사 ID (FK → profiles)',
      '1인당 마크업 금액. 여행사가 랜드사 견적가 위에 올리는 이익',
      '마크업 총액 = markup_per_person × 총 인원. 정산 테이블의 agency_markup과 일치',
      '생성 시각 (자동)',
      '수정 시각 (자동)',
    ],
  },
  {
    name: 'platform_settings (플랫폼 설정)',
    headers: ['key', 'value', 'updated_at'],
    descriptions: [
      '설정 고유 키 (text, PK). 코드에서 이 키로 조회 (예: platform_fee_rate)',
      '설정값 (jsonb). 예: {"rate": 0.05}',
      '수정 시각 (자동)',
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
    descRow.height = 65

    // 2행: 헤더
    const headerRow = ws.addRow(table.headers)
    headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 24

    // 컬럼 너비
    ws.columns.forEach((col, idx) => {
      const header = table.headers[idx] || ''
      const desc = table.descriptions[idx] || ''
      const maxLen = Math.max(header.length, Math.min(desc.length, 40))
      col.width = Math.min(Math.max(maxLen * 1.3 + 2, 12), 55)
    })

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

    // 필터 + 고정
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: table.headers.length } }
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }

  const outPath = '/Users/youngjun-hwang/Desktop/Claude/my-land-pick/결제_정산_테이블_스키마_v2.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`완료: ${outPath}`)
}

main()
