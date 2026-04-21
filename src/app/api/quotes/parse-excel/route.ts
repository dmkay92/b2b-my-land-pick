import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

function extractSheetText(workbook: ExcelJS.Workbook): string {
  const parts: string[] = []
  workbook.eachSheet(sheet => {
    parts.push(`\n=== 시트: ${sheet.name} ===`)
    sheet.eachRow((row, rowNum) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: false }, (cell) => {
        let val = ''
        try {
          val = cell.text?.trim() || String(cell.value ?? '').trim()
        } catch { val = '' }
        if (val) cells.push(val)
      })
      if (cells.length > 0) parts.push(`행${rowNum}: ${cells.join(' | ')}`)
    })
  })
  return parts.join('\n')
}

const SYSTEM_PROMPT = `당신은 여행사 견적 엑셀 파일을 분석하여 정해진 JSON 스키마로 변환하는 전문가입니다.

## 출력 JSON 스키마

### itinerary: ItineraryDay[]
각 일자별 일정:
{
  "day": 1,           // 일차 번호
  "date": "2026-07-22", // YYYY-MM-DD (없으면 빈 문자열)
  "rows": [           // 해당 일자의 일정 행들
    {
      "area": "오사카",    // 지역 — 같은 일자 내에서 이전 행과 지역이 같으면 빈 문자열 ""로 설정. 지역이 바뀔 때만 값을 넣을 것.
      "transport": "전용버스", // 교통편
      "time": "09:00",      // 시간 (없으면 빈 문자열)
      "content": "오사카성 관광" // 일정 내용
    }
  ],
  "overnight": {
    "type": "hotel",    // "hotel" | "flight" | "none"
    "stars": 4,         // 3 | 4 | 5 (호텔인 경우)
    "name": "힐튼 오사카"  // 호텔명 (있으면)
  },
  "meals": {
    "조식": { "active": true, "note": "호텔식" },
    "중식": { "active": true, "note": "현지식" },
    "석식": { "active": true, "note": "특식" }
  }
}

### pricing: PricingData
카테고리별 비용 내역:
{
  "호텔": [{ "date": "Day1-3", "detail": "힐튼 오사카 4성급", "price": 150000, "count": 3, "quantity": 7, "currency": "KRW" }],
  "차량": [{ "date": "전일정", "detail": "45인승 버스", "price": 800000, "count": 4, "quantity": 1 }],
  "식사": [{ "date": "Day1", "detail": "현지식 중식", "price": 15000, "count": 1, "quantity": 7 }],
  "입장료": [{ "date": "Day2", "detail": "유니버셜 스튜디오", "price": 8500, "count": 1, "quantity": 7 }],
  "가이드비용": [{ "date": "전일정", "detail": "한국어 가이드", "price": 200000, "count": 4, "quantity": 1 }],
  "기타": []
}

각 PricingRow: { date: string, detail: string, price: number, count: number, quantity: number, currency?: string }
- price: 단가 (숫자만)
- count: 횟수/박수
- quantity: 인원/수량
- currency: 기본 "KRW", 외화면 "JPY", "USD" 등

## 규칙
1. 엑셀에서 일정표와 견적서 정보를 모두 추출하세요
2. 일정이 없으면 itinerary는 빈 배열
3. 견적이 없으면 pricing의 각 카테고리는 빈 배열
4. 숫자에서 쉼표, 원, ￥ 등 통화 기호는 제거하고 숫자만 추출
5. 호텔 성급은 3, 4, 5 중 하나. 판단 어려우면 4로 설정
6. 식사 정보가 없으면 모든 meals를 active: true, note: "" 로 설정
7. 반드시 유효한 JSON만 출력하세요. 다른 텍스트 없이 JSON만.

## 출력 형식
{ "itinerary": [...], "pricing": { "호텔": [...], "차량": [...], "식사": [...], "입장료": [...], "가이드비용": [...], "기타": [] } }`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Read Excel
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const sheetText = extractSheetText(workbook)
  if (sheetText.trim().length < 10) {
    return NextResponse.json({ error: 'Excel file appears empty' }, { status: 400 })
  }

  // Call Gemini (with fallback model)
  const MODELS = ['gemini-3.0-flash', 'gemini-3.1-flash-lite', 'gemini-2.0-flash']
  let text: string | null = null
  let lastError = ''
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const result = await model.generateContent([
        SYSTEM_PROMPT,
        `\n\n## 엑셀 내용:\n${sheetText}`,
      ])
      text = result.response.text()
      break
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : 'AI 서비스 연결 실패'
    }
  }
  if (!text) {
    return NextResponse.json({ error: `AI 분석 실패: ${lastError}. 잠시 후 다시 시도해주세요.` }, { status: 502 })
  }

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'AI가 유효한 JSON을 반환하지 않았습니다.' }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      itinerary: parsed.itinerary ?? [],
      pricing: parsed.pricing ?? { 호텔: [], 차량: [], 식사: [], 입장료: [], 가이드비용: [], 기타: [] },
    })
  } catch {
    return NextResponse.json({ error: 'JSON 파싱 실패' }, { status: 500 })
  }
}
