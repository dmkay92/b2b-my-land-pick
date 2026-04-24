import ExcelJS from 'exceljs'

// request_id별 색상
const groupColors = {
  'c513eccc-ab3b-4b6c-837a-eafa688603af': 'FFE0F2FE',
  '5d5f65b4-51c7-477b-ac21-0baf5942a41e': 'FFFEF3C7',
  'aaaaaaaa-1111-2222-3333-444444444444': 'FFDCFCE7',
  'bbbbbbbb-1111-2222-3333-444444444444': 'FFFCE7F3',
  'cccccccc-1111-2222-3333-444444444444': 'FFF3E8FF',
}

const tables = [
  {
    name: 'quote_settlements',
    headers: ['id', 'request_id', 'quote_id', 'landco_id', 'agency_id', 'landco_quote_total', 'platform_fee_rate', 'platform_fee', 'agency_markup', 'agency_commission_rate', 'platform_gross_revenue', 'agency_payout', 'platform_net_revenue', 'landco_payout', 'gmv', 'landco_settled', 'agency_settled', 'created_at'],
    descriptions: [
      'uuid PK — 정산 레코드 고유 ID',
      'uuid FK → quote_requests — 견적 요청 ID (1:1)',
      'uuid FK → quotes — 확정된 견적 ID',
      'uuid FK → profiles — 랜드사 ID',
      'uuid FK → profiles — 여행사 ID',
      'numeric — 랜드사 견적가 (원본 총액, KRW)',
      'numeric — 플랫폼 수수료율 (예: 0.05 = 5%)',
      'numeric — 플랫폼 수수료 = landco_quote_total × platform_fee_rate',
      'numeric — 여행사 마크업 금액',
      'numeric — 여행사 커미션율 (기본값 1.0)',
      'numeric — 플랫폼 총수익 = platform_fee + agency_markup',
      'numeric — 여행사 지급액 = agency_markup × agency_commission_rate',
      'numeric — 플랫폼 순수익 = platform_gross_revenue - agency_payout',
      'numeric — 랜드사 수취액 = landco_quote_total - platform_fee',
      'numeric — GMV = landco_quote_total + agency_markup',
      'boolean — 랜드사 정산 완료 여부 (기본 false)',
      'boolean — 여행사 정산 완료 여부 (기본 false)',
      'timestamptz — 생성 시각',
    ],
    groupCol: 1,
    rows: [
      // 실제 데이터 2건
      ['aea4234b-4b0e-4dda-939e-73dfa6961086', 'c513eccc-ab3b-4b6c-837a-eafa688603af', 'edb3ef17-b972-4778-acce-8a3b83a47b77', 'c77039fc-e543-4033-8d4f-38320b42ff71', 'e46aa841-9c99-492b-add5-60e8835d537f', 22800000, 0.05, 1140000, 2100000, 1.0, 3240000, 2100000, 1140000, 21660000, 24900000, false, false, '2026-04-21T12:27:11+00:00'],
      ['2efedc43-387c-4613-bb4a-c54dd6886a23', '5d5f65b4-51c7-477b-ac21-0baf5942a41e', '496736de-c4da-422f-9c8e-b3ba715a19b1', 'c77039fc-e543-4033-8d4f-38320b42ff71', 'e46aa841-9c99-492b-add5-60e8835d537f', 10580000, 0.05, 529000, 210000, 1.0, 739000, 210000, 529000, 10051000, 10790000, false, false, '2026-04-21T07:34:31+00:00'],
      // 샘플 추가 3건
      ['a1b2c3d4-0001-0001-0001-000000000001', 'aaaaaaaa-1111-2222-3333-444444444444', 'q1q1q1q1-0001-0001-0001-000000000001', 'c77039fc-e543-4033-8d4f-38320b42ff71', 'e46aa841-9c99-492b-add5-60e8835d537f', 45000000, 0.05, 2250000, 5000000, 1.0, 7250000, 5000000, 2250000, 42750000, 50000000, true, true, '2026-04-25T10:00:00+00:00'],
      ['a1b2c3d4-0002-0002-0002-000000000002', 'bbbbbbbb-1111-2222-3333-444444444444', 'q2q2q2q2-0002-0002-0002-000000000002', 'c77039fc-e543-4033-8d4f-38320b42ff71', 'e46aa841-9c99-492b-add5-60e8835d537f', 8000000, 0.05, 400000, 800000, 1.0, 1200000, 800000, 400000, 7600000, 8800000, false, false, '2026-04-26T09:00:00+00:00'],
      ['a1b2c3d4-0003-0003-0003-000000000003', 'cccccccc-1111-2222-3333-444444444444', 'q3q3q3q3-0003-0003-0003-000000000003', 'c77039fc-e543-4033-8d4f-38320b42ff71', 'e46aa841-9c99-492b-add5-60e8835d537f', 30000000, 0.05, 1500000, 3000000, 1.0, 4500000, 3000000, 1500000, 28500000, 33000000, true, false, '2026-04-27T14:00:00+00:00'],
    ],
  },
  {
    name: 'payment_schedules',
    headers: ['id', 'request_id', 'settlement_id', 'template_type', 'approval_status', 'total_amount', 'total_people', 'created_at', 'updated_at'],
    descriptions: [
      'uuid PK — 결제 일정 고유 ID',
      'uuid FK → quote_requests (1:1) — 견적 요청 ID',
      'uuid FK → quote_settlements — 정산 ID',
      'text — standard / large_event / immediate / post_travel',
      'text — approved(기본) / pending / rejected. post_travel만 승인 필요',
      'numeric — 총 결제금액 (= GMV)',
      'integer — 총 인원수',
      'timestamptz — 생성 시각',
      'timestamptz — 수정 시각',
    ],
    groupCol: 1,
    rows: [
      ['9eb434ff-589e-4158-83a8-334630720c82', 'c513eccc-ab3b-4b6c-837a-eafa688603af', 'aea4234b-4b0e-4dda-939e-73dfa6961086', 'immediate', 'approved', 24900000, 21, '2026-04-21T12:27:11+00:00', '2026-04-23T07:33:54+00:00'],
      ['8885a41b-f018-4ad6-8cae-62274c446f72', '5d5f65b4-51c7-477b-ac21-0baf5942a41e', '2efedc43-387c-4613-bb4a-c54dd6886a23', 'post_travel', 'approved', 10790000, 7, '2026-04-21T07:44:23+00:00', '2026-04-22T16:03:14+00:00'],
      ['ps-sample-001', 'aaaaaaaa-1111-2222-3333-444444444444', 'a1b2c3d4-0001-0001-0001-000000000001', 'large_event', 'approved', 50000000, 80, '2026-04-25T10:05:00+00:00', '2026-04-25T10:05:00+00:00'],
      ['ps-sample-002', 'bbbbbbbb-1111-2222-3333-444444444444', 'a1b2c3d4-0002-0002-0002-000000000002', 'post_travel', 'pending', 8800000, 15, '2026-04-26T09:05:00+00:00', '2026-04-26T09:05:00+00:00'],
      ['ps-sample-003', 'cccccccc-1111-2222-3333-444444444444', 'a1b2c3d4-0003-0003-0003-000000000003', 'standard', 'approved', 33000000, 40, '2026-04-27T14:05:00+00:00', '2026-04-27T14:05:00+00:00'],
    ],
  },
  {
    name: 'payment_installments',
    headers: ['id', 'schedule_id', 'label', 'rate', 'amount', 'paid_amount', 'due_date', 'status', 'allow_split', 'paid_at', 'created_at', 'updated_at'],
    descriptions: [
      'uuid PK — 결제 회차 고유 ID',
      'uuid FK → payment_schedules — 결제 일정 ID',
      'text — 회차명 (계약금/중도금/잔금/잔금(여행후)/전액)',
      'numeric — 비율 (모든 회차 합 = 1.0)',
      'numeric — 금액 = total_amount × rate',
      'numeric — 납부 금액 (기본 0). 트랜잭션 success 합계',
      'date — 결제 기한',
      'text — pending / partial / paid / overdue / cancelled',
      'boolean — 분할결제(카드+현금) 허용 여부',
      'timestamptz — 결제 완료 시각 (nullable)',
      'timestamptz — 생성 시각',
      'timestamptz — 수정 시각',
    ],
    groupCol: 1,
    rows: [
      // c513eccc (immediate)
      ['c0243fc2-5c48-4109-86a5-3a16b4eed8fe', '9eb434ff-589e-4158-83a8-334630720c82', '전액', 1.0, 24900000, 0, '2026-04-23', 'pending', true, null, '2026-04-23T07:33:53+00:00', '2026-04-23T07:33:53+00:00'],
      // 5d5f65b4 (post_travel)
      ['a1234567-aaaa-bbbb-cccc-111111111111', '8885a41b-f018-4ad6-8cae-62274c446f72', '계약금', 0.1, 1079000, 0, '2026-04-22', 'pending', false, null, '2026-04-22T15:29:21+00:00', '2026-04-22T15:29:21+00:00'],
      ['6e37f200-0fb5-4d97-88b1-a447066e9b49', '8885a41b-f018-4ad6-8cae-62274c446f72', '중도금', 0.4, 4316000, 0, '2026-04-15', 'pending', true, null, '2026-04-22T15:29:21+00:00', '2026-04-22T15:29:21+00:00'],
      ['984b304c-0dbb-493e-b573-d93e3b129bb2', '8885a41b-f018-4ad6-8cae-62274c446f72', '잔금 (여행 후)', 0.5, 5395000, 0, '2026-05-25', 'pending', true, null, '2026-04-22T15:29:22+00:00', '2026-04-22T15:29:22+00:00'],
      // aaaaaaaa (large_event) — 전액 완납
      ['pi-s-001', 'ps-sample-001', '계약금', 0.1, 5000000, 5000000, '2026-05-02', 'paid', false, '2026-05-01T10:00:00+00:00', '2026-04-25T10:05:00+00:00', '2026-05-01T10:00:00+00:00'],
      ['pi-s-002', 'ps-sample-001', '중도금', 0.4, 20000000, 20000000, '2026-06-01', 'paid', true, '2026-05-30T14:00:00+00:00', '2026-04-25T10:05:00+00:00', '2026-05-30T14:00:00+00:00'],
      ['pi-s-003', 'ps-sample-001', '잔금', 0.5, 25000000, 25000000, '2026-06-20', 'paid', true, '2026-06-19T09:00:00+00:00', '2026-04-25T10:05:00+00:00', '2026-06-19T09:00:00+00:00'],
      // bbbbbbbb (post_travel pending) — 결제 불가
      ['pi-s-004', 'ps-sample-002', '계약금', 0.1, 880000, 0, '2026-05-03', 'pending', false, null, '2026-04-26T09:05:00+00:00', '2026-04-26T09:05:00+00:00'],
      ['pi-s-005', 'ps-sample-002', '중도금', 0.4, 3520000, 0, '2026-05-20', 'pending', true, null, '2026-04-26T09:05:00+00:00', '2026-04-26T09:05:00+00:00'],
      ['pi-s-006', 'ps-sample-002', '잔금 (여행 후)', 0.5, 4400000, 0, '2026-07-10', 'pending', true, null, '2026-04-26T09:05:00+00:00', '2026-04-26T09:05:00+00:00'],
      // cccccccc (standard) — 계약금 납부, 잔금 overdue
      ['pi-s-007', 'ps-sample-003', '계약금', 0.1, 3300000, 3300000, '2026-05-04', 'paid', false, '2026-05-03T11:00:00+00:00', '2026-04-27T14:05:00+00:00', '2026-05-03T11:00:00+00:00'],
      ['pi-s-008', 'ps-sample-003', '잔금', 0.9, 29700000, 0, '2026-04-20', 'overdue', true, null, '2026-04-27T14:05:00+00:00', '2026-04-27T14:05:00+00:00'],
    ],
  },
  {
    name: 'payment_transactions',
    headers: ['id', 'installment_id', 'amount', 'base_amount', 'card_surcharge_rate', 'card_surcharge', 'payment_method', 'status', 'pg_transaction_id', 'pg_response', 'virtual_account_info', 'created_at', 'updated_at'],
    descriptions: [
      'uuid PK — 트랜잭션 고유 ID',
      'uuid FK → payment_installments — 한 회차에 여러 건 가능',
      'numeric — 실 결제금액 = base_amount + card_surcharge',
      'numeric — 수수료 전 금액 (nullable). 가상계좌=amount와 동일',
      'numeric — 카드 수수료율 (기본 0). 카드=0.025',
      'numeric — 카드 수수료 = base_amount × rate (기본 0)',
      'text — virtual_account / card_link / card_keyin',
      'text — pending / success / failed / cancelled',
      'text — PG사 거래 ID (nullable)',
      'jsonb — PG사 응답 원본 (nullable)',
      'jsonb — 가상계좌 정보 {bank, account_number, holder, expires_at} (nullable)',
      'timestamptz — 생성 시각',
      'timestamptz — 수정 시각',
    ],
    groupCol: 1,
    rows: [
      // aaaaaaaa 계약금 — 가상계좌
      ['tx-s-001', 'pi-s-001', 5000000, 5000000, 0, 0, 'virtual_account', 'success', 'PG-20260501-001', null, '{"bank":"신한","account_number":"110-123-456789","holder":"마이랜드픽","expires_at":"2026-05-03T23:59:59"}', '2026-05-01T09:30:00+00:00', '2026-05-01T10:00:00+00:00'],
      // aaaaaaaa 중도금 — 카드 실패 → 카드 성공 → 가상계좌 (3건)
      ['tx-s-002', 'pi-s-002', 10250000, 10000000, 0.025, 250000, 'card_keyin', 'failed', 'PG-20260528-002', null, null, '2026-05-28T11:00:00+00:00', '2026-05-28T11:00:00+00:00'],
      ['tx-s-003', 'pi-s-002', 10250000, 10000000, 0.025, 250000, 'card_keyin', 'success', 'PG-20260528-003', null, null, '2026-05-28T11:30:00+00:00', '2026-05-28T11:30:00+00:00'],
      ['tx-s-004', 'pi-s-002', 10000000, 10000000, 0, 0, 'virtual_account', 'success', 'PG-20260529-004', null, '{"bank":"국민","account_number":"123-45-6789012","holder":"마이랜드픽","expires_at":"2026-05-31T23:59:59"}', '2026-05-29T09:00:00+00:00', '2026-05-30T14:00:00+00:00'],
      // aaaaaaaa 잔금 — 가상계좌
      ['tx-s-005', 'pi-s-003', 25000000, 25000000, 0, 0, 'virtual_account', 'success', 'PG-20260618-005', null, '{"bank":"우리","account_number":"1002-456-789012","holder":"마이랜드픽","expires_at":"2026-06-20T23:59:59"}', '2026-06-18T10:00:00+00:00', '2026-06-19T09:00:00+00:00'],
      // cccccccc 계약금 — 카드링크
      ['tx-s-006', 'pi-s-007', 3382500, 3300000, 0.025, 82500, 'card_link', 'success', 'PG-20260503-006', null, null, '2026-05-03T10:30:00+00:00', '2026-05-03T11:00:00+00:00'],
    ],
  },
  {
    name: 'agency_markups',
    headers: ['id', 'quote_id', 'agency_id', 'markup_per_person', 'markup_total', 'created_at', 'updated_at'],
    descriptions: [
      'uuid PK — 마크업 고유 ID',
      'uuid FK → quotes — 견적 ID (UNIQUE: quote_id + agency_id)',
      'uuid FK → profiles — 여행사 ID',
      'numeric — 1인당 마크업 금액 (기본 0)',
      'numeric — 마크업 총액 (기본 0)',
      'timestamptz — 생성 시각',
      'timestamptz — 수정 시각',
    ],
    groupCol: null,
    rows: [
      ['23c8e65b-df9e-49c9-8115-7c42c6854c67', 'c7cbb217-6ec1-4b72-9976-1dffdfc91b3f', 'e46aa841-9c99-492b-add5-60e8835d537f', 200000, 1800000, '2026-04-22T02:18:27+00:00', '2026-04-22T02:18:30+00:00'],
      ['1d6fa5a3-486c-48ea-b875-51fea631a5e7', 'edb3ef17-b972-4778-acce-8a3b83a47b77', 'e46aa841-9c99-492b-add5-60e8835d537f', 100000, 2100000, '2026-04-21T12:23:27+00:00', '2026-04-21T12:27:11+00:00'],
      ['69cfcd78-11d0-4a31-ae1c-41ba446f6e89', '496736de-c4da-422f-9c8e-b3ba715a19b1', 'e46aa841-9c99-492b-add5-60e8835d537f', 30000, 210000, '2026-04-20T15:47:52+00:00', '2026-04-20T15:47:52+00:00'],
    ],
  },
  {
    name: 'platform_settings',
    headers: ['key', 'value', 'updated_at'],
    descriptions: [
      'text PK — 설정 고유 키',
      'jsonb — 설정값',
      'timestamptz — 수정 시각',
    ],
    groupCol: null,
    rows: [
      ['margin_rate', 0.05, '2026-04-20T15:44:05+00:00'],
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

      // schedule_id 기준 그룹핑 (installments, transactions)
      if (table.groupCol !== null) {
        const val = String(rowData[table.groupCol])
        // request_id 직접 매칭
        const color = groupColors[val]
        if (color) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
        } else {
          // schedule_id → request_id 매핑
          const scheduleMap = {
            '9eb434ff-589e-4158-83a8-334630720c82': 'c513eccc-ab3b-4b6c-837a-eafa688603af',
            '8885a41b-f018-4ad6-8cae-62274c446f72': '5d5f65b4-51c7-477b-ac21-0baf5942a41e',
            'ps-sample-001': 'aaaaaaaa-1111-2222-3333-444444444444',
            'ps-sample-002': 'bbbbbbbb-1111-2222-3333-444444444444',
            'ps-sample-003': 'cccccccc-1111-2222-3333-444444444444',
          }
          // installment_id → schedule_id 매핑
          const installmentMap = {
            'c0243fc2-5c48-4109-86a5-3a16b4eed8fe': '9eb434ff-589e-4158-83a8-334630720c82',
            'a1234567-aaaa-bbbb-cccc-111111111111': '8885a41b-f018-4ad6-8cae-62274c446f72',
            '6e37f200-0fb5-4d97-88b1-a447066e9b49': '8885a41b-f018-4ad6-8cae-62274c446f72',
            '984b304c-0dbb-493e-b573-d93e3b129bb2': '8885a41b-f018-4ad6-8cae-62274c446f72',
            'pi-s-001': 'ps-sample-001', 'pi-s-002': 'ps-sample-001', 'pi-s-003': 'ps-sample-001',
            'pi-s-004': 'ps-sample-002', 'pi-s-005': 'ps-sample-002', 'pi-s-006': 'ps-sample-002',
            'pi-s-007': 'ps-sample-003', 'pi-s-008': 'ps-sample-003',
          }

          let reqId = scheduleMap[val]
          if (!reqId && installmentMap[val]) {
            reqId = scheduleMap[installmentMap[val]]
          }
          if (reqId && groupColors[reqId]) {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: groupColors[reqId] } }
          }
        }
      }
    }

    // 컬럼 너비
    ws.columns.forEach((col, idx) => {
      const header = table.headers[idx] || ''
      let maxLen = header.length
      for (const r of table.rows) {
        maxLen = Math.max(maxLen, String(r[idx] ?? '').length)
      }
      col.width = Math.min(Math.max(maxLen * 1.1 + 2, 12), 45)
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
        if (moneyKw.some(k => h.includes(k)) && typeof cell.value === 'number') {
          cell.numFmt = '#,##0'
        }
        if (h.includes('rate') && typeof cell.value === 'number' && cell.value > 0 && cell.value < 1) {
          cell.numFmt = '0.0%'
        }
      })
    })

    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: table.headers.length } }
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }

  const outPath = '/Users/youngjun-hwang/Desktop/Claude/my-land-pick/결제_정산_DB스키마_샘플데이터.xlsx'
  await wb.xlsx.writeFile(outPath)
  console.log(`완료: ${outPath}`)
}

main()
