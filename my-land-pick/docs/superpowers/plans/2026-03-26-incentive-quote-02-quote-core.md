# 인센티브투어 견적 플랫폼 — Plan 2: Quote Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**전제조건:** Plan 1 완료 (인증, DB 스키마, 관리자 대시보드 동작 확인 후 진행)

**Goal:** 여행사의 견적 요청 생성, 랜드사의 요청 조회 및 엑셀 견적서 제출, 여행사의 견적서 확인까지 핵심 플로우를 완성한다.

**Architecture:** Next.js Server Actions / API Routes로 견적 CRUD. ExcelJS로 서버에서 엑셀 템플릿 생성. Supabase Storage로 파일 저장. 여행사·랜드사 대시보드는 역할별 route group으로 분리.

**Tech Stack:** Next.js 14 App Router, ExcelJS, Supabase Storage, TypeScript

---

## File Map

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── agency/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                 — 여행사 대시보드 (요청 목록)
│   │   │   └── requests/
│   │   │       ├── new/page.tsx         — 견적 요청 생성 폼
│   │   │       └── [id]/page.tsx        — 요청 상세 (랜드사별 견적서 목록)
│   │   └── landco/
│   │       ├── layout.tsx
│   │       ├── page.tsx                 — 랜드사 대시보드 (배정 요청 목록)
│   │       └── requests/
│   │           └── [id]/page.tsx        — 요청 상세 + 견적서 업로드
│   └── api/
│       ├── requests/
│       │   ├── route.ts                 — POST: 견적 요청 생성
│       │   └── [id]/route.ts            — GET: 요청 상세
│       ├── quotes/
│       │   └── route.ts                 — POST: 견적서 업로드
│       └── excel/
│           └── template/route.ts        — GET: 엑셀 템플릿 다운로드
└── lib/
    └── excel/
        └── template.ts                  — ExcelJS 템플릿 생성 로직
```

---

### Task 7: 견적 요청 생성 (여행사)

**Files:**
- Create: `src/app/api/requests/route.ts`
- Create: `src/app/(dashboard)/agency/layout.tsx`
- Create: `src/app/(dashboard)/agency/requests/new/page.tsx`
- Test: `src/__tests__/requests.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/__tests__/requests.test.ts`:
```typescript
import { validateQuoteRequest } from '@/lib/validators'

describe('validateQuoteRequest', () => {
  const validRequest = {
    event_name: '2026 임직원 워크샵',
    destination_country: 'JP',
    destination_city: '오사카',
    depart_date: '2026-06-15',
    return_date: '2026-06-19',
    adults: 20,
    children: 0,
    infants: 0,
    leaders: 2,
    hotel_grade: 4 as const,
    deadline: '2026-05-01',
  }

  it('유효한 요청은 에러 없음', () => {
    expect(validateQuoteRequest(validRequest)).toEqual([])
  })

  it('도착일이 출발일보다 빠르면 에러', () => {
    const errors = validateQuoteRequest({ ...validRequest, return_date: '2026-06-10' })
    expect(errors).toContain('도착일은 출발일 이후여야 합니다.')
  })

  it('마감일이 출발일보다 늦으면 에러', () => {
    const errors = validateQuoteRequest({ ...validRequest, deadline: '2026-07-01' })
    expect(errors).toContain('견적 마감일은 출발일 이전이어야 합니다.')
  })

  it('총 인원이 0이면 에러', () => {
    const errors = validateQuoteRequest({ ...validRequest, adults: 0, leaders: 0 })
    expect(errors).toContain('총 인원은 1명 이상이어야 합니다.')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx jest src/__tests__/requests.test.ts
```

Expected: FAIL — `@/lib/validators` not found

- [ ] **Step 3: 유효성 검사 함수 구현**

`src/lib/validators.ts`:
```typescript
import { calculateTotalPeople } from '@/lib/utils'

interface QuoteRequestInput {
  event_name: string
  destination_country: string
  destination_city: string
  depart_date: string
  return_date: string
  adults: number
  children: number
  infants: number
  leaders: number
  hotel_grade: 3 | 4 | 5
  deadline: string
  notes?: string
}

export function validateQuoteRequest(input: QuoteRequestInput): string[] {
  const errors: string[] = []

  if (new Date(input.return_date) <= new Date(input.depart_date)) {
    errors.push('도착일은 출발일 이후여야 합니다.')
  }

  if (new Date(input.deadline) >= new Date(input.depart_date)) {
    errors.push('견적 마감일은 출발일 이전이어야 합니다.')
  }

  const total = calculateTotalPeople({
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    leaders: input.leaders,
  })
  if (total === 0) {
    errors.push('총 인원은 1명 이상이어야 합니다.')
  }

  return errors
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx jest src/__tests__/requests.test.ts
```

Expected: PASS (4개 test)

- [ ] **Step 5: 견적 요청 생성 API 작성**

`src/app/api/requests/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateQuoteRequest } from '@/lib/validators'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()
  if (profile?.role !== 'agency' || profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const errors = validateQuoteRequest(body)
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 })
  }

  const { data, error } = await supabase.from('quote_requests').insert({
    agency_id: user.id,
    event_name: body.event_name,
    destination_country: body.destination_country,
    destination_city: body.destination_city,
    depart_date: body.depart_date,
    return_date: body.return_date,
    adults: body.adults,
    children: body.children,
    infants: body.infants,
    leaders: body.leaders,
    hotel_grade: body.hotel_grade,
    deadline: body.deadline,
    notes: body.notes ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
```

- [ ] **Step 6: 여행사 레이아웃 작성**

`src/app/(dashboard)/agency/layout.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_name').eq('id', user.id).single()

  if (profile?.role !== 'agency') redirect('/login')
  if (profile?.status !== 'approved') redirect('/pending')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <Link href="/agency" className="text-lg font-bold text-blue-600">견적 플랫폼</Link>
        <span className="text-sm text-gray-600">{profile.company_name} (여행사)</span>
      </header>
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 7: 견적 요청 생성 폼 페이지 작성**

`src/app/(dashboard)/agency/requests/new/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateTotalPeople } from '@/lib/utils'

const HOTEL_GRADES = [3, 4, 5] as const
const COUNTRY_OPTIONS = [
  { code: 'JP', name: '일본' }, { code: 'CN', name: '중국' },
  { code: 'TH', name: '태국' }, { code: 'VN', name: '베트남' },
  { code: 'SG', name: '싱가포르' }, { code: 'ES', name: '스페인' },
  { code: 'IT', name: '이탈리아' }, { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' }, { code: 'US', name: '미국' },
  { code: 'AU', name: '호주' }, { code: 'AE', name: '두바이/UAE' },
  { code: 'HU', name: '헝가리' }, { code: 'AT', name: '오스트리아' },
]

export default function NewRequestPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    event_name: '',
    destination_country: 'JP',
    destination_city: '',
    depart_date: '',
    return_date: '',
    adults: 0,
    children: 0,
    infants: 0,
    leaders: 0,
    hotel_grade: 4 as 3 | 4 | 5,
    deadline: '',
    notes: '',
  })
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const totalPeople = calculateTotalPeople(form)

  function handleChange(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrors([])

    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const json = await res.json()
    if (!res.ok) {
      setErrors(json.errors ?? [json.error])
      setLoading(false)
      return
    }

    router.push('/agency')
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">견적 요청 작성</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700">행사명</label>
          <input
            type="text"
            value={form.event_name}
            onChange={e => handleChange('event_name', e.target.value)}
            required
            placeholder="예: 2026 임직원 해외 워크샵"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">목적지 국가</label>
            <select
              value={form.destination_country}
              onChange={e => handleChange('destination_country', e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COUNTRY_OPTIONS.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">목적지 도시</label>
            <input
              type="text"
              value={form.destination_city}
              onChange={e => handleChange('destination_city', e.target.value)}
              required
              placeholder="예: 오사카"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">출발일</label>
            <input
              type="date"
              value={form.depart_date}
              onChange={e => handleChange('depart_date', e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">도착일</label>
            <input
              type="date"
              value={form.return_date}
              onChange={e => handleChange('return_date', e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            인원 <span className="text-blue-600 font-normal">합계: {totalPeople}명</span>
          </label>
          <div className="grid grid-cols-4 gap-3">
            {(['adults', 'children', 'infants', 'leaders'] as const).map(field => (
              <div key={field}>
                <label className="block text-xs text-gray-500 mb-1">
                  {field === 'adults' ? '성인' : field === 'children' ? '아동' : field === 'infants' ? '영유아' : '인솔자'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={form[field]}
                  onChange={e => handleChange(field, parseInt(e.target.value) || 0)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">호텔 등급</label>
          <div className="flex gap-4">
            {HOTEL_GRADES.map(grade => (
              <label key={grade} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={grade}
                  checked={form.hotel_grade === grade}
                  onChange={() => handleChange('hotel_grade', grade)}
                />
                <span>{grade}성급</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">견적 마감일</label>
          <input
            type="date"
            value={form.deadline}
            onChange={e => handleChange('deadline', e.target.value)}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">기타 요청사항</label>
          <textarea
            value={form.notes}
            onChange={e => handleChange('notes', e.target.value)}
            rows={3}
            placeholder="특별 요청, 프로그램 요구사항 등을 입력해주세요"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {errors.length > 0 && (
          <ul className="text-red-500 text-sm space-y-1">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-md hover:bg-gray-200"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '제출 중...' : '견적 요청 제출'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 8: 수동 테스트**

```bash
npm run dev
```

1. 여행사 계정으로 로그인 → `/agency/requests/new` 접속
2. 폼 작성 → 제출 → `/agency` 리다이렉트 확인
3. Supabase 대시보드 → quote_requests 테이블에서 데이터 확인
4. 유효성: 도착일을 출발일 이전으로 설정 → 에러 메시지 확인

- [ ] **Step 9: Commit**

```bash
git add src/app/(dashboard)/agency/ src/app/api/requests/ src/lib/validators.ts src/__tests__/
git commit -m "feat: add quote request creation flow for agencies"
```

---

### Task 8: 여행사 대시보드 (요청 목록)

**Files:**
- Create: `src/app/(dashboard)/agency/page.tsx`
- Create: `src/app/api/requests/[id]/route.ts`

- [ ] **Step 1: 여행사 대시보드 페이지 작성**

`src/app/(dashboard)/agency/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate, getStatusLabel } from '@/lib/utils'
import type { QuoteRequest } from '@/lib/supabase/types'

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
  finalized: 'bg-purple-100 text-purple-700',
}

export default async function AgencyDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: requests } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('agency_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">내 견적 요청</h1>
        <Link
          href="/agency/requests/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
        >
          + 새 견적 요청
        </Link>
      </div>

      {(!requests || requests.length === 0) ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-2">견적 요청이 없습니다.</p>
          <Link href="/agency/requests/new" className="text-blue-500 hover:underline">
            첫 견적 요청 작성하기
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(requests as QuoteRequest[]).map(req => (
            <Link
              key={req.id}
              href={`/agency/requests/${req.id}`}
              className="block bg-white p-5 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{req.event_name}</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    {req.destination_city} ({req.destination_country}) ·
                    {formatDate(req.depart_date)} ~ {formatDate(req.return_date)} ·
                    {req.hotel_grade}성급
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    마감: {formatDate(req.deadline)}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[req.status]}`}>
                  {getStatusLabel(req.status)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 요청 상세 조회 API 작성**

`src/app/api/requests/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: request, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 견적서 목록 (같은 request_id, 랜드사별로 최신 버전)
  const { data: quotes } = await supabase
    .from('quotes')
    .select('*, profiles!quotes_landco_id_fkey(company_name)')
    .eq('request_id', params.id)
    .order('version', { ascending: false })

  return NextResponse.json({ request, quotes: quotes ?? [] })
}
```

- [ ] **Step 3: 수동 테스트**

```bash
npm run dev
```

1. 여행사 로그인 → `/agency` 에서 견적 요청 목록 확인
2. 요청 카드 클릭 → `/agency/requests/[id]` 이동 확인 (아직 빈 페이지)
3. 상태 배지 색상 확인

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/agency/page.tsx src/app/api/requests/
git commit -m "feat: add agency dashboard with quote request list"
```

---

### Task 9: 엑셀 템플릿 생성 (ExcelJS)

**Files:**
- Create: `src/lib/excel/template.ts`
- Create: `src/app/api/excel/template/route.ts`
- Test: `src/__tests__/excel.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/__tests__/excel.test.ts`:
```typescript
import { generateQuoteTemplate } from '@/lib/excel/template'

describe('generateQuoteTemplate', () => {
  it('워크북에 일정표와 견적서 시트가 있어야 함', async () => {
    const workbook = await generateQuoteTemplate({
      event_name: '테스트 행사',
      destination: '일본 오사카',
      depart_date: '2026-06-15',
      return_date: '2026-06-19',
      total_people: 22,
      hotel_grade: 4,
    })
    const sheetNames = workbook.worksheets.map(s => s.name)
    expect(sheetNames).toContain('일정표')
    expect(sheetNames).toContain('견적서')
  })

  it('견적서 시트에 필수 컬럼 헤더가 있어야 함', async () => {
    const workbook = await generateQuoteTemplate({
      event_name: '테스트',
      destination: '태국',
      depart_date: '2026-07-01',
      return_date: '2026-07-05',
      total_people: 10,
      hotel_grade: 5,
    })
    const sheet = workbook.getWorksheet('견적서')!
    const headers = sheet.getRow(3).values as string[]
    expect(headers).toContain('항목')
    expect(headers).toContain('합계')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx jest src/__tests__/excel.test.ts
```

Expected: FAIL — `@/lib/excel/template` not found

- [ ] **Step 3: 엑셀 템플릿 생성 함수 구현**

`src/lib/excel/template.ts`:
```typescript
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

  // 예시 일정 행 (Day 1 ~ Day 5, 실제 작성은 랜드사가)
  const days = Math.ceil(
    (new Date(opts.return_date).getTime() - new Date(opts.depart_date).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1

  for (let d = 1; d <= days; d++) {
    // 일정 행
    const row = scheduleSheet.addRow([`제${String(d).padStart(2, '0')}일`, '', '', '', '', ''])
    row.height = 20
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      applyBorder(cell)
    })

    // 호텔 행 (별도 색상)
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
  const quoteHeaders = ['항목', '날짜', '세부내역', '가격(원)', '횟수', '인원/수량', '합계(원)', '기타']
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
    row.getCell(4).numFmt = '#,##0'  // 가격
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

  // 빈 행 3개 추가 (자유 입력용)
  for (let i = 0; i < 3; i++) {
    const row = quoteSheet.getRow(rowIndex)
    row.height = 20
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) applyBorder(cell)
    })
    // 합계 수식
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
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx jest src/__tests__/excel.test.ts
```

Expected: PASS

- [ ] **Step 5: 엑셀 템플릿 다운로드 API 작성**

`src/app/api/excel/template/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const { data: qr } = await supabase
    .from('quote_requests').select('*').eq('id', requestId).single()
  if (!qr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const workbook = await generateQuoteTemplate({
    event_name: qr.event_name,
    destination: `${qr.destination_city} (${qr.destination_country})`,
    depart_date: qr.depart_date,
    return_date: qr.return_date,
    total_people: calculateTotalPeople({
      adults: qr.adults, children: qr.children,
      infants: qr.infants, leaders: qr.leaders,
    }),
    hotel_grade: qr.hotel_grade,
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = encodeURIComponent(`견적서_${qr.event_name}.xlsx`)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
    },
  })
}
```

- [ ] **Step 6: 수동 테스트**

```bash
npm run dev
```

1. 브라우저에서 직접 접근:
   `http://localhost:3000/api/excel/template?requestId=<실제_request_id>`
2. 엑셀 파일 다운로드 확인
3. 파일 열어서 일정표/견적서 시트 확인
4. 견적서 시트: G 컬럼 합계 수식 동작 확인, 1인당 견적가 자동 계산 확인

- [ ] **Step 7: Commit**

```bash
git add src/lib/excel/ src/app/api/excel/ src/__tests__/excel.test.ts
git commit -m "feat: add Excel template generation with schedule and quote sheets"
```

---

### Task 10: 랜드사 대시보드 & 견적서 업로드

**Files:**
- Create: `src/app/(dashboard)/landco/layout.tsx`
- Create: `src/app/(dashboard)/landco/page.tsx`
- Create: `src/app/(dashboard)/landco/requests/[id]/page.tsx`
- Create: `src/app/api/quotes/route.ts`

- [ ] **Step 1: 견적서 업로드 API 작성**

`src/app/api/quotes/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()
  if (profile?.role !== 'landco' || profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const requestId = formData.get('requestId') as string

  if (!file || !requestId) {
    return NextResponse.json({ error: 'file and requestId required' }, { status: 400 })
  }

  if (!file.name.endsWith('.xlsx')) {
    return NextResponse.json({ error: '.xlsx 파일만 업로드 가능합니다.' }, { status: 400 })
  }

  // 기존 버전 조회 (새 버전 번호 계산)
  const { data: existing } = await supabase
    .from('quotes')
    .select('version')
    .eq('request_id', requestId)
    .eq('landco_id', user.id)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1

  // Supabase Storage 업로드
  const filePath = `${requestId}/${user.id}/v${nextVersion}_${Date.now()}.xlsx`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('quotes')
    .upload(filePath, new Uint8Array(arrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // signed URL 생성 (1년 유효)
  const { data: urlData } = await supabase.storage
    .from('quotes')
    .createSignedUrl(filePath, 60 * 60 * 24 * 365)

  // DB 저장
  const { data, error } = await supabase.from('quotes').insert({
    request_id: requestId,
    landco_id: user.id,
    version: nextVersion,
    file_url: urlData?.signedUrl ?? filePath,
    file_name: file.name,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // quote_requests 상태를 in_progress로 업데이트
  await supabase
    .from('quote_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)
    .eq('status', 'open')

  return NextResponse.json({ data }, { status: 201 })
}
```

- [ ] **Step 2: 랜드사 레이아웃 작성**

`src/app/(dashboard)/landco/layout.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LandcoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_name').eq('id', user.id).single()

  if (profile?.role !== 'landco') redirect('/login')
  if (profile?.status !== 'approved') redirect('/pending')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <Link href="/landco" className="text-lg font-bold text-blue-600">견적 플랫폼</Link>
        <span className="text-sm text-gray-600">{profile.company_name} (랜드사)</span>
      </header>
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: 랜드사 대시보드 작성**

`src/app/(dashboard)/landco/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate, getStatusLabel } from '@/lib/utils'
import type { QuoteRequest } from '@/lib/supabase/types'

export default async function LancdoDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('country_codes').eq('id', user!.id).single()

  const countryCodes = profile?.country_codes ?? []

  const { data: requests } = await supabase
    .from('quote_requests')
    .select('*')
    .in('destination_country', countryCodes.length > 0 ? countryCodes : ['__none__'])
    .in('status', ['open', 'in_progress'])
    .order('deadline', { ascending: true })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">견적 요청 목록</h1>
      <p className="text-gray-500 text-sm mb-6">
        담당 국가: {countryCodes.length > 0 ? countryCodes.join(', ') : '미지정'}
      </p>

      {(!requests || requests.length === 0) ? (
        <div className="text-center py-20 text-gray-400">
          <p>현재 접수된 견적 요청이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(requests as QuoteRequest[]).map(req => {
            const today = new Date()
            const deadline = new Date(req.deadline)
            const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

            return (
              <Link
                key={req.id}
                href={`/landco/requests/${req.id}`}
                className="block bg-white p-5 rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-lg">{req.event_name}</h2>
                    <p className="text-gray-500 text-sm mt-1">
                      {req.destination_city} ({req.destination_country}) ·
                      {formatDate(req.depart_date)} ~ {formatDate(req.return_date)} ·
                      {req.hotel_grade}성급
                    </p>
                    <p className={`text-xs mt-1 font-medium ${daysLeft <= 3 ? 'text-red-500' : 'text-gray-400'}`}>
                      마감: {formatDate(req.deadline)} {daysLeft > 0 ? `(D-${daysLeft})` : '(마감)'}
                    </p>
                  </div>
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                    {getStatusLabel(req.status)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 랜드사 요청 상세 + 업로드 페이지 작성**

`src/app/(dashboard)/landco/requests/[id]/page.tsx`:
```tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDate, calculateTotalPeople, hotelGradeLabel } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'

export default function LandcoRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [myQuotes, setMyQuotes] = useState<Quote[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/requests/${id}`)
      const json = await res.json()
      setRequest(json.request)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('*')
          .eq('request_id', id)
          .eq('landco_id', user.id)
          .order('version', { ascending: false })
        setMyQuotes(quotes ?? [])
      }
    }
    load()
  }, [id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('requestId', id)

    const res = await fetch('/api/quotes', { method: 'POST', body: formData })
    const json = await res.json()

    if (!res.ok) {
      setUploadError(json.error)
    } else {
      setMyQuotes(prev => [json.data, ...prev])
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDownloadTemplate() {
    window.location.href = `/api/excel/template?requestId=${id}`
  }

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const total = calculateTotalPeople(request)

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{request.event_name}</h1>
      <p className="text-gray-500 text-sm mb-6">
        {request.destination_city} ({request.destination_country}) ·
        {formatDate(request.depart_date)} ~ {formatDate(request.return_date)} ·
        총 {total}명 · {hotelGradeLabel(request.hotel_grade)}
      </p>

      {request.notes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <p className="text-sm font-medium text-yellow-800 mb-1">요청사항</p>
          <p className="text-sm text-yellow-700">{request.notes}</p>
        </div>
      )}

      {/* 견적서 제출 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">견적서 제출</h2>
        <div className="flex gap-3 mb-4">
          <button
            onClick={handleDownloadTemplate}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 text-sm"
          >
            템플릿 다운로드 (.xlsx)
          </button>
          <label className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? '업로드 중...' : '견적서 업로드 (.xlsx)'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>
        {uploadError && <p className="text-red-500 text-sm">{uploadError}</p>}
        <p className="text-xs text-gray-400">
          * 템플릿을 다운로드하여 작성 후 업로드해주세요. .xlsx 파일만 허용됩니다.
        </p>
      </div>

      {/* 제출 이력 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="font-semibold text-lg mb-4">
          제출 이력 <span className="text-gray-400 font-normal text-sm">({myQuotes.length}개 버전)</span>
        </h2>
        {myQuotes.length === 0 ? (
          <p className="text-gray-400 text-sm">아직 제출된 견적서가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {myQuotes.map(q => (
              <div key={q.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <span className="font-medium text-sm">v{q.version}</span>
                  <span className="text-gray-500 text-sm ml-2">{q.file_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{new Date(q.submitted_at).toLocaleString('ko-KR')}</span>
                  <a
                    href={q.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-sm hover:underline"
                  >
                    다운로드
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 수동 테스트**

```bash
npm run dev
```

1. 랜드사 계정으로 로그인 → `/landco` 대시보드에서 배정된 국가 요청 목록 확인
2. 요청 클릭 → 상세 페이지 진입
3. "템플릿 다운로드" 클릭 → 엑셀 파일 다운로드 확인
4. 다운로드된 엑셀 작성 후 "견적서 업로드" 클릭
5. 제출 이력에 v1 항목 표시 확인
6. 한 번 더 업로드 → v2 표시 확인
7. Supabase Storage → quotes 버킷에 파일 존재 확인

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/landco/ src/app/api/quotes/
git commit -m "feat: add landco dashboard with request view and quote upload"
```

---

### Task 11: 여행사 요청 상세 (랜드사별 견적서 확인)

**Files:**
- Create: `src/app/(dashboard)/agency/requests/[id]/page.tsx`

- [ ] **Step 1: 여행사 요청 상세 페이지 작성**

`src/app/(dashboard)/agency/requests/[id]/page.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatDate, calculateTotalPeople, hotelGradeLabel } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'
import { createClient } from '@/lib/supabase/client'

interface QuoteWithLandco extends Quote {
  profiles: { company_name: string }
}

interface GroupedQuotes {
  [landcoId: string]: {
    company_name: string
    quotes: Quote[]
  }
}

export default function AgencyRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [grouped, setGrouped] = useState<GroupedQuotes>({})

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/requests/${id}`)
      const json = await res.json()
      setRequest(json.request)

      // 랜드사별로 그룹핑
      const quotes: QuoteWithLandco[] = json.quotes
      const groups: GroupedQuotes = {}
      quotes.forEach(q => {
        if (!groups[q.landco_id]) {
          groups[q.landco_id] = {
            company_name: q.profiles?.company_name ?? '알 수 없음',
            quotes: [],
          }
        }
        groups[q.landco_id].quotes.push(q)
      })
      setGrouped(groups)
    }
    load()
  }, [id])

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const total = calculateTotalPeople(request)
  const landcoCount = Object.keys(grouped).length

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{request.event_name}</h1>
      <p className="text-gray-500 text-sm mb-1">
        {request.destination_city} ({request.destination_country}) ·
        {formatDate(request.depart_date)} ~ {formatDate(request.return_date)} ·
        총 {total}명 · {hotelGradeLabel(request.hotel_grade)}
      </p>
      <p className="text-gray-400 text-xs mb-6">견적 마감: {formatDate(request.deadline)}</p>

      <h2 className="text-lg font-semibold mb-4">
        랜드사 견적서
        <span className="text-gray-400 font-normal text-sm ml-2">{landcoCount}개 랜드사 제출</span>
      </h2>

      {landcoCount === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-lg shadow-sm">
          아직 제출된 견적서가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([landcoId, { company_name, quotes }]) => (
            <div key={landcoId} className="bg-white rounded-lg shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{company_name}</h3>
                <span className="text-xs text-gray-400">{quotes.length}개 버전</span>
              </div>
              <div className="space-y-2">
                {quotes
                  .sort((a, b) => b.version - a.version)
                  .map(q => (
                    <div key={q.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">
                          v{q.version}
                        </span>
                        <span className="text-sm text-gray-600">{q.file_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {new Date(q.submitted_at).toLocaleString('ko-KR')}
                        </span>
                        <a
                          href={q.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 text-sm hover:underline"
                        >
                          다운로드
                        </a>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 수동 테스트**

```bash
npm run dev
```

1. 여행사 로그인 → `/agency` → 요청 클릭
2. 랜드사들이 제출한 견적서가 랜드사별로 그룹핑되어 표시 확인
3. 버전별 목록 (v1, v2…) 확인
4. 다운로드 링크 클릭 → 엑셀 파일 다운로드 확인

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/agency/requests/
git commit -m "feat: add agency request detail with grouped quote views by landco"
```

---

## Plan 2 완료 체크리스트

- [ ] `npx jest` 모든 테스트 통과
- [ ] 견적 요청 생성 → DB 저장 확인
- [ ] 엑셀 템플릿 다운로드 → 일정표/견적서 2시트 확인
- [ ] 랜드사 견적서 업로드 → Storage 저장, 버전 관리 확인
- [ ] 여행사 요청 상세에서 랜드사별 견적서 목록 확인

> **다음**: `2026-03-26-incentive-quote-03-collaboration.md` 로 진행
