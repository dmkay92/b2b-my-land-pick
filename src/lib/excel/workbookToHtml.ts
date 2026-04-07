import ExcelJS from 'exceljs'

function borderSideCss(side?: ExcelJS.Border): string {
  if (!side) return 'none'
  const w = side.style === 'medium' ? '2px' : side.style === 'thick' ? '3px' : '1px'
  const color = side.color?.argb ? argbToCss(side.color.argb) ?? '#000000' : '#cccccc'
  return `${w} solid ${color}`
}

function argbToCss(argb?: string): string | null {
  if (!argb || argb.length < 6) return null
  const hex = argb.length === 8 ? argb.slice(2) : argb
  return `#${hex}`
}

export function workbookToHtml(workbook: ExcelJS.Workbook): Record<string, string> {
  const result: Record<string, string> = {}

  workbook.eachSheet(sheet => {
    const colWidths: number[] = []
    sheet.columns.forEach((col, i) => { colWidths[i] = col.width ?? 12 })

    const merges = new Set<string>()
    const mergeSpans: Record<string, { rowspan: number; colspan: number }> = {}
    if ((sheet as ExcelJS.Worksheet).mergeCells) {
      try {
        const model = (sheet as ExcelJS.Worksheet).model
        if (model?.merges) {
          model.merges.forEach((range: string) => {
            const [tl, br] = range.split(':')
            const ws = sheet as ExcelJS.Worksheet
            const tlCell = ws.getCell(tl)
            const brCell = ws.getCell(br)
            const tlRow = Number(tlCell.row)
            const brRow = Number(brCell.row)
            const tlCol = ws.getColumn(tlCell.col).number
            const brCol = ws.getColumn(brCell.col).number
            mergeSpans[tl] = {
              rowspan: brRow - tlRow + 1,
              colspan: brCol - tlCol + 1,
            }
            for (let r = tlRow; r <= brRow; r++) {
              for (let c = tlCol; c <= brCol; c++) {
                if (r !== tlRow || c !== tlCol) {
                  merges.add(`${r},${c}`)
                }
              }
            }
          })
        }
      } catch {}
    }

    let html = `<table style="border-collapse:collapse;font-family:sans-serif;font-size:12px;">`
    html += `<colgroup>`
    colWidths.forEach(w => { html += `<col style="width:${w * 7}px">` })
    html += `</colgroup>`

    sheet.eachRow((row, rowNum) => {
      html += `<tr>`
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const key = `${rowNum},${colNum}`
        if (merges.has(key)) return

        const span = mergeSpans[`${(sheet as ExcelJS.Worksheet).getCell(rowNum, colNum).address}`]
        const rowspanAttr = span && span.rowspan > 1 ? ` rowspan="${span.rowspan}"` : ''
        const colspanAttr = span && span.colspan > 1 ? ` colspan="${span.colspan}"` : ''

        const b = cell.border as { top?: ExcelJS.Border; right?: ExcelJS.Border; bottom?: ExcelJS.Border; left?: ExcelJS.Border } | undefined
        const styles: string[] = [
          'padding:4px 8px',
          `border-top:${borderSideCss(b?.top)}`,
          `border-right:${borderSideCss(b?.right)}`,
          `border-bottom:${borderSideCss(b?.bottom)}`,
          `border-left:${borderSideCss(b?.left)}`,
          'white-space:nowrap',
          'vertical-align:middle',
        ]

        const fill = cell.fill as ExcelJS.FillPattern | undefined
        const bgArgb = fill?.type === 'pattern' ? (fill.fgColor?.argb ?? fill.bgColor?.argb) : undefined
        const bg = bgArgb ? argbToCss(bgArgb) : null
        if (bg) styles.push(`background-color:${bg}`)

        const font = cell.font
        if (font?.bold) styles.push('font-weight:bold')
        const fgArgb = font?.color?.argb
        const fg = fgArgb ? argbToCss(fgArgb) : null
        if (fg) styles.push(`color:${fg}`)

        const align = (cell.alignment?.horizontal ?? 'left') === 'right' ? 'right'
          : (cell.alignment?.horizontal ?? 'left') === 'center' ? 'center' : 'left'
        styles.push(`text-align:${align}`)

        const tag = 'td'
        const rawVal = (typeof cell.value === 'object' && cell.value !== null && 'result' in (cell.value as object))
          ? (cell.value as { result: unknown }).result
          : cell.value
        const numFmt = cell.numFmt as string | undefined
        const isNumFmt = !!(numFmt && numFmt.includes('#,##0'))
        const val = rawVal === null || rawVal === undefined
          ? ''
          : isNumFmt
            ? (typeof rawVal === 'number' ? rawVal.toLocaleString('ko-KR') : '0')
            : (cell.text || (typeof rawVal === 'object' ? '' : String(rawVal)))

        html += `<${tag}${rowspanAttr}${colspanAttr} style="${styles.join(';')}">${val}</${tag}>`
      })
      html += `</tr>`
    })

    html += `</table>`
    result[sheet.name] = html
  })

  return result
}
