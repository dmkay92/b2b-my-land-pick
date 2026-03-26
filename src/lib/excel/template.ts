import ExcelJS from 'exceljs'

interface TemplateOptions {
  event_name: string
  destination: string
  depart_date: string
  return_date: string
  total_people: number
  hotel_grade: number
}

// 스페인 일정표 스타일 기준 색상
const HEADER_BLUE = 'FF1B5E9E'   // 진한 파란색 (헤더)
const HOTEL_BLUE = 'FFD6E4F5'    // 연한 파란색 (호텔 행)
const ACCENT_GREEN = 'FFE8F5E9'  // 연한 초록 (소계 행)
const BORDER_COLOR = 'FFBDBDBD'

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
  }
}

export async function generateQuoteTemplate(opts: TemplateOptions): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Incentive Quote Platform'

  // ── 시트 1: 일정표 ──────────────────────────────────────────
  const scheduleSheet = workbook.addWorksheet('일정표')
  scheduleSheet.columns = [
    { key: 'day', width: 10 },
    { key: 'area', width: 18 },
    { key: 'transport', width: 12 },
    { key: 'time', width: 10 },
    { key: 'itinerary', width: 50 },
    { key: 'meal', width: 14 },
  ]

  // 제목 행
  scheduleSheet.mergeCells('A1:F1')
  const titleCell = scheduleSheet.getCell('A1')
  titleCell.value = `[${opts.event_name}] 일정표 — ${opts.destination} (${opts.depart_date} ~ ${opts.return_date})`
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLUE } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  scheduleSheet.getRow(1).height = 28

  // 헤더 행
  const scheduleHeaders = ['여행일자', '여행지역', '교통편', '시간', '여행일정', '식사']
  const headerRow = scheduleSheet.getRow(2)
  scheduleHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLUE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    applyBorder(cell)
  })
  headerRow.height = 22

  // 일정 행 (Day 1 ~ Day N)
  const days = Math.ceil(
    (new Date(opts.return_date).getTime() - new Date(opts.depart_date).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1

  for (let d = 1; d <= days; d++) {
    const row = scheduleSheet.addRow([`제${String(d).padStart(2, '0')}일`, '', '', '', '', ''])
    row.height = 20
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      applyBorder(cell)
    })

    // 호텔 행 (별도 색상으로 구분)
    const hotelRow = scheduleSheet.addRow(['', '', '', '', `${opts.hotel_grade}성급 호텔 숙박`, ''])
    hotelRow.height = 18
    hotelRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOTEL_BLUE } }
      cell.alignment = { vertical: 'middle' }
      applyBorder(cell)
    })
  }

  // ── 시트 2: 견적서 ──────────────────────────────────────────
  const quoteSheet = workbook.addWorksheet('견적서')
  quoteSheet.columns = [
    { key: 'category', width: 14 },
    { key: 'date', width: 12 },
    { key: 'detail', width: 30 },
    { key: 'price', width: 14 },
    { key: 'count', width: 10 },
    { key: 'quantity', width: 12 },
    { key: 'total', width: 16 },
    { key: 'note', width: 20 },
  ]

  // 제목 행
  quoteSheet.mergeCells('A1:H1')
  const qTitleCell = quoteSheet.getCell('A1')
  qTitleCell.value = `[${opts.event_name}] 견적서 — ${opts.destination} / 총 ${opts.total_people}명`
  qTitleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  qTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLUE } }
  qTitleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  quoteSheet.getRow(1).height = 28

  // 작성 안내
  quoteSheet.mergeCells('A2:H2')
  const noteCell = quoteSheet.getCell('A2')
  noteCell.value = '※ 합계 = 가격 × 횟수 × 인원/수량  |  1인당 견적가는 하단 자동 계산됩니다.'
  noteCell.font = { italic: true, size: 9, color: { argb: 'FF757575' } }
  noteCell.alignment = { horizontal: 'center' }

  // 헤더 행
  const quoteHeaders = ['항목', '날짜', '세부내역', '가격(원)', '횟수', '인원/수량', '합계', '기타']
  const qHeaderRow = quoteSheet.getRow(3)
  quoteHeaders.forEach((h, i) => {
    const cell = qHeaderRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLUE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    applyBorder(cell)
  })
  qHeaderRow.height = 22

  // 항목 카테고리별 예시 행
  const CATEGORIES = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타']
  let rowIndex = 4
  CATEGORIES.forEach(cat => {
    const row = quoteSheet.getRow(rowIndex)
    row.getCell(1).value = cat
    row.getCell(4).numFmt = '#,##0'
    row.getCell(7).value = { formula: `D${rowIndex}*E${rowIndex}*F${rowIndex}` }
    row.getCell(7).numFmt = '#,##0'
    row.height = 20
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) {
        cell.alignment = { vertical: 'middle', wrapText: true }
        applyBorder(cell)
      }
    })
    rowIndex++
  })

  // 빈 행 3개 (자유 입력용)
  for (let i = 0; i < 3; i++) {
    const row = quoteSheet.getRow(rowIndex)
    row.height = 20
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) applyBorder(cell)
    })
    quoteSheet.getCell(`G${rowIndex}`).value = { formula: `D${rowIndex}*E${rowIndex}*F${rowIndex}` }
    quoteSheet.getCell(`G${rowIndex}`).numFmt = '#,##0'
    rowIndex++
  }

  // 총합계 행
  const totalRow = quoteSheet.getRow(rowIndex)
  quoteSheet.mergeCells(`A${rowIndex}:F${rowIndex}`)
  totalRow.getCell(1).value = '총 합계'
  totalRow.getCell(1).font = { bold: true }
  totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
  totalRow.getCell(7).value = { formula: `SUM(G4:G${rowIndex - 1})` }
  totalRow.getCell(7).numFmt = '#,##0'
  totalRow.getCell(7).font = { bold: true }
  totalRow.height = 22
  totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum <= 8) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_GREEN } }
      applyBorder(cell)
    }
  })
  rowIndex++

  // 1인당 견적가 행
  const perPersonRow = quoteSheet.getRow(rowIndex)
  quoteSheet.mergeCells(`A${rowIndex}:F${rowIndex}`)
  perPersonRow.getCell(1).value = `1인당 견적가 (총 ${opts.total_people}명 기준)`
  perPersonRow.getCell(1).font = { bold: true }
  perPersonRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
  perPersonRow.getCell(7).value = { formula: `G${rowIndex - 1}/${opts.total_people}` }
  perPersonRow.getCell(7).numFmt = '#,##0'
  perPersonRow.getCell(7).font = { bold: true, color: { argb: 'FF1B5E9E' } }
  perPersonRow.height = 24
  perPersonRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum <= 8) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEEFF' } }
      applyBorder(cell)
    }
  })

  return workbook
}
