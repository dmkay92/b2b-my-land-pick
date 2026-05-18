import ExcelJS from 'exceljs'

const groupColors = [
  'FFE0F2FE', // 파랑
  'FFFEF3C7', // 노랑
  'FFDCFCE7', // 초록
  'FFFCE7F3', // 핑크
  'FFF3E8FF', // 보라
  'FFFEE2E2', // 빨강
  'FFECFDF5', // 민트
]

const reqIds = ['req-001', 'req-002', 'req-003', 'req-004', 'req-005', 'req-006', 'req-007']
const reqColorMap = Object.fromEntries(reqIds.map((id, i) => [id, groupColors[i]]))

const tables = [
  {
    name: '정산 (quote_settlements)',
    headers: ['request_id', '행사명', 'settlement_id', 'quote_id', '랜드사', '여행사', 'landco_quote_total', 'platform_fee_rate', 'platform_fee', 'agency_markup', 'agency_commission_rate', 'platform_gross_revenue', 'agency_payout', 'platform_net_revenue', 'landco_payout', 'gmv', 'landco_settled', 'agency_settled', 'created_at'],
    descriptions: [
      '견적 요청 ID — 모든 시트에서 이 ID로 데이터를 추적합니다',
      '행사명 (참고용)',
      '정산 레코드 고유 ID',
      '확정된 견적 ID',
      '랜드사명 (실제 DB에는 uuid)',
      '여행사명 (실제 DB에는 uuid)',
      '랜드사 견적가 (원본 총액, KRW). 외화 견적은 환율 적용 후 원화 환산된 금액',
      '플랫폼 수수료율 (예: 0.05 = 5%)',
      '플랫폼 수수료 = landco_quote_total × platform_fee_rate',
      '여행사 마크업 = 1인당 마크업 × 인원수',
      '여행사 커미션율 (기본값 1.0 = 마크업 100% 지급)',
      '플랫폼 총수익 = platform_fee + agency_markup',
      '여행사 지급액 = agency_markup × agency_commission_rate',
      '플랫폼 순수익 = platform_gross_revenue - agency_payout',
      '랜드사 수취액 = landco_quote_total - platform_fee',
      'GMV(총거래액) = landco_quote_total + agency_markup',
      '랜드사 정산 완료 여부',
      '여행사 정산 완료 여부',
      '생성일시',
    ],
    groupCol: 0,
    rows: [
      ['req-001', '산림청 오사카 5일', 'stl-001', 'qt-001', '하나투어랜드', 'HNK트래비즈', 15000000, 0.05, 750000, 2000000, 1.0, 2750000, 2000000, 750000, 14250000, 17000000, '완료', '완료', '2026-03-10'],
      ['req-002', '삼성전자 동유럽 7일', 'stl-002', 'qt-003', '모두투어랜드', '참좋은여행', 42000000, 0.05, 2100000, 5000000, 1.0, 7100000, 5000000, 2100000, 39900000, 47000000, '완료', '미완료', '2026-03-15'],
      ['req-003', '현대차 두바이 6일', 'stl-003', 'qt-005', '서울랜드투어', '롯데관광', 8500000, 0.05, 425000, 1000000, 1.0, 1425000, 1000000, 425000, 8075000, 9500000, '완료', '완료', '2026-03-18'],
      ['req-004', 'LG전자 교토 4일', 'stl-004', 'qt-007', '일본전문랜드', '내일투어', 22000000, 0.05, 1100000, 3000000, 1.0, 4100000, 3000000, 1100000, 20900000, 25000000, '미완료', '미완료', '2026-03-25'],
      ['req-005', 'SK하이닉스 스페인 9일', 'stl-005', 'qt-009', '유럽투어랜드', '투어마스터', 65000000, 0.05, 3250000, 8000000, 1.0, 11250000, 8000000, 3250000, 61750000, 73000000, '미완료', '미완료', '2026-04-01'],
      ['req-006', '카카오 방콕 3일', 'stl-006', 'qt-011', '하나투어랜드', '세계로여행', 12000000, 0.05, 600000, 1500000, 1.0, 2100000, 1500000, 600000, 11400000, 13500000, '완료', '완료', '2026-04-05'],
      ['req-007', 'CJ 다낭 4일', 'stl-007', 'qt-012', '동남아랜드', 'HNK트래비즈', 9800000, 0.05, 490000, 1200000, 1.0, 1690000, 1200000, 490000, 9310000, 11000000, '완료', '미완료', '2026-04-08'],
    ],
  },
  {
    name: '결제일정 (payment_schedules)',
    headers: ['request_id', '행사명', 'schedule_id', 'settlement_id', 'template_type', 'approval_status', 'total_amount', 'total_people', 'created_at'],
    descriptions: [
      '견적 요청 ID',
      '행사명 (참고용)',
      '결제 일정 고유 ID',
      '정산 ID (FK → quote_settlements)',
      '결제 유형. standard=일반(10%+90%), large_event=대형(10%+40%+50%), immediate=즉시(100%), post_travel=여행후정산(10%+40%+50% 귀국후30일)',
      '승인 상태. approved=승인완료(기본), pending=랜드사 승인대기, rejected=거부. post_travel만 승인 필요',
      '총 결제금액 (= GMV)',
      '총 인원',
      '생성일시',
    ],
    groupCol: 0,
    rows: [
      ['req-001', '산림청 오사카 5일', 'ps-001', 'stl-001', 'standard', 'approved', 17000000, 30, '2026-03-10'],
      ['req-002', '삼성전자 동유럽 7일', 'ps-002', 'stl-002', 'large_event', 'approved', 47000000, 80, '2026-03-15'],
      ['req-003', '현대차 두바이 6일', 'ps-003', 'stl-003', 'immediate', 'approved', 9500000, 15, '2026-03-18'],
      ['req-004', 'LG전자 교토 4일', 'ps-004', 'stl-004', 'standard', 'approved', 25000000, 40, '2026-03-25'],
      ['req-005', 'SK하이닉스 스페인 9일', 'ps-005', 'stl-005', 'post_travel', 'approved', 73000000, 120, '2026-04-01'],
      ['req-006', '카카오 방콕 3일', 'ps-006', 'stl-006', 'post_travel', 'pending', 13500000, 20, '2026-04-05'],
      ['req-007', 'CJ 다낭 4일', 'ps-007', 'stl-007', 'post_travel', 'rejected', 11000000, 25, '2026-04-08'],
    ],
  },
  {
    name: '결제회차 (installments)',
    headers: ['request_id', '행사명', 'schedule_id', 'installment_id', 'label', 'rate', 'amount', 'paid_amount', 'due_date', 'status', 'allow_split', 'paid_at'],
    descriptions: [
      '견적 요청 ID',
      '행사명 (참고용)',
      '결제 일정 ID (FK → payment_schedules)',
      '결제 회차 고유 ID',
      '회차명 (계약금/중도금/잔금/잔금(여행후)/전액)',
      '비율 (모든 회차 합 = 100%)',
      '금액 = total_amount × rate',
      '실제 납부 금액. 트랜잭션 success 건 합계. 분할결제 시 amount보다 작을 수 있음',
      '결제 기한',
      '상태. pending=대기, partial=부분결제, paid=완료, overdue=기한초과, cancelled=취소',
      '분할결제(카드+현금) 허용 여부',
      '결제 완료 시각',
    ],
    groupCol: 0,
    rows: [
      // req-001 standard 전액완납
      ['req-001', '산림청 오사카 5일', 'ps-001', 'pi-001', '계약금', 0.1, 1700000, 1700000, '2026-03-17', 'paid', false, '2026-03-16'],
      ['req-001', '산림청 오사카 5일', 'ps-001', 'pi-002', '잔금', 0.9, 15300000, 15300000, '2026-07-15', 'paid', true, '2026-07-14'],
      // req-002 large_event 2차 부분납부
      ['req-002', '삼성전자 동유럽 7일', 'ps-002', 'pi-003', '계약금', 0.1, 4700000, 4700000, '2026-03-22', 'paid', false, '2026-03-21'],
      ['req-002', '삼성전자 동유럽 7일', 'ps-002', 'pi-004', '중도금', 0.4, 18800000, 10000000, '2026-04-20', 'partial', true, null],
      ['req-002', '삼성전자 동유럽 7일', 'ps-002', 'pi-005', '잔금', 0.5, 23500000, 0, '2026-05-10', 'pending', true, null],
      // req-003 immediate 완납
      ['req-003', '현대차 두바이 6일', 'ps-003', 'pi-006', '전액', 1.0, 9500000, 9500000, '2026-03-18', 'paid', true, '2026-03-18'],
      // req-004 standard 계약금만
      ['req-004', 'LG전자 교토 4일', 'ps-004', 'pi-007', '계약금', 0.1, 2500000, 2500000, '2026-04-01', 'paid', false, '2026-03-31'],
      ['req-004', 'LG전자 교토 4일', 'ps-004', 'pi-008', '잔금', 0.9, 22500000, 0, '2026-07-15', 'pending', true, null],
      // req-005 post_travel 승인됨 — 계약금 완납, 중도금 기한초과
      ['req-005', 'SK하이닉스 스페인 9일', 'ps-005', 'pi-009', '계약금', 0.1, 7300000, 7300000, '2026-04-08', 'paid', false, '2026-04-07'],
      ['req-005', 'SK하이닉스 스페인 9일', 'ps-005', 'pi-010', '중도금', 0.4, 29200000, 0, '2026-04-15', 'overdue', true, null],
      ['req-005', 'SK하이닉스 스페인 9일', 'ps-005', 'pi-011', '잔금 (여행 후)', 0.5, 36500000, 0, '2026-06-20', 'pending', true, null],
      // req-006 post_travel 승인대기 — 아직 결제 불가
      ['req-006', '카카오 방콕 3일', 'ps-006', 'pi-012', '계약금', 0.1, 1350000, 0, '2026-04-12', 'pending', false, null],
      ['req-006', '카카오 방콕 3일', 'ps-006', 'pi-013', '중도금', 0.4, 5400000, 0, '2026-05-01', 'pending', true, null],
      ['req-006', '카카오 방콕 3일', 'ps-006', 'pi-014', '잔금 (여행 후)', 0.5, 6750000, 0, '2026-06-10', 'pending', true, null],
      // req-007 post_travel 거부 → standard로 변경
      ['req-007', 'CJ 다낭 4일', 'ps-007', 'pi-015', '계약금', 0.1, 1100000, 1100000, '2026-04-15', 'paid', false, '2026-04-14'],
      ['req-007', 'CJ 다낭 4일', 'ps-007', 'pi-016', '잔금', 0.9, 9900000, 0, '2026-04-20', 'overdue', true, null],
    ],
  },
  {
    name: '트랜잭션 (transactions)',
    headers: ['request_id', '행사명', 'installment_id', '회차명', 'payment_method', 'base_amount', 'card_surcharge_rate', 'card_surcharge', 'amount', 'status', 'pg_transaction_id', 'virtual_account_info'],
    descriptions: [
      '견적 요청 ID',
      '행사명 (참고용)',
      '결제 회차 ID (FK → payment_installments). 한 회차에 여러 트랜잭션 가능',
      '회차명 (참고용)',
      '결제수단. virtual_account=가상계좌, card_link=카드(링크), card_keyin=카드(수기)',
      '수수료 적용 전 금액. 가상계좌=amount와 동일',
      '카드 수수료율. 가상계좌=0, 카드=0.025(2.5%)',
      '카드 수수료 = base_amount × rate',
      '실 결제금액 = base_amount + card_surcharge',
      '상태. success=성공, failed=실패, pending=대기(가상계좌 미입금), cancelled=취소',
      'PG사 거래 ID',
      '가상계좌: 은행+계좌번호 / 카드: 비고',
    ],
    groupCol: 0,
    rows: [
      // req-001 가상계좌 2건 완납
      ['req-001', '산림청 오사카 5일', 'pi-001', '계약금', 'virtual_account', 1700000, 0, 0, 1700000, 'success', 'PG-0316-001', '신한 110-123-456789'],
      ['req-001', '산림청 오사카 5일', 'pi-002', '잔금', 'virtual_account', 15300000, 0, 0, 15300000, 'success', 'PG-0714-002', '신한 110-123-456789'],
      // req-002 계약금 가상계좌 + 중도금 카드실패→카드성공→가상계좌 (4건)
      ['req-002', '삼성전자 동유럽 7일', 'pi-003', '계약금', 'virtual_account', 4700000, 0, 0, 4700000, 'success', 'PG-0321-003', '국민 123-45-6789012'],
      ['req-002', '삼성전자 동유럽 7일', 'pi-004', '중도금', 'card_keyin', 5000000, 0.025, 125000, 5125000, 'failed', 'PG-0415-004', '한도초과로 실패'],
      ['req-002', '삼성전자 동유럽 7일', 'pi-004', '중도금', 'card_keyin', 5000000, 0.025, 125000, 5125000, 'success', 'PG-0415-005', '재시도 성공'],
      ['req-002', '삼성전자 동유럽 7일', 'pi-004', '중도금', 'virtual_account', 5000000, 0, 0, 5000000, 'success', 'PG-0418-006', '신한 110-222-333444'],
      // req-003 즉시결제 가상계좌
      ['req-003', '현대차 두바이 6일', 'pi-006', '전액', 'virtual_account', 9500000, 0, 0, 9500000, 'success', 'PG-0318-007', '하나 123-456789-01234'],
      // req-004 계약금 가상계좌
      ['req-004', 'LG전자 교토 4일', 'pi-007', '계약금', 'virtual_account', 2500000, 0, 0, 2500000, 'success', 'PG-0331-008', '국민 987-65-4321098'],
      // req-005 계약금 카드링크 2건 + 가상계좌 1건 (분할)
      ['req-005', 'SK하이닉스 스페인 9일', 'pi-009', '계약금', 'card_link', 3000000, 0.025, 75000, 3075000, 'success', 'PG-0405-009', ''],
      ['req-005', 'SK하이닉스 스페인 9일', 'pi-009', '계약금', 'card_link', 2000000, 0.025, 50000, 2050000, 'success', 'PG-0406-010', ''],
      ['req-005', 'SK하이닉스 스페인 9일', 'pi-009', '계약금', 'virtual_account', 2300000, 0, 0, 2300000, 'success', 'PG-0407-011', '우리 1002-888-999000'],
      // req-006 승인대기 → 트랜잭션 없음
      // req-007 계약금 카드수기
      ['req-007', 'CJ 다낭 4일', 'pi-015', '계약금', 'card_keyin', 1100000, 0.025, 27500, 1127500, 'success', 'PG-0414-012', ''],
    ],
  },
  {
    name: '마크업 (agency_markups)',
    headers: ['request_id', '행사명', 'quote_id', '여행사', 'markup_per_person', 'markup_total', 'created_at'],
    descriptions: [
      '견적 요청 ID',
      '행사명 (참고용)',
      '견적 ID',
      '여행사명 (실제 DB에는 uuid)',
      '1인당 마크업 금액',
      '마크업 총액 = per_person × 인원수',
      '생성일시',
    ],
    groupCol: 0,
    rows: [
      ['req-001', '산림청 오사카 5일', 'qt-001', 'HNK트래비즈', 66667, 2000000, '2026-03-10'],
      ['req-002', '삼성전자 동유럽 7일', 'qt-003', '참좋은여행', 62500, 5000000, '2026-03-15'],
      ['req-003', '현대차 두바이 6일', 'qt-005', '롯데관광', 66667, 1000000, '2026-03-18'],
      ['req-004', 'LG전자 교토 4일', 'qt-007', '내일투어', 75000, 3000000, '2026-03-25'],
      ['req-005', 'SK하이닉스 스페인 9일', 'qt-009', '투어마스터', 66667, 8000000, '2026-04-01'],
      ['req-006', '카카오 방콕 3일', 'qt-011', '세계로여행', 75000, 1500000, '2026-04-05'],
      ['req-007', 'CJ 다낭 4일', 'qt-012', 'HNK트래비즈', 48000, 1200000, '2026-04-08'],
    ],
  },
  {
    name: '설정 (platform_settings)',
    headers: ['key', 'value', '설명'],
    descriptions: [
      '설정 고유 키 (PK)',
      '설정값 (JSON)',
      '이 설정이 적용되는 곳',
    ],
    groupCol: null,
    rows: [
      ['platform_fee_rate', '{"rate": 0.05}', '플랫폼 수수료율 5% — 랜드사 견적가 대비'],
      ['agency_commission_rate', '{"rate": 1.0}', '여행사 커미션율 100% — 마크업 전액 여행사에 지급'],
      ['card_surcharge_rate', '{"rate": 0.025}', '카드결제 수수료율 2.5% — 카드 결제 시 추가 부과'],
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
    descRow.height = 60

    // 2행: 헤더
    const headerRow = ws.addRow(table.headers)
    headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 24

    // 데이터 행
    for (const rowData of table.rows) {
      const row = ws.addRow(rowData)
      row.alignment = { vertical: 'middle' }
      row.height = 22

      if (table.groupCol !== null) {
        const reqId = rowData[table.groupCol]
        const color = reqColorMap[reqId]
        if (color) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
        }
      }
    }

    // 컬럼 너비
    ws.columns.forEach((col, idx) => {
      const header = table.headers[idx] || ''
      let maxLen = header.length
      for (const row of table.rows) {
        maxLen = Math.max(maxLen, String(row[idx] ?? '').length)
      }
      col.width = Math.min(Math.max(maxLen * 1.3 + 2, 10), 55)
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
    const moneyKw = ['amount', 'total', 'fee', 'markup', 'payout', 'revenue', 'gmv', 'surcharge', '금액', '총액']
    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return
      row.eachCell((cell, colNum) => {
        const h = table.headers[colNum - 1]?.toLowerCase() || ''
        if (moneyKw.some(k => h.includes(k)) && typeof cell.value === 'number') {
          cell.numFmt = '#,##0'
        }
        if (h.includes('rate') && typeof cell.value === 'number' && cell.value < 1) {
          cell.numFmt = '0.0%'
        }
        if (h === 'rate' && typeof cell.value === 'number') {
          cell.numFmt = '0%'
        }
      })
    })

    // 필터 + 고정
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: table.headers.length } }
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }

  const outPath = '/Users/youngjun-hwang/Desktop/Claude/my-land-pick/결제_정산_테이블_스키마_v2_샘플.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`완료: ${outPath}`)
}

main()
