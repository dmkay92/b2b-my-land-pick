import ExcelJS from 'exceljs'

export interface QuotePricing {
  total: number | null
  per_person: number | null
}

function cellToNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'result' in value) {
    const r = (value as { result: ExcelJS.CellValue }).result
    return typeof r === 'number' ? r : null
  }
  return null
}

export async function extractQuotePricing(fileUrl: string): Promise<QuotePricing> {
  try {
    const res = await fetch(fileUrl)
    if (!res.ok) return { total: null, per_person: null }
    const buffer = await res.arrayBuffer()

    const workbook = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(buffer) as any)

    const sheet = workbook.getWorksheet('견적서')
    if (!sheet) return { total: null, per_person: null }

    let total: number | null = null
    let per_person: number | null = null

    sheet.eachRow(row => {
      // 단일 통화: 라벨이 A열(1)에 위치
      // 다중 통화: 라벨이 D열(4)에 위치
      const label = String(row.getCell(1).value ?? row.getCell(4).value ?? '').trim()
      const colH = row.getCell(8).value
      const num = cellToNumber(colH)
      if (label.includes('총 합계')) total = num
      if (label.includes('1인당')) per_person = num
    })

    return { total, per_person }
  } catch {
    return { total: null, per_person: null }
  }
}
