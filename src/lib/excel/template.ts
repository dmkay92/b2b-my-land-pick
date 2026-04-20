import ExcelJS from 'exceljs'
import type { ItineraryDay, PricingData } from '@/lib/supabase/types'

interface TemplateOptions {
  event_name: string
  destination: string
  depart_date: string
  return_date: string
  total_people: number
  hotel_grade: number
  landco_name?: string
  adults?: number
  children?: number
  infants?: number
  leaders?: number
  includes?: string
  excludes?: string
}

const HEADER_BLACK = 'FF000000'  // 검정 (헤더)
const HOTEL_BLUE = 'FFD6E4F5'    // 연한 파란색 (호텔 행)
const ACCENT_GREEN = 'FFE8F5E9'  // 연한 초록 (소계 행)
const BORDER_COLOR = 'FFBDBDBD'

function addBrandRow(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, totalCols: number) {
  const row = sheet.getRow(1)
  row.height = 36

  sheet.mergeCells(1, 1, 1, totalCols)
  const cell = row.getCell(1)
  cell.value = {
    richText: [
      { text: '마이랜드픽', font: { bold: true, size: 15, color: { argb: 'FF111111' } } },
      { text: ' by Myrealtrip', font: { size: 12, color: { argb: 'FF888888' }, italic: true } },
    ],
  }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } }

}

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
  }
}

function applyBlackBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  }
}

function addInfoSection(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, totalCols: number, opts: TemplateOptions): number {
  // 날짜에 요일 추가 (YYYY-MM-DD → YYYY-MM-DD (요))
  const DAYS = ['일', '월', '화', '수', '목', '금', '토']
  const formatDateWithDay = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const day = DAYS[new Date(y, m - 1, d).getDay()]
    return `${dateStr} (${day})`
  }

  // 인원 breakdown 문자열 생성
  const parts: string[] = []
  if ((opts.adults ?? 0) > 0) parts.push(`성인 ${opts.adults}명`)
  if ((opts.children ?? 0) > 0) parts.push(`아동 ${opts.children}명`)
  if ((opts.infants ?? 0) > 0) parts.push(`유아 ${opts.infants}명`)
  if ((opts.leaders ?? 0) > 0) parts.push(`인솔자 ${opts.leaders}명`)
  const peopleText = `총 ${opts.total_people}명${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`

  const LABEL_COL = 1
  const VALUE_START = 2
  const lastCol = totalCols
  const labelFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: HEADER_BLACK } }

  const infoRows: Array<{ label: string; value: string }> = [
    { label: '행사명', value: opts.event_name },
    { label: '발신처', value: opts.landco_name ?? '' },
    { label: '총 인원', value: peopleText },
    { label: '출발일', value: formatDateWithDay(opts.depart_date) },
    { label: '도착일', value: formatDateWithDay(opts.return_date) },
  ]

  // row 1: 브랜드 행
  addBrandRow(workbook, sheet, totalCols)

  let rowNum = 2  // row 2부터 시작

  for (const info of infoRows) {
    const row = sheet.getRow(rowNum)
    row.height = 25

    const labelCell = row.getCell(LABEL_COL)
    labelCell.value = info.label
    labelCell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    labelCell.fill = labelFill
    labelCell.alignment = { vertical: 'middle', horizontal: 'center' }
    applyBlackBorder(labelCell)

    sheet.mergeCells(rowNum, VALUE_START, rowNum, lastCol)
    const valueCell = row.getCell(VALUE_START)
    valueCell.value = info.value
    valueCell.font = { size: 10 }
    valueCell.alignment = { vertical: 'middle', horizontal: 'left' }
    applyBlackBorder(valueCell)

    rowNum++
  }

  // 빈 구분 행 (HTML 미리보기에서 렌더링되도록 셀 채움)
  const sepRow = sheet.getRow(rowNum)
  sepRow.height = 12
  for (let c = 1; c <= lastCol; c++) sepRow.getCell(c).value = ''
  rowNum++

  return rowNum  // 다음에 써야 할 행 번호 반환
}

export async function generateQuoteTemplate(opts: TemplateOptions): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Incentive Quote Platform'

  // ── 시트 1: 일정표 ──────────────────────────────────────────
  const scheduleSheet = workbook.addWorksheet('일정표')
  scheduleSheet.views = [{ showGridLines: false }]
  scheduleSheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(scheduleSheet as any).pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
  scheduleSheet.columns = [
    { key: 'day', width: 10 },
    { key: 'area', width: 13 },
    { key: 'transport', width: 10 },
    { key: 'time', width: 7 },
    { key: 'itinerary', width: 60 },
    { key: 'meal', width: 10 },
  ]

  // 브랜드 행 (row 1)
  addBrandRow(workbook, scheduleSheet, 6)

  // 제목 행 (row 2)
  scheduleSheet.mergeCells('A2:F2')
  const titleCell = scheduleSheet.getCell('A2')
  titleCell.value = `[${opts.event_name}] 일정표 — ${opts.destination} (${opts.depart_date} ~ ${opts.return_date})`
  titleCell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLACK } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  scheduleSheet.getRow(2).height = 28

  // 헤더 행 (row 3)
  const scheduleHeaders = ['날짜', '지역', '교통편', '시간', '일정', '식사']
  const headerRow = scheduleSheet.getRow(3)
  scheduleHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLACK } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    applyBlackBorder(cell)
  })
  headerRow.height = 18

  // 일정 행 (Day 1 ~ Day N) — UTC 기준 날짜 계산으로 timezone 무관
  const [dy, dm, dd] = opts.depart_date.split('-').map(Number)
  const [ry, rm, rd] = opts.return_date.split('-').map(Number)
  const departMs = Date.UTC(dy, dm - 1, dd)
  const returnMs = Date.UTC(ry, rm - 1, rd)
  const days = Math.max(1, Math.ceil((returnMs - departMs) / (1000 * 60 * 60 * 24)) + 1)

  for (let d = 1; d <= days; d++) {
    const row = scheduleSheet.addRow([`제${String(d).padStart(2, '0')}일`, '', '', '', '', ''])
    row.height = 16
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: false }
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
  quoteSheet.views = [{ showGridLines: false }]
  quoteSheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(quoteSheet as any).pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
  quoteSheet.columns = [
    { key: 'category', width: 14 },
    { key: 'date', width: 12 },
    { key: 'detail', width: 40 },
    { key: 'currency', width: 8 },
    { key: 'price', width: 14 },
    { key: 'count', width: 10 },
    { key: 'quantity', width: 10 },
    { key: 'total', width: 14 },
  ]

  // 브랜드 행 (row 1)
  addBrandRow(workbook, quoteSheet, 8)

  // 제목 행 (row 2)
  quoteSheet.mergeCells('A2:H2')
  const qTitleCell = quoteSheet.getCell('A2')
  qTitleCell.value = `[${opts.event_name}] 견적서 — ${opts.destination} / 총 ${opts.total_people}명`
  qTitleCell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  qTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLACK } }
  qTitleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  quoteSheet.getRow(2).height = 28

  // 작성 안내 (row 3)
  quoteSheet.mergeCells('A3:H3')
  const noteCell = quoteSheet.getCell('A3')
  noteCell.value = '※ 합계 = 가격 × 횟수/박수 × 인원/수량  |  1인당 견적가는 하단 자동 계산됩니다.'
  noteCell.font = { italic: true, size: 10, color: { argb: 'FF757575' } }
  noteCell.alignment = { horizontal: 'center' }

  // 헤더 행 (row 4)
  const quoteHeaders = ['항목', '날짜', '내역', '통화', '가격', '횟수/박수', '인원/수량', '합계']
  const qHeaderRow = quoteSheet.getRow(4)
  quoteHeaders.forEach((h, i) => {
    const cell = qHeaderRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLACK } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    applyBlackBorder(cell)
  })
  qHeaderRow.height = 18

  // 항목 카테고리별 예시 행 (row 5부터)
  const CATEGORIES = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타']
  let rowIndex = 5
  CATEGORIES.forEach(cat => {
    const row = quoteSheet.getRow(rowIndex)
    row.getCell(1).value = cat
    row.getCell(4).numFmt = '#,##0'
    row.getCell(8).value = { formula: `D${rowIndex}*F${rowIndex}*G${rowIndex}` }
    row.getCell(8).numFmt = '#,##0'
    row.height = 16
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) {
        cell.alignment = { vertical: 'middle', wrapText: false }
        applyBorder(cell)
      }
    })
    rowIndex++
  })

  // 빈 행 3개 (자유 입력용)
  for (let i = 0; i < 3; i++) {
    const row = quoteSheet.getRow(rowIndex)
    row.height = 16
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) applyBorder(cell)
    })
    quoteSheet.getCell(`H${rowIndex}`).value = { formula: `D${rowIndex}*F${rowIndex}*G${rowIndex}` }
    quoteSheet.getCell(`H${rowIndex}`).numFmt = '#,##0'
    rowIndex++
  }

  // 총합계 행
  const totalRow = quoteSheet.getRow(rowIndex)
  quoteSheet.mergeCells(`A${rowIndex}:G${rowIndex}`)
  totalRow.getCell(1).value = '총 합계'
  totalRow.getCell(1).font = { bold: true }
  totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
  totalRow.getCell(8).value = { formula: `SUM(H5:H${rowIndex - 1})` }
  totalRow.getCell(8).numFmt = '#,##0'
  totalRow.getCell(8).font = { bold: true }
  totalRow.height = 18
  totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum <= 8) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_GREEN } }
      applyBorder(cell)
    }
  })
  rowIndex++

  // 1인당 견적가 행
  const perPersonRow = quoteSheet.getRow(rowIndex)
  quoteSheet.mergeCells(`A${rowIndex}:G${rowIndex}`)
  perPersonRow.getCell(1).value = `1인당 금액`
  perPersonRow.getCell(1).font = { bold: true }
  perPersonRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
  perPersonRow.getCell(8).value = opts.total_people > 0
    ? { formula: `H${rowIndex - 1}/${opts.total_people}` }
    : 0
  perPersonRow.getCell(8).numFmt = '#,##0'
  perPersonRow.getCell(8).font = { bold: true }
  perPersonRow.height = 18
  perPersonRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum <= 8) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEEFF' } }
      applyBorder(cell)
    }
  })

  return workbook
}

export async function generateFilledQuoteTemplate(
  opts: TemplateOptions,
  draft: { itinerary: ItineraryDay[]; pricing: PricingData },
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Incentive Quote Platform'

  // ── 시트 1: 일정표 ──────────────────────────────────────────
  const scheduleSheet = workbook.addWorksheet('일정표')
  scheduleSheet.views = [{ showGridLines: false }]
  scheduleSheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(scheduleSheet as any).pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
  scheduleSheet.columns = [
    { key: 'day', width: 10 },
    { key: 'area', width: 13 },
    { key: 'transport', width: 10 },
    { key: 'time', width: 7 },
    { key: 'itinerary', width: 60 },
    { key: 'meal', width: 10 },
  ]

  // 기본 정보 섹션
  const scheduleDataStartRow = addInfoSection(workbook, scheduleSheet, 6, opts)

  // 헤더 행
  const scheduleHeaders = ['날짜', '지역', '교통편', '시간', '일정', '식사']
  const headerRow = scheduleSheet.getRow(scheduleDataStartRow)
  scheduleHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLACK } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    applyBlackBorder(cell)
  })
  headerRow.height = 18

  // 일 단위 외곽 테두리 적용 (검정 medium)
  const applyDayOuterBorder = (startRow: number, endRow: number) => {
    const black = { style: 'thin' as const, color: { argb: 'FF000000' } }
    for (let r = startRow; r <= endRow; r++) {
      for (let c = 1; c <= 6; c++) {
        const cell = scheduleSheet.getCell(r, c)
        cell.border = {
          top: r === startRow ? black : undefined,
          bottom: r === endRow ? black : undefined,
          left: black,
          right: black,
        }
      }
    }
  }

  // draft.itinerary 데이터로 일정 행 채우기
  const MEAL_PREFIX: Record<string, string> = { '조식': '조', '중식': '중', '석식': '석' }
  for (let di = 0; di < draft.itinerary.length; di++) {
    const dayData = draft.itinerary[di]
    const dayLabel = `제${String(dayData.day).padStart(2, '0')}일`
    const meals = dayData.meals ?? {
      조식: { active: true, note: '' },
      중식: { active: true, note: '' },
      석식: { active: true, note: '' },
    }
    let dayStartRow = -1
    let dayEndRow = -1

    // 활성 식사 목록
    const mealTexts = (['조식', '중식', '석식'] as const)
      .filter((m) => meals[m]?.active !== false)
      .map((m) => {
        const note = meals[m]?.note
        return note ? `${MEAL_PREFIX[m]}: ${note}` : MEAL_PREFIX[m]
      })
    let mealIdx = 0

    // 일정 행 — 식사 칼럼을 기존 행에서부터 순서대로 채움
    for (let ri = 0; ri < dayData.rows.length; ri++) {
      const itRow = dayData.rows[ri]
      const row = scheduleSheet.addRow([
        ri === 0 ? dayLabel : '',
        itRow.area,
        itRow.transport,
        itRow.time,
        itRow.content,
        mealIdx < mealTexts.length ? mealTexts[mealIdx++] : '',
      ])
      if (dayStartRow === -1) dayStartRow = row.number
      dayEndRow = row.number
      row.height = 16
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= 6) {
          cell.font = { size: 10 }
          cell.alignment = { vertical: 'middle', wrapText: false, horizontal: colNum === 5 ? 'left' : 'center' }
          applyBorder(cell)
        }
      })
    }

    // 남은 식사가 있으면 빈 행 추가 (호텔 행 전)
    while (mealIdx < mealTexts.length) {
      const row = scheduleSheet.addRow(['', '', '', '', '', mealTexts[mealIdx++]])
      if (dayStartRow === -1) dayStartRow = row.number
      dayEndRow = row.number
      row.height = 14
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= 6) {
          cell.font = { size: 10 }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          applyBorder(cell)
        }
      })
    }

    // overnight 처리 (호텔 행: 여행일정 칼럼만 하이라이트)
    const { overnight } = dayData
    if (overnight.type === 'hotel') {
      const stars = overnight.stars ?? opts.hotel_grade
      const name = overnight.name ?? ''
      const hotelText = `${'⭐'.repeat(stars)}${name ? ` ${name}` : ''} 숙박`
      const hotelRow = scheduleSheet.addRow(['', '', '', '', hotelText, ''])
      if (dayStartRow === -1) dayStartRow = hotelRow.number
      dayEndRow = hotelRow.number
      hotelRow.height = 18
      hotelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= 6) {
          cell.font = { size: 10 }
          if (colNum === 5) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOTEL_BLUE } }
          cell.alignment = { vertical: 'middle', horizontal: colNum === 5 ? 'left' : 'center' }
          applyBorder(cell)
        }
      })
    } else if (overnight.type === 'flight') {
      const flightRow = scheduleSheet.addRow(['', '', '', '', '✈️ 기내 숙박', ''])
      if (dayStartRow === -1) dayStartRow = flightRow.number
      dayEndRow = flightRow.number
      flightRow.height = 18
      flightRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= 6) {
          cell.font = { size: 10 }
          if (colNum === 5) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOTEL_BLUE } }
          cell.alignment = { vertical: 'middle', horizontal: colNum === 5 ? 'left' : 'center' }
          applyBorder(cell)
        }
      })
    }

    if (dayStartRow !== -1 && dayEndRow !== -1) {
      applyDayOuterBorder(dayStartRow, dayEndRow)
    }
  }

  // 일정표 하단: 총액 / 1인당 요약
  const pricingCategories = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
  let pricingGrandTotal = 0
  for (const cat of pricingCategories) {
    for (const r of (draft.pricing[cat] ?? [])) {
      pricingGrandTotal += (r.price ?? 0) * (r.count ?? 0) * (r.quantity ?? 0)
    }
  }

  // 빈 행 하나
  scheduleSheet.addRow([])

  const summaryBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF333333' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF333333' } },
    left: { style: 'thin' as const, color: { argb: 'FF333333' } },
    right: { style: 'thin' as const, color: { argb: 'FF333333' } },
  }

  const totalRowNum = scheduleSheet.rowCount + 1
  scheduleSheet.addRow(['총 합계', '', '', '', pricingGrandTotal > 0 ? pricingGrandTotal : '', ''])
  scheduleSheet.mergeCells(`A${totalRowNum}:D${totalRowNum}`)
  scheduleSheet.mergeCells(`E${totalRowNum}:F${totalRowNum}`)
  scheduleSheet.getRow(totalRowNum).height = 25
  const totalLabelCell = scheduleSheet.getCell(`A${totalRowNum}`)
  totalLabelCell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  totalLabelCell.alignment = { vertical: 'middle', horizontal: 'center' }
  totalLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } }
  totalLabelCell.border = summaryBorder
  const totalValueCell = scheduleSheet.getCell(`E${totalRowNum}`)
  totalValueCell.font = { size: 10, bold: true }
  totalValueCell.numFmt = '#,##0"원"'
  totalValueCell.alignment = { vertical: 'middle', horizontal: 'center' }
  totalValueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_GREEN } }
  totalValueCell.border = summaryBorder

  if (opts.total_people && opts.total_people > 0 && pricingGrandTotal > 0) {
    const perPerson = Math.round(pricingGrandTotal / opts.total_people)
    const ppRowNum = scheduleSheet.rowCount + 1
    scheduleSheet.addRow(['1인당', '', '', '', perPerson, ''])
    scheduleSheet.mergeCells(`A${ppRowNum}:D${ppRowNum}`)
    scheduleSheet.mergeCells(`E${ppRowNum}:F${ppRowNum}`)
    scheduleSheet.getRow(ppRowNum).height = 25
    const ppLabelCell = scheduleSheet.getCell(`A${ppRowNum}`)
    ppLabelCell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    ppLabelCell.alignment = { vertical: 'middle', horizontal: 'center' }
    ppLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF555555' } }
    ppLabelCell.border = summaryBorder
    const ppValueCell = scheduleSheet.getCell(`E${ppRowNum}`)
    ppValueCell.font = { size: 10, bold: true, color: { argb: 'FF0055CC' } }
    ppValueCell.numFmt = '#,##0"원"'
    ppValueCell.alignment = { vertical: 'middle', horizontal: 'center' }
    ppValueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_GREEN } }
    ppValueCell.border = summaryBorder
  }

  // ── 시트 2: 견적서 ──────────────────────────────────────────
  const quoteSheet = workbook.addWorksheet('견적서')
  quoteSheet.views = [{ showGridLines: false }]
  quoteSheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(quoteSheet as any).pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
  quoteSheet.columns = [
    { key: 'category', width: 14 },
    { key: 'date', width: 12 },
    { key: 'detail', width: 40 },
    { key: 'currency', width: 8 },
    { key: 'price', width: 14 },
    { key: 'count', width: 10 },
    { key: 'quantity', width: 10 },
    { key: 'total', width: 14 },
  ]

  // 기본 정보 섹션
  const quoteDataStartRow = addInfoSection(workbook, quoteSheet, 8, opts)

  // 작성 안내 (2행)
  const noteStyle = { font: { italic: true, size: 10, color: { argb: 'FF757575' } }, alignment: { horizontal: 'right' as const } }
  quoteSheet.mergeCells(`A${quoteDataStartRow}:H${quoteDataStartRow}`)
  const noteCell1 = quoteSheet.getCell(`A${quoteDataStartRow}`)
  noteCell1.value = '※ 합계 = 가격 × 횟수/박수 × 인원/수량'
  noteCell1.font = noteStyle.font
  noteCell1.alignment = noteStyle.alignment
  quoteSheet.getRow(quoteDataStartRow).height = 14

  quoteSheet.mergeCells(`A${quoteDataStartRow + 1}:H${quoteDataStartRow + 1}`)
  const noteCell2 = quoteSheet.getCell(`A${quoteDataStartRow + 1}`)
  noteCell2.value = '※ 1인당 견적가는 하단 자동 계산됩니다.'
  noteCell2.font = noteStyle.font
  noteCell2.alignment = noteStyle.alignment
  quoteSheet.getRow(quoteDataStartRow + 1).height = 14

  // 헤더 행
  const quoteHeaders = ['항목', '날짜', '내역', '통화', '가격', '횟수/박수', '인원/수량', '합계']
  const qHeaderRow = quoteSheet.getRow(quoteDataStartRow + 2)
  quoteHeaders.forEach((h, i) => {
    const cell = qHeaderRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLACK } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    applyBlackBorder(cell)
  })
  qHeaderRow.height = 20

  // 카테고리 단위 외곽 테두리 적용 (일정표와 동일 로직)
  const applyQuoteCategoryBorder = (startRow: number, endRow: number) => {
    const black = { style: 'thin' as const, color: { argb: 'FF000000' } }
    for (let r = startRow; r <= endRow; r++) {
      for (let c = 1; c <= 8; c++) {
        const cell = quoteSheet.getCell(r, c)
        cell.border = {
          top: r === startRow ? black : undefined,
          bottom: r === endRow ? black : undefined,
          left: black,
          right: black,
        }
      }
    }
  }

  // 합계 섹션용: 외곽(D열 좌측·I열 우측·상·하)만 검은색, 내부는 기존 회색 유지
  const applyQuoteSumBorder = (startRow: number, endRow: number) => {
    const black = { style: 'thin' as const, color: { argb: 'FF000000' } }
    for (let r = startRow; r <= endRow; r++) {
      for (let c = 4; c <= 8; c++) {
        const cell = quoteSheet.getCell(r, c)
        const existing = cell.border as ExcelJS.Borders | undefined
        cell.border = {
          top: r === startRow ? black : existing?.top,
          bottom: r === endRow ? black : existing?.bottom,
          left: c === 4 ? black : existing?.left,
          right: c === 8 ? black : existing?.right,
        }
      }
    }
  }

  // draft.pricing 데이터로 카테고리 행 채우기
  const CATEGORIES = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
  let rowIndex = quoteDataStartRow + 3

  const exchangeRates = draft.pricing.exchangeRates ?? {}
  // 통화별 KRW 환산 헬퍼
  const toKrw = (amount: number, currency: string) => {
    if (currency === 'KRW') return amount
    const rate = exchangeRates[currency] ?? 0
    return rate > 0 ? amount * rate : 0
  }

  let grandTotalKrw = 0
  const currencyTotals: Record<string, number> = {}  // 통화별 원본 합계

  for (const cat of CATEGORIES) {
    const rows = draft.pricing[cat] ?? []
    const catStartRow = rowIndex
    let catTotalKrw = 0

    // 카테고리 내 통화 단일 여부 판별
    const catCurrencies = rows.length > 0 ? [...new Set(rows.map(r => r.currency ?? 'KRW'))] : []
    const catCurrency = catCurrencies.length === 1 ? catCurrencies[0] : catCurrencies.length > 1 ? '—' : 'KRW'

    if (rows.length === 0) {
      // 빈 카테고리: 1개 빈 행 유지
      const row = quoteSheet.getRow(rowIndex)
      row.getCell(1).value = cat
      row.getCell(1).font = { bold: true, size: 10 }
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(5).numFmt = '#,##0'
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(8).value = { formula: `E${rowIndex}*F${rowIndex}*G${rowIndex}`, result: 0 }
      row.getCell(8).numFmt = '#,##0'
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' }
      row.height = 22
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= 8) {
          if (!cell.font) cell.font = { size: 10 }
          if (!cell.alignment) cell.alignment = { vertical: 'middle', wrapText: false }
          applyBorder(cell)
        }
      })
      rowIndex++
    } else {
      for (let ri = 0; ri < rows.length; ri++) {
        const pRow = rows[ri]
        const cur = pRow.currency ?? 'KRW'
        const rowTotal = (pRow.price ?? 0) * (pRow.count ?? 1) * (pRow.quantity ?? 1)
        catTotalKrw += toKrw(rowTotal, cur)
        currencyTotals[cur] = (currencyTotals[cur] ?? 0) + rowTotal
        const row = quoteSheet.getRow(rowIndex)
        row.getCell(1).value = ri === 0 ? cat : ''
        row.getCell(1).font = { bold: true, size: 10 }
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
        row.getCell(2).value = pRow.date
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
        row.getCell(3).value = pRow.detail
        row.getCell(3).alignment = { vertical: 'middle', wrapText: false }
        row.getCell(4).value = pRow.currency ?? 'KRW'
        row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' }
        row.getCell(5).value = pRow.price
        row.getCell(5).numFmt = '#,##0'
        row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' }
        row.getCell(6).value = pRow.count
        row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' }
        row.getCell(7).value = pRow.quantity
        row.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' }
        row.getCell(8).value = { formula: `E${rowIndex}*F${rowIndex}*G${rowIndex}`, result: rowTotal }
        row.getCell(8).numFmt = '#,##0'
        row.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' }
        row.height = 22
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (colNum <= 8) {
            if (!cell.font) cell.font = { size: 10 }
            if (!cell.alignment) cell.alignment = { vertical: 'middle' }
            applyBorder(cell)
          }
        })
        rowIndex++
      }
    }

    grandTotalKrw += catTotalKrw

    // 소계 행
    const subtotalRow = quoteSheet.getRow(rowIndex)
    subtotalRow.getCell(1).value = '소계'
    subtotalRow.getCell(1).font = { bold: true, size: 10 }
    subtotalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
    subtotalRow.getCell(4).value = catCurrency
    subtotalRow.getCell(4).font = { bold: true, size: 10 }
    subtotalRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' }
    subtotalRow.getCell(8).value = { formula: `SUM(H${catStartRow}:H${rowIndex - 1})`, result: catTotalKrw }
    subtotalRow.getCell(8).numFmt = '#,##0'
    subtotalRow.getCell(8).font = { bold: true, size: 10 }
    subtotalRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' }
    subtotalRow.height = 22
    subtotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOTEL_BLUE } }
        applyBorder(cell)
      }
    })
    rowIndex++

    applyQuoteCategoryBorder(catStartRow, rowIndex - 1)
  }

  // 빈 행 (카테고리 마지막 행과 합계 섹션 사이) — 셀을 채워야 HTML 미리보기에 렌더링됨
  const blankRow = quoteSheet.getRow(rowIndex)
  blankRow.height = 10
  for (let c = 1; c <= 8; c++) blankRow.getCell(c).value = ''
  rowIndex++

  // 합계 섹션 시작 행 기록 (전체를 하나의 검정 외곽 테두리로 묶기 위해)
  const sumSectionStart = rowIndex

  // 여러 통화일 때: 통화별 소계 + 환율 + KRW 환산 섹션
  const currencyList = Object.entries(currencyTotals).filter(([, v]) => v > 0)
  const isMultiCurrency = currencyList.length > 1 || (currencyList.length === 1 && currencyList[0][0] !== 'KRW')
  if (isMultiCurrency) {
    // 섹션 헤더 (A:C는 빈칸·하이라이트 없음)
    const secHeaderRow = quoteSheet.getRow(rowIndex)
    secHeaderRow.getCell(4).value = '통화'
    secHeaderRow.getCell(5).value = '소계'
    quoteSheet.mergeCells(`F${rowIndex}:G${rowIndex}`)
    secHeaderRow.getCell(6).value = '환율'
    secHeaderRow.getCell(8).value = 'KRW 환산'
    ;[4, 5, 6, 8].forEach(c => {
      secHeaderRow.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      secHeaderRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLACK } }
      secHeaderRow.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }
      applyBlackBorder(secHeaderRow.getCell(c))
    })
    secHeaderRow.height = 22
    rowIndex++

    for (const [cur, amt] of currencyList) {
      const isKRW = cur === 'KRW'
      const rate = isKRW ? 1 : (exchangeRates[cur] ?? 0)
      const converted = rate > 0 ? Math.round(amt * rate) : 0
      const curRow = quoteSheet.getRow(rowIndex)
      curRow.getCell(4).value = cur
      curRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
      curRow.getCell(5).value = amt
      curRow.getCell(5).numFmt = '#,##0'
      curRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' }
      quoteSheet.mergeCells(`F${rowIndex}:G${rowIndex}`)
      curRow.getCell(6).value = rate
      curRow.getCell(6).numFmt = '#,##0.##'
      curRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
      curRow.getCell(8).value = { formula: `E${rowIndex}*F${rowIndex}`, result: converted }
      curRow.getCell(8).numFmt = '#,##0'
      curRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' }
      curRow.height = 22
      for (let c = 4; c <= 8; c++) {
        curRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_GREEN } }
        applyBlackBorder(curRow.getCell(c))
      }
      rowIndex++
    }
  }

  // 총합계 행 (D열부터 시작, A:C 빈칸)
  const totalRow = quoteSheet.getRow(rowIndex)
  quoteSheet.mergeCells(`D${rowIndex}:G${rowIndex}`)
  totalRow.getCell(4).value = '총 합계'
  totalRow.getCell(4).font = { bold: true }
  totalRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' }
  totalRow.getCell(8).value = grandTotalKrw
  totalRow.getCell(8).numFmt = '#,##0'
  totalRow.getCell(8).font = { bold: true }
  totalRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' }
  totalRow.height = 25
  for (let c = 4; c <= 8; c++) {
    totalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_GREEN } }
    applyBlackBorder(totalRow.getCell(c))
  }
  rowIndex++

  const perPerson = opts.total_people > 0 ? Math.round(grandTotalKrw / opts.total_people) : 0

  // 1인당 금액 행 (D열부터 시작, A:C 빈칸)
  const perPersonRow = quoteSheet.getRow(rowIndex)
  quoteSheet.mergeCells(`D${rowIndex}:G${rowIndex}`)
  perPersonRow.getCell(4).value = '1인당 금액'
  perPersonRow.getCell(4).font = { bold: true }
  perPersonRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' }
  perPersonRow.getCell(8).value = opts.total_people > 0
    ? { formula: `H${rowIndex - 1}/${opts.total_people}`, result: perPerson }
    : 0
  perPersonRow.getCell(8).numFmt = '#,##0'
  perPersonRow.getCell(8).font = { bold: true }
  perPersonRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' }
  perPersonRow.height = 25
  for (let c = 4; c <= 8; c++) {
    perPersonRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEEFF' } }
    applyBlackBorder(perPersonRow.getCell(c))
  }

  // 합계 섹션 전체를 하나의 검정 외곽 테두리로 묶음
  applyQuoteSumBorder(sumSectionStart, rowIndex)

  return workbook
}
