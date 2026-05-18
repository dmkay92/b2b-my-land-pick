import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

// Turbopack UTF-8 crash workaround: load prompt from external file
const SYSTEM_PROMPT = readFileSync(join(process.cwd(), 'src/lib/prompts/parse-excel.txt'), 'utf-8')

function formatCellValue(cell: ExcelJS.Cell): string {
  const raw = cell.value
  // ExcelJS time: Date object or serial number for time-only cells
  if (raw instanceof Date) {
    // Use UTC to avoid timezone offset issues (Excel stores times in UTC)
    const h = String(raw.getUTCHours()).padStart(2, '0')
    const m = String(raw.getUTCMinutes()).padStart(2, '0')
    // If date part is 1899-12-30 (Excel epoch), it's time-only
    if (raw.getUTCFullYear() <= 1900) return `${h}:${m}`
    // Otherwise it's a date — return YYYY-MM-DD HH:MM
    const dateStr = raw.toISOString().slice(0, 10)
    return h === '00' && m === '00' ? dateStr : `${dateStr} ${h}:${m}`
  }
  if (typeof raw === 'number') {
    // Check if it looks like a time fraction (0~1)
    if (raw > 0 && raw < 1) {
      const totalMinutes = Math.round(raw * 24 * 60)
      const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
      const m = String(totalMinutes % 60).padStart(2, '0')
      return `${h}:${m}`
    }
    return String(raw)
  }
  try {
    return cell.text?.trim() || String(raw ?? '').trim()
  } catch {
    return ''
  }
}

function extractSheetText(workbook: ExcelJS.Workbook): string {
  const parts: string[] = []
  workbook.eachSheet(sheet => {
    parts.push(`\n=== sheet: ${sheet.name} ===`)
    sheet.eachRow((row, rowNum) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: false }, (cell) => {
        const val = formatCellValue(cell)
        if (val) cells.push(val)
      })
      if (cells.length > 0) parts.push(`R${rowNum}: ${cells.join(' | ')}`)
    })
  })
  return parts.join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const sheetText = extractSheetText(workbook)
  if (sheetText.trim().length < 10) {
    return NextResponse.json({ error: 'Excel file appears empty' }, { status: 400 })
  }

  // Log extracted text length for debugging
  const fs = await import('fs')
  fs.writeFileSync('/tmp/parse-excel-input.txt', sheetText)

  let text: string | null = null
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: sheetText }],
    })
    text = message.content[0].type === 'text' ? message.content[0].text : null
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'AI service error'
    return NextResponse.json({ error: errMsg }, { status: 502 })
  }

  if (!text) {
    return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
  }

  fs.writeFileSync('/tmp/parse-excel-output.txt', text)

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Invalid JSON response' }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      itinerary: parsed.itinerary ?? [],
      pricing: parsed.pricing ?? {},
    })
  } catch {
    // 잘린 JSON 복구 시도: 열린 괄호 닫기
    let fixedJson = jsonMatch[0]
    const openBrackets = (fixedJson.match(/\[/g) || []).length - (fixedJson.match(/\]/g) || []).length
    const openBraces = (fixedJson.match(/\{/g) || []).length - (fixedJson.match(/\}/g) || []).length
    fixedJson += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))
    try {
      const parsed = JSON.parse(fixedJson)
      return NextResponse.json({
        itinerary: parsed.itinerary ?? [],
        pricing: parsed.pricing ?? {},
      })
    } catch {
      return NextResponse.json({ error: 'JSON parse failed' }, { status: 500 })
    }
  }
}
