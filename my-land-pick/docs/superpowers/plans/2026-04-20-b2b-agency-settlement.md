# B2B 대리점 정산 모델 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대리점(agency)이 자유 마크업을 설정하고, 플랫폼이 마진을 자동 적용하며, 견적서를 웹 UI로 전환하는 B2B 정산 시스템 구축

**Architecture:** DB에 `agency_markups`, `quote_settlements`, `platform_settings` 테이블 추가. 견적 미리보기를 엑셀 기반에서 JSON→React 렌더링으로 전환. 마크업 비례 배분 유틸로 식사 제외 항목에 마크업을 녹임. 견적 선택 시 2단계 팝업으로 마크업 확정 후 정산 데이터 생성.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL), ExcelJS, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-20-b2b-agency-settlement-design.md`

**Important:** This is a Next.js 16 project — read `node_modules/next/dist/docs/` before writing new route handlers or pages if unsure about API conventions.

---

## File Structure

### New Files
- `supabase/migrations/20260420000000_b2b_settlement.sql` — DB migration for 3 new tables + RLS
- `src/lib/pricing/markup.ts` — 마크업 비례 배분 + 플랫폼 마진 적용 유틸
- `src/lib/pricing/__tests__/markup.test.ts` — 마크업 유틸 테스트
- `src/components/quote-view/ItineraryView.tsx` — 일정표 웹 렌더링 컴포넌트
- `src/components/quote-view/PricingView.tsx` — 견적서 웹 렌더링 컴포넌트
- `src/components/quote-view/QuoteSummaryBar.tsx` — 총액/1인당 금액 상단 바
- `src/components/MarkupInput.tsx` — 여행사 수익설정 양방향 입력 컴포넌트
- `src/components/ConfirmMarkupModal.tsx` — 견적 선택 시 2단계 마크업 확정 모달
- `src/app/(dashboard)/agency/quotes/[quoteId]/page.tsx` — 견적 상세 웹 UI 페이지
- `src/app/api/agency-markups/route.ts` — 임시 마크업 CRUD API
- `src/app/api/quotes/[id]/download/route.ts` — 마크업 반영 엑셀 다운로드 API
- `src/app/api/platform-settings/route.ts` — 플랫폼 설정 조회 API

### Modified Files
- `src/lib/supabase/types.ts` — 신규 타입 추가 (AgencyMarkup, QuoteSettlement, PlatformSetting)
- `src/app/(dashboard)/agency/requests/[id]/page.tsx` — 미리보기/다운로드 버튼 변경, 여행사 수익설정 UI 추가, 견적 선택 2단계 팝업
- `src/app/api/quotes/confirm/route.ts` — 정산 데이터(quote_settlements) 생성 로직 추가
- `src/app/api/requests/[id]/route.ts` — agency_markups 데이터 함께 로드, 플랫폼 마진 적용

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260420000000_b2b_settlement.sql`

- [ ] **Step 1: Create migration file**

```sql
-- B2B 대리점 정산 모델: 3개 신규 테이블

-- 1. 플랫폼 설정 (마진율 등)
CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES ('margin_rate', '0.05');

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage platform_settings"
  ON platform_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Authenticated users can read platform_settings"
  ON platform_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 2. 대리점 임시 마크업
CREATE TABLE agency_markups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE NOT NULL,
  agency_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  markup_per_person numeric NOT NULL DEFAULT 0,
  markup_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(quote_id, agency_id)
);

ALTER TABLE agency_markups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency can manage own markups"
  ON agency_markups FOR ALL
  USING (agency_id = (select auth.uid()));

CREATE POLICY "Admin can read all markups"
  ON agency_markups FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- 3. 정산 데이터
CREATE TABLE quote_settlements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL UNIQUE,
  quote_id uuid REFERENCES quotes(id) NOT NULL,
  landco_id uuid REFERENCES profiles(id) NOT NULL,
  agency_id uuid REFERENCES profiles(id) NOT NULL,
  landco_amount numeric NOT NULL,
  platform_margin numeric NOT NULL,
  platform_margin_rate numeric NOT NULL,
  agency_markup numeric NOT NULL,
  total_amount numeric NOT NULL,
  landco_settled boolean DEFAULT false,
  agency_settled boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quote_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency can read own settlements"
  ON quote_settlements FOR SELECT
  USING (agency_id = (select auth.uid()));

CREATE POLICY "Landco can read own settlements"
  ON quote_settlements FOR SELECT
  USING (landco_id = (select auth.uid()));

CREATE POLICY "Admin can manage all settlements"
  ON quote_settlements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Agency can insert settlements on confirm"
  ON quote_settlements FOR INSERT
  WITH CHECK (agency_id = (select auth.uid()));
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Expected: 3 tables created with RLS policies

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260420000000_b2b_settlement.sql
git commit -m "feat: add DB tables for B2B settlement (agency_markups, quote_settlements, platform_settings)"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add new types to types.ts**

Add the following at the end of the file (after the `SignupDraft` interface, line 210):

```typescript
export interface AgencyMarkup {
  id: string
  quote_id: string
  agency_id: string
  markup_per_person: number
  markup_total: number
  created_at: string
  updated_at: string
}

export interface QuoteSettlement {
  id: string
  request_id: string
  quote_id: string
  landco_id: string
  agency_id: string
  landco_amount: number
  platform_margin: number
  platform_margin_rate: number
  agency_markup: number
  total_amount: number
  landco_settled: boolean
  agency_settled: boolean
  created_at: string
}

export interface PlatformSetting {
  key: string
  value: unknown
  updated_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add AgencyMarkup, QuoteSettlement, PlatformSetting types"
```

---

## Task 3: Markup Calculation Utility (TDD)

**Files:**
- Create: `src/lib/pricing/markup.ts`
- Create: `src/lib/pricing/__tests__/markup.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/pricing/__tests__/markup.test.ts`:

```typescript
import {
  applyPlatformMargin,
  distributeMealExcludedMarkup,
  calculatePricingTotals,
} from '../markup'
import type { PricingData } from '@/lib/supabase/types'

const basePricing: PricingData = {
  호텔: [{ date: 'Day1', detail: '호텔A', price: 100000, count: 2, quantity: 1 }],
  차량: [{ date: 'Day1', detail: '버스', price: 50000, count: 1, quantity: 1 }],
  식사: [{ date: 'Day1', detail: '중식', price: 30000, count: 1, quantity: 1 }],
  입장료: [{ date: 'Day1', detail: '입장', price: 10000, count: 1, quantity: 1 }],
  가이드비용: [{ date: 'Day1', detail: '가이드', price: 10000, count: 1, quantity: 1 }],
  기타: [],
}

describe('calculatePricingTotals', () => {
  it('calculates total from all categories', () => {
    const result = calculatePricingTotals(basePricing)
    // 호텔: 100000*2*1=200000, 차량: 50000, 식사: 30000, 입장료: 10000, 가이드: 10000
    expect(result.total).toBe(300000)
    expect(result.categoryTotals['호텔']).toBe(200000)
    expect(result.categoryTotals['식사']).toBe(30000)
  })
})

describe('applyPlatformMargin', () => {
  it('applies margin rate to pricing rows (excluding no categories)', () => {
    const result = applyPlatformMargin(basePricing, 0.05)
    // 호텔 price: 100000 * 1.05 = 105000
    expect(result['호텔'][0].price).toBe(105000)
    expect(result['식사'][0].price).toBe(31500)
    expect(result['차량'][0].price).toBe(52500)
  })
})

describe('distributeMealExcludedMarkup', () => {
  it('distributes markup proportionally excluding 식사', () => {
    const totalMarkup = 100000
    const result = distributeMealExcludedMarkup(basePricing, totalMarkup)

    // 식사 is excluded from distribution
    expect(result['식사'][0].price).toBe(30000) // unchanged

    // Total of non-meal categories: 200000+50000+10000+10000 = 270000
    // 호텔 share: 200000/270000 = 74.07% → markup ~74074
    // After distribution, total should equal original total + markup
    const originalTotal = 300000
    const newTotals = calculatePricingTotals(result)
    expect(newTotals.total).toBe(originalTotal + totalMarkup)
  })

  it('handles zero markup', () => {
    const result = distributeMealExcludedMarkup(basePricing, 0)
    expect(result['호텔'][0].price).toBe(basePricing['호텔'][0].price)
  })

  it('handles rounding - total matches exactly', () => {
    const result = distributeMealExcludedMarkup(basePricing, 33333)
    const newTotals = calculatePricingTotals(result)
    expect(newTotals.total).toBe(300000 + 33333)
  })

  it('handles empty non-meal categories gracefully', () => {
    const emptyPricing: PricingData = {
      호텔: [],
      차량: [],
      식사: [{ date: 'Day1', detail: '중식', price: 30000, count: 1, quantity: 1 }],
      입장료: [],
      가이드비용: [],
      기타: [],
    }
    // When all non-meal categories are empty, markup cannot be distributed
    const result = distributeMealExcludedMarkup(emptyPricing, 10000)
    const totals = calculatePricingTotals(result)
    expect(totals.total).toBe(30000) // unchanged, markup cannot be applied
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/youngjun-hwang/Desktop/Claude/my-land-pick/.worktrees/feature/incentive-quote-mvp && npx jest src/lib/pricing/__tests__/markup.test.ts --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement markup utility**

Create `src/lib/pricing/markup.ts`:

```typescript
import type { PricingData, PricingRow } from '@/lib/supabase/types'

const PRICING_CATEGORIES = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
type PricingCategory = typeof PRICING_CATEGORIES[number]

function rowTotal(row: PricingRow): number {
  return row.price * row.count * row.quantity
}

export function calculatePricingTotals(pricing: PricingData): {
  total: number
  categoryTotals: Record<string, number>
} {
  const categoryTotals: Record<string, number> = {}
  let total = 0
  for (const cat of PRICING_CATEGORIES) {
    const catTotal = pricing[cat].reduce((sum, row) => sum + rowTotal(row), 0)
    categoryTotals[cat] = catTotal
    total += catTotal
  }
  return { total, categoryTotals }
}

export function applyPlatformMargin(pricing: PricingData, marginRate: number): PricingData {
  const result: PricingData = { ...pricing }
  for (const cat of PRICING_CATEGORIES) {
    result[cat] = pricing[cat].map(row => ({
      ...row,
      price: Math.round(row.price * (1 + marginRate)),
    }))
  }
  if (pricing.currencies) result.currencies = { ...pricing.currencies }
  if (pricing.exchangeRates) result.exchangeRates = { ...pricing.exchangeRates }
  return result
}

export function distributeMealExcludedMarkup(
  pricing: PricingData,
  totalMarkup: number,
): PricingData {
  if (totalMarkup === 0) return pricing

  const nonMealCategories = PRICING_CATEGORIES.filter(c => c !== '식사')

  // Calculate total of non-meal row totals
  const nonMealRowTotals: { cat: PricingCategory; rowIdx: number; total: number }[] = []
  let nonMealSum = 0
  for (const cat of nonMealCategories) {
    pricing[cat].forEach((row, rowIdx) => {
      const rt = rowTotal(row)
      if (rt > 0) {
        nonMealRowTotals.push({ cat, rowIdx, total: rt })
        nonMealSum += rt
      }
    })
  }

  // If no non-meal items, cannot distribute
  if (nonMealSum === 0) return pricing

  // Deep clone pricing
  const result: PricingData = {
    호텔: pricing['호텔'].map(r => ({ ...r })),
    차량: pricing['차량'].map(r => ({ ...r })),
    식사: pricing['식사'].map(r => ({ ...r })),
    입장료: pricing['입장료'].map(r => ({ ...r })),
    가이드비용: pricing['가이드비용'].map(r => ({ ...r })),
    기타: pricing['기타'].map(r => ({ ...r })),
  }
  if (pricing.currencies) result.currencies = { ...pricing.currencies }
  if (pricing.exchangeRates) result.exchangeRates = { ...pricing.exchangeRates }

  // Distribute markup proportionally by row total share
  // Each row's markup = totalMarkup * (rowTotal / nonMealSum)
  // To keep it natural, we adjust the price per row:
  //   newPrice = price + (markup_for_this_row / (count * quantity))
  let distributed = 0
  for (let i = 0; i < nonMealRowTotals.length; i++) {
    const { cat, rowIdx, total } = nonMealRowTotals[i]
    const row = result[cat][rowIdx]
    const isLast = i === nonMealRowTotals.length - 1

    const rowMarkup = isLast
      ? totalMarkup - distributed
      : Math.round(totalMarkup * (total / nonMealSum))

    const divisor = row.count * row.quantity
    if (divisor > 0) {
      row.price = row.price + Math.round(rowMarkup / divisor)
      // Adjust rounding: recalculate what we actually distributed
      const actualRowMarkup = rowTotal(row) - total
      distributed += actualRowMarkup
    }
  }

  // Final rounding correction on last item if needed
  const newTotal = calculatePricingTotals(result).total
  const originalTotal = calculatePricingTotals(pricing).total
  const diff = (originalTotal + totalMarkup) - newTotal
  if (diff !== 0 && nonMealRowTotals.length > 0) {
    const last = nonMealRowTotals[nonMealRowTotals.length - 1]
    const lastRow = result[last.cat][last.rowIdx]
    const divisor = lastRow.count * lastRow.quantity
    if (divisor > 0) {
      lastRow.price += Math.round(diff / divisor)
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/youngjun-hwang/Desktop/Claude/my-land-pick/.worktrees/feature/incentive-quote-mvp && npx jest src/lib/pricing/__tests__/markup.test.ts --no-cache`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/markup.ts src/lib/pricing/__tests__/markup.test.ts
git commit -m "feat: add markup calculation utility with TDD (platform margin, meal-excluded distribution)"
```

---

## Task 4: Platform Settings API

**Files:**
- Create: `src/app/api/platform-settings/route.ts`

- [ ] **Step 1: Create platform settings GET API**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings = Object.fromEntries((data ?? []).map(s => [s.key, s.value]))
  return NextResponse.json({ settings })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platform-settings/route.ts
git commit -m "feat: add platform settings API (GET)"
```

---

## Task 5: Agency Markups API

**Files:**
- Create: `src/app/api/agency-markups/route.ts`

- [ ] **Step 1: Create agency markups CRUD API**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  // Get all quotes for this request, then get markups for those quotes
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id')
    .eq('request_id', requestId)

  const quoteIds = (quotes ?? []).map(q => q.id)
  if (quoteIds.length === 0) return NextResponse.json({ markups: [] })

  const { data: markups, error } = await supabase
    .from('agency_markups')
    .select('*')
    .eq('agency_id', user.id)
    .in('quote_id', quoteIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ markups: markups ?? [] })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quoteId, markupPerPerson, markupTotal } = await request.json()
  if (!quoteId) return NextResponse.json({ error: 'quoteId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('agency_markups')
    .upsert({
      quote_id: quoteId,
      agency_id: user.id,
      markup_per_person: markupPerPerson ?? 0,
      markup_total: markupTotal ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'quote_id,agency_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ markup: data })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/agency-markups/route.ts
git commit -m "feat: add agency markups CRUD API (GET by requestId, PUT upsert)"
```

---

## Task 6: Quote Download API with Markup

**Files:**
- Create: `src/app/api/quotes/[id]/download/route.ts`

- [ ] **Step 1: Create download API**

This API generates an Excel file dynamically with markup applied. Before selection: itinerary sheet only + summary row with total/per-person. After selection: itinerary + pricing breakdown sheets.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateFilledQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'
import { applyPlatformMargin, distributeMealExcludedMarkup } from '@/lib/pricing/markup'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: quoteId } = await params

  // Get quote and its request
  const { data: quote } = await supabase
    .from('quotes').select('*').eq('id', quoteId).single()
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: req } = await supabase
    .from('quote_requests').select('*').eq('id', quote.request_id).single()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Get draft data (itinerary + pricing)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Try quote_drafts first, then fall back to stored data
  const { data: draft } = await adminClient
    .from('quote_drafts').select('itinerary, pricing')
    .eq('request_id', quote.request_id).eq('landco_id', quote.landco_id).single()

  if (!draft) return NextResponse.json({ error: 'Draft data not found' }, { status: 404 })

  // Get platform margin rate
  const { data: marginSetting } = await supabase
    .from('platform_settings').select('value').eq('key', 'margin_rate').single()
  const marginRate = marginSetting ? Number(marginSetting.value) : 0.05

  // Check user role
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  const isAgency = profile?.role === 'agency'

  // Get agency markup if exists
  const { data: markup } = await supabase
    .from('agency_markups').select('*')
    .eq('quote_id', quoteId).eq('agency_id', isAgency ? user.id : req.agency_id)
    .maybeSingle()

  // Apply platform margin for agency view
  let pricing = draft.pricing
  if (isAgency) {
    pricing = applyPlatformMargin(pricing, marginRate)
  }

  // Apply agency markup if exists
  if (markup && markup.markup_total > 0) {
    pricing = distributeMealExcludedMarkup(pricing, markup.markup_total)
  }

  // Check if quote is selected (determines whether to include pricing sheet)
  const { data: selection } = await supabase
    .from('quote_selections').select('selected_quote_id')
    .eq('request_id', quote.request_id).maybeSingle()

  const isSelected = selection?.selected_quote_id === quoteId

  // Get landco profile
  const { data: landcoProfile } = await adminClient
    .from('profiles').select('company_name').eq('id', quote.landco_id).single()

  const totalPeople = calculateTotalPeople({
    adults: req.adults, children: req.children,
    infants: req.infants, leaders: req.leaders,
  })

  const workbook = await generateFilledQuoteTemplate(
    {
      event_name: req.event_name,
      destination_country: req.destination_country,
      destination_city: req.destination_city,
      depart_date: req.depart_date,
      return_date: req.return_date,
      total_people: totalPeople,
      adults: req.adults,
      children: req.children,
      infants: req.infants,
      leaders: req.leaders,
      hotel_grade: req.hotel_grade,
      landco_name: landcoProfile?.company_name ?? '',
      flight_schedule: req.flight_schedule,
    },
    { itinerary: draft.itinerary, pricing },
  )

  // If not selected, remove the pricing sheet
  if (!isSelected) {
    const pricingSheet = workbook.getWorksheet('견적서')
    if (pricingSheet) {
      workbook.removeWorksheet(pricingSheet.id)
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = encodeURIComponent(quote.file_name || 'quote.xlsx')

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/quotes/[id]/download/route.ts
git commit -m "feat: add quote download API with dynamic markup application"
```

---

## Task 7: ItineraryView Component

**Files:**
- Create: `src/components/quote-view/ItineraryView.tsx`

- [ ] **Step 1: Create itinerary web rendering component**

This renders the `ItineraryDay[]` JSON as a styled table matching the existing Excel layout.

```tsx
'use client'

import type { ItineraryDay } from '@/lib/supabase/types'

interface Props {
  itinerary: ItineraryDay[]
}

const mealLabel = (meals: ItineraryDay['meals']) => {
  if (!meals) return ''
  const parts: string[] = []
  if (meals['조식']?.active) parts.push(meals['조식'].note ? `조: ${meals['조식'].note}` : '조식')
  if (meals['중식']?.active) parts.push(meals['중식'].note ? `중: ${meals['중식'].note}` : '중식')
  if (meals['석식']?.active) parts.push(meals['석식'].note ? `석: ${meals['석식'].note}` : '석식')
  return parts.join(' / ')
}

const overnightLabel = (overnight: ItineraryDay['overnight']) => {
  if (overnight.type === 'hotel') {
    const stars = overnight.stars ? '★'.repeat(overnight.stars) : ''
    return `${stars} ${overnight.name ?? ''}`.trim()
  }
  if (overnight.type === 'flight') return '기내박'
  return ''
}

export default function ItineraryView({ itinerary }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-900 text-white">
            <th className="border border-gray-300 px-3 py-2 w-16">날짜</th>
            <th className="border border-gray-300 px-3 py-2 w-24">지역</th>
            <th className="border border-gray-300 px-3 py-2 w-24">교통편</th>
            <th className="border border-gray-300 px-3 py-2 w-20">시간</th>
            <th className="border border-gray-300 px-3 py-2">일정</th>
            <th className="border border-gray-300 px-3 py-2 w-32">식사</th>
          </tr>
        </thead>
        <tbody>
          {itinerary.map(day => (
            <>
              {day.rows.map((row, rowIdx) => (
                <tr key={`${day.day}-${rowIdx}`} className="border-b border-gray-200">
                  {rowIdx === 0 && (
                    <td
                      className="border border-gray-300 px-3 py-2 text-center font-medium bg-gray-50"
                      rowSpan={day.rows.length + 1}
                    >
                      Day {day.day}
                      {day.date && (
                        <div className="text-xs text-gray-500 mt-1">{day.date}</div>
                      )}
                    </td>
                  )}
                  <td className="border border-gray-300 px-3 py-2">{row.area}</td>
                  <td className="border border-gray-300 px-3 py-2">{row.transport}</td>
                  <td className="border border-gray-300 px-3 py-2">{row.time}</td>
                  <td className="border border-gray-300 px-3 py-2">{row.content}</td>
                  {rowIdx === 0 && (
                    <td
                      className="border border-gray-300 px-3 py-2 text-xs"
                      rowSpan={day.rows.length + 1}
                    >
                      {mealLabel(day.meals)}
                    </td>
                  )}
                </tr>
              ))}
              {/* Overnight row */}
              <tr className="bg-blue-50">
                <td colSpan={4} className="border border-gray-300 px-3 py-2 text-right text-xs text-gray-600">
                  {overnightLabel(day.overnight) && `숙박: ${overnightLabel(day.overnight)}`}
                </td>
              </tr>
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quote-view/ItineraryView.tsx
git commit -m "feat: add ItineraryView web component for JSON-based itinerary rendering"
```

---

## Task 8: PricingView Component

**Files:**
- Create: `src/components/quote-view/PricingView.tsx`

- [ ] **Step 1: Create pricing web rendering component**

```tsx
'use client'

import type { PricingData, PricingRow } from '@/lib/supabase/types'

interface Props {
  pricing: PricingData
  totalPeople: number
}

const CATEGORIES = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const

function rowTotal(row: PricingRow): number {
  return row.price * row.count * row.quantity
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function PricingView({ pricing, totalPeople }: Props) {
  let grandTotal = 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-900 text-white">
            <th className="border border-gray-300 px-3 py-2 w-24">항목</th>
            <th className="border border-gray-300 px-3 py-2 w-20">날짜</th>
            <th className="border border-gray-300 px-3 py-2">내역</th>
            <th className="border border-gray-300 px-3 py-2 w-16">통화</th>
            <th className="border border-gray-300 px-3 py-2 w-24 text-right">가격</th>
            <th className="border border-gray-300 px-3 py-2 w-16 text-right">횟수</th>
            <th className="border border-gray-300 px-3 py-2 w-16 text-right">수량</th>
            <th className="border border-gray-300 px-3 py-2 w-28 text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(cat => {
            const rows = pricing[cat]
            if (rows.length === 0) return null
            const catTotal = rows.reduce((sum, r) => sum + rowTotal(r), 0)
            grandTotal += catTotal

            return (
              <Fragment key={cat}>
                {rows.map((row, idx) => (
                  <tr key={`${cat}-${idx}`} className="border-b border-gray-200">
                    {idx === 0 && (
                      <td
                        className="border border-gray-300 px-3 py-2 font-medium bg-gray-50"
                        rowSpan={rows.length}
                      >
                        {cat}
                      </td>
                    )}
                    <td className="border border-gray-300 px-3 py-2">{row.date}</td>
                    <td className="border border-gray-300 px-3 py-2">{row.detail}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">
                      {row.currency ?? 'KRW'}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right">
                      {formatNumber(row.price)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{row.count}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{row.quantity}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-medium">
                      {formatNumber(rowTotal(row))}
                    </td>
                  </tr>
                ))}
                <tr className="bg-blue-50">
                  <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right font-medium">
                    {cat} 소계
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold">
                    {formatNumber(catTotal)}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-green-50 font-bold">
            <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right">
              총 합계
            </td>
            <td className="border border-gray-300 px-3 py-2 text-right text-lg">
              {formatNumber(grandTotal)}
            </td>
          </tr>
          {totalPeople > 0 && (
            <tr className="bg-green-50 font-bold">
              <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right">
                1인당
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right text-lg">
                {formatNumber(Math.round(grandTotal / totalPeople))}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  )
}
```

Add missing import at top:

```tsx
import { Fragment } from 'react'
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quote-view/PricingView.tsx
git commit -m "feat: add PricingView web component for JSON-based pricing rendering"
```

---

## Task 9: QuoteSummaryBar Component

**Files:**
- Create: `src/components/quote-view/QuoteSummaryBar.tsx`

- [ ] **Step 1: Create summary bar component**

Shows total and per-person amounts at the top of the quote detail page.

```tsx
'use client'

interface Props {
  total: number
  perPerson: number
  agencyMarkup?: number
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function QuoteSummaryBar({ total, perPerson, agencyMarkup }: Props) {
  return (
    <div className="flex items-center gap-6 bg-white border border-gray-200 rounded-lg px-6 py-4 shadow-sm">
      <div>
        <div className="text-xs text-gray-500">총액</div>
        <div className="text-xl font-bold">{formatNumber(total)}원</div>
      </div>
      <div className="h-8 w-px bg-gray-200" />
      <div>
        <div className="text-xs text-gray-500">1인당</div>
        <div className="text-xl font-bold">{formatNumber(perPerson)}원</div>
      </div>
      {agencyMarkup !== undefined && agencyMarkup > 0 && (
        <>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <div className="text-xs text-gray-500">여행사 수익</div>
            <div className="text-xl font-bold text-blue-600">+{formatNumber(agencyMarkup)}원</div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quote-view/QuoteSummaryBar.tsx
git commit -m "feat: add QuoteSummaryBar component (total, per-person, agency markup)"
```

---

## Task 10: MarkupInput Component

**Files:**
- Create: `src/components/MarkupInput.tsx`

- [ ] **Step 1: Create markup input component**

Bidirectional input: per-person ↔ total auto-calculation.

```tsx
'use client'

import { useState, useCallback } from 'react'

interface Props {
  totalPeople: number
  initialPerPerson?: number
  initialTotal?: number
  onChange: (perPerson: number, total: number) => void
}

export default function MarkupInput({ totalPeople, initialPerPerson, initialTotal, onChange }: Props) {
  const [perPerson, setPerPerson] = useState(initialPerPerson ?? 0)
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [lastEdited, setLastEdited] = useState<'perPerson' | 'total'>('perPerson')

  const handlePerPersonChange = useCallback((value: string) => {
    const num = Math.max(0, Math.floor(Number(value) || 0))
    setPerPerson(num)
    const newTotal = num * totalPeople
    setTotal(newTotal)
    setLastEdited('perPerson')
    onChange(num, newTotal)
  }, [totalPeople, onChange])

  const handleTotalChange = useCallback((value: string) => {
    const num = Math.max(0, Math.floor(Number(value) || 0))
    setTotal(num)
    const newPerPerson = totalPeople > 0 ? Math.round(num / totalPeople) : 0
    setPerPerson(newPerPerson)
    setLastEdited('total')
    onChange(newPerPerson, num)
  }, [totalPeople, onChange])

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 whitespace-nowrap">여행사 수익</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="number"
            value={perPerson || ''}
            onChange={e => handlePerPersonChange(e.target.value)}
            placeholder="0"
            className="w-28 border border-gray-300 rounded px-3 py-1.5 text-sm text-right pr-12"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원/인</span>
        </div>
        <span className="text-gray-400 text-xs">×{totalPeople}명 =</span>
        <div className="relative">
          <input
            type="number"
            value={total || ''}
            onChange={e => handleTotalChange(e.target.value)}
            placeholder="0"
            className="w-32 border border-gray-300 rounded px-3 py-1.5 text-sm text-right pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MarkupInput.tsx
git commit -m "feat: add MarkupInput component with bidirectional per-person/total calculation"
```

---

## Task 11: ConfirmMarkupModal Component

**Files:**
- Create: `src/components/ConfirmMarkupModal.tsx`

- [ ] **Step 1: Create 2-step confirmation modal**

Step 1: Enter/confirm markup. Step 2: Review final amounts.

```tsx
'use client'

import { useState } from 'react'
import MarkupInput from './MarkupInput'

interface Props {
  landcoTotal: number
  totalPeople: number
  initialPerPerson: number
  initialTotal: number
  landcoName: string
  onConfirm: (markupPerPerson: number, markupTotal: number) => void
  onClose: () => void
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function ConfirmMarkupModal({
  landcoTotal,
  totalPeople,
  initialPerPerson,
  initialTotal,
  landcoName,
  onConfirm,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [markupPerPerson, setMarkupPerPerson] = useState(initialPerPerson)
  const [markupTotal, setMarkupTotal] = useState(initialTotal)

  const finalTotal = landcoTotal + markupTotal
  const finalPerPerson = totalPeople > 0 ? Math.round(finalTotal / totalPeople) : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">
            {step === 1 ? '여행사 수익 설정' : '최종 금액 확인'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{landcoName}</p>
        </div>

        <div className="px-6 py-5">
          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                고객에게 청구할 여행사 수익을 설정하세요.
              </p>
              <MarkupInput
                totalPeople={totalPeople}
                initialPerPerson={markupPerPerson}
                initialTotal={markupTotal}
                onChange={(pp, t) => { setMarkupPerPerson(pp); setMarkupTotal(t) }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">랜드사 견적가</span>
                  <span>{formatNumber(landcoTotal)}원</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">여행사 수익</span>
                  <span className="text-blue-600">+{formatNumber(markupTotal)}원</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between font-bold">
                  <span>최종 고객가</span>
                  <span className="text-lg">{formatNumber(finalTotal)}원</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>1인당</span>
                  <span>{formatNumber(finalPerPerson)}원</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              다음
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                이전
              </button>
              <button
                onClick={() => onConfirm(markupPerPerson, markupTotal)}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                확정
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ConfirmMarkupModal.tsx
git commit -m "feat: add ConfirmMarkupModal with 2-step markup confirmation flow"
```

---

## Task 12: Quote Detail Web UI Page

**Files:**
- Create: `src/app/(dashboard)/agency/quotes/[quoteId]/page.tsx`

- [ ] **Step 1: Create quote detail page**

This page replaces the Excel preview modal. Shows itinerary tab (always) and pricing tab (only after selection).

```tsx
'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import ItineraryView from '@/components/quote-view/ItineraryView'
import PricingView from '@/components/quote-view/PricingView'
import QuoteSummaryBar from '@/components/quote-view/QuoteSummaryBar'
import { calculateTotalPeople } from '@/lib/utils'
import { applyPlatformMargin, distributeMealExcludedMarkup, calculatePricingTotals } from '@/lib/pricing/markup'
import type { ItineraryDay, PricingData, QuoteRequest } from '@/lib/supabase/types'

interface QuoteDetailData {
  quote: { id: string; request_id: string; landco_id: string; status: string; file_name: string }
  request: QuoteRequest
  draft: { itinerary: ItineraryDay[]; pricing: PricingData }
  marginRate: number
  markup: { markup_per_person: number; markup_total: number } | null
  isSelected: boolean
  landcoName: string
}

export default function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<QuoteDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'itinerary' | 'pricing'>('itinerary')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/quotes/${quoteId}/detail`)
      if (!res.ok) { setLoading(false); return }
      setData(await res.json())
      setLoading(false)
    }
    load()
  }, [quoteId])

  if (loading) return <div className="flex items-center justify-center h-64"><p>로딩 중...</p></div>
  if (!data) return <div className="p-8"><p>견적을 찾을 수 없습니다.</p></div>

  const totalPeople = calculateTotalPeople({
    adults: data.request.adults, children: data.request.children,
    infants: data.request.infants, leaders: data.request.leaders,
  })

  // Apply platform margin
  let pricing = applyPlatformMargin(data.draft.pricing, data.marginRate)

  // Apply agency markup if exists
  const markupTotal = data.markup?.markup_total ?? 0
  if (markupTotal > 0) {
    pricing = distributeMealExcludedMarkup(pricing, markupTotal)
  }

  const totals = calculatePricingTotals(pricing)
  const perPerson = totalPeople > 0 ? Math.round(totals.total / totalPeople) : 0

  const handleDownload = async () => {
    const res = await fetch(`/api/quotes/${quoteId}/download`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = data.quote.file_name || 'quote.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            ← 뒤로가기
          </button>
          <h1 className="text-xl font-bold">{data.request.event_name}</h1>
          <p className="text-sm text-gray-500">{data.landcoName}</p>
        </div>
        <button
          onClick={handleDownload}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          엑셀 다운로드
        </button>
      </div>

      {/* Summary Bar */}
      <QuoteSummaryBar
        total={totals.total}
        perPerson={perPerson}
        agencyMarkup={markupTotal > 0 ? markupTotal : undefined}
      />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'itinerary'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            일정표
          </button>
          {data.isSelected && (
            <button
              onClick={() => setActiveTab('pricing')}
              className={`pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'pricing'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              견적서
            </button>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'itinerary' && <ItineraryView itinerary={data.draft.itinerary} />}
      {activeTab === 'pricing' && data.isSelected && (
        <PricingView pricing={pricing} totalPeople={totalPeople} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create quote detail API**

Create `src/app/api/quotes/[id]/detail/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: quoteId } = await params

  const { data: quote } = await supabase
    .from('quotes').select('*').eq('id', quoteId).single()
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: req } = await supabase
    .from('quote_requests').select('*').eq('id', quote.request_id).single()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get draft data
  const { data: draft } = await adminClient
    .from('quote_drafts').select('itinerary, pricing')
    .eq('request_id', quote.request_id).eq('landco_id', quote.landco_id).single()
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  // Get margin rate
  const { data: marginSetting } = await supabase
    .from('platform_settings').select('value').eq('key', 'margin_rate').single()
  const marginRate = marginSetting ? Number(marginSetting.value) : 0.05

  // Get agency markup
  const { data: markup } = await supabase
    .from('agency_markups').select('markup_per_person, markup_total')
    .eq('quote_id', quoteId).eq('agency_id', user.id).maybeSingle()

  // Check selection
  const { data: selection } = await supabase
    .from('quote_selections').select('selected_quote_id')
    .eq('request_id', quote.request_id).maybeSingle()
  const isSelected = selection?.selected_quote_id === quoteId

  // Get landco name
  const { data: landcoProfile } = await adminClient
    .from('profiles').select('company_name').eq('id', quote.landco_id).single()

  return NextResponse.json({
    quote: { id: quote.id, request_id: quote.request_id, landco_id: quote.landco_id, status: quote.status, file_name: quote.file_name },
    request: req,
    draft: { itinerary: draft.itinerary, pricing: draft.pricing },
    marginRate,
    markup: markup ?? null,
    isSelected,
    landcoName: landcoProfile?.company_name ?? '',
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/agency/quotes/\[quoteId\]/page.tsx src/app/api/quotes/\[id\]/detail/route.ts
git commit -m "feat: add quote detail web UI page with itinerary/pricing tabs"
```

---

## Task 13: Modify Agency Request Detail Page

**Files:**
- Modify: `src/app/(dashboard)/agency/requests/[id]/page.tsx`

This is the largest task — it wires everything together: changes preview/download buttons, adds markup input per quote, changes confirmation flow to 2-step modal.

- [ ] **Step 1: Add imports**

Add at top of `src/app/(dashboard)/agency/requests/[id]/page.tsx`:

```typescript
import MarkupInput from '@/components/MarkupInput'
import ConfirmMarkupModal from '@/components/ConfirmMarkupModal'
import type { AgencyMarkup } from '@/lib/supabase/types'
```

- [ ] **Step 2: Add markup state and fetch**

Inside the main component, after the existing state declarations, add state for markups and fetch them:

```typescript
const [markups, setMarkups] = useState<Record<string, AgencyMarkup>>({})

// Inside the existing useEffect that fetches request data, add after quotes are loaded:
// Fetch markups
const markupsRes = await fetch(`/api/agency-markups?requestId=${id}`)
if (markupsRes.ok) {
  const { markups: markupsList } = await markupsRes.json()
  const markupMap: Record<string, AgencyMarkup> = {}
  for (const m of markupsList) { markupMap[m.quote_id] = m }
  setMarkups(markupMap)
}

// Fetch margin rate
const settingsRes = await fetch('/api/platform-settings')
let marginRate = 0.05
if (settingsRes.ok) {
  const { settings } = await settingsRes.json()
  if (settings.margin_rate) marginRate = Number(settings.margin_rate)
}
```

Add markup save handler:

```typescript
const handleMarkupChange = async (quoteId: string, perPerson: number, total: number) => {
  setMarkups(prev => ({
    ...prev,
    [quoteId]: { ...prev[quoteId], quote_id: quoteId, markup_per_person: perPerson, markup_total: total } as AgencyMarkup,
  }))
  await fetch('/api/agency-markups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, markupPerPerson: perPerson, markupTotal: total }),
  })
}
```

- [ ] **Step 3: Change preview button to navigate to web UI**

Replace the existing preview button's `onClick` (which opens `ExcelPreviewModal`) with navigation:

```typescript
// Before: onClick={() => { setPreviewQuote(q); ... }}
// After:
onClick={() => window.open(`/agency/quotes/${q.id}`, '_blank')}
```

- [ ] **Step 4: Change download button to use new API**

Replace the existing download link (which uses `q.file_url` directly) with the new download API:

```typescript
// Before: <a href={q.file_url} download>다운로드</a>
// After:
onClick={async () => {
  const res = await fetch(`/api/quotes/${q.id}/download`)
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = q.file_name
  a.click()
  URL.revokeObjectURL(url)
}}
```

- [ ] **Step 5: Add MarkupInput per quote card**

In the quote card section (where each quote's pricing/buttons are shown), add the MarkupInput component:

```tsx
<MarkupInput
  totalPeople={total}
  initialPerPerson={markups[q.id]?.markup_per_person ?? 0}
  initialTotal={markups[q.id]?.markup_total ?? 0}
  onChange={(pp, t) => handleMarkupChange(q.id, pp, t)}
/>
```

- [ ] **Step 6: Replace confirmation modal with ConfirmMarkupModal**

Replace the existing simple confirmation modal with `ConfirmMarkupModal`:

```tsx
// State for confirmation
const [confirmQuote, setConfirmQuote] = useState<QuoteWithPricing | null>(null)

// In the quote card, change the confirm button:
onClick={() => setConfirmQuote(q)}

// Render ConfirmMarkupModal:
{confirmQuote && (
  <ConfirmMarkupModal
    landcoTotal={confirmQuote.pricing?.total ?? 0}
    totalPeople={total}
    initialPerPerson={markups[confirmQuote.id]?.markup_per_person ?? 0}
    initialTotal={markups[confirmQuote.id]?.markup_total ?? 0}
    landcoName={confirmQuote.profiles?.company_name ?? ''}
    onConfirm={async (markupPerPerson, markupTotal) => {
      // Save final markup
      await fetch('/api/agency-markups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: confirmQuote.id,
          markupPerPerson,
          markupTotal,
        }),
      })
      // Call existing confirm API
      await fetch('/api/quotes/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          quoteId: confirmQuote.id,
          landcoId: confirmQuote.landco_id,
        }),
      })
      setConfirmQuote(null)
      location.reload()
    }}
    onClose={() => setConfirmQuote(null)}
  />
)}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/agency/requests/\[id\]/page.tsx
git commit -m "feat: integrate markup input, web preview, download API, and 2-step confirm modal into agency request page"
```

---

## Task 14: Modify Quote Confirm API for Settlement

**Files:**
- Modify: `src/app/api/quotes/confirm/route.ts`

- [ ] **Step 1: Add settlement creation to confirm flow**

After the existing quote selection and status update logic, add settlement data creation:

```typescript
// After the existing upsert to quote_selections and status updates, add:

// Get platform margin rate
const { data: marginSetting } = await supabase
  .from('platform_settings').select('value').eq('key', 'margin_rate').single()
const marginRate = marginSetting ? Number(marginSetting.value) : 0.05

// Get agency markup
const { data: markup } = await supabase
  .from('agency_markups').select('markup_total')
  .eq('quote_id', quoteId).eq('agency_id', user.id).maybeSingle()
const agencyMarkup = markup?.markup_total ?? 0

// Get landco pricing total from the Excel file
const { data: quote } = await supabase
  .from('quotes').select('file_url').eq('id', quoteId).single()

// Parse landco original total
const pricingResult = await extractQuotePricing(quote!.file_url)
const landcoAmount = pricingResult.total ?? 0
const platformMargin = Math.round(landcoAmount * marginRate)
const totalAmount = landcoAmount + platformMargin + agencyMarkup

// Create settlement record
await supabase.from('quote_settlements').upsert({
  request_id: requestId,
  quote_id: quoteId,
  landco_id: landcoId,
  agency_id: user.id,
  landco_amount: landcoAmount,
  platform_margin: platformMargin,
  platform_margin_rate: marginRate,
  agency_markup: agencyMarkup,
  total_amount: totalAmount,
}, { onConflict: 'request_id' })
```

Add import at top:

```typescript
import { extractQuotePricing } from '@/lib/excel/parse'
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/quotes/confirm/route.ts
git commit -m "feat: create quote_settlements record on quote confirmation"
```

---

## Task 15: Modify Request API to Include Markups

**Files:**
- Modify: `src/app/api/requests/[id]/route.ts`

- [ ] **Step 1: Add platform margin to pricing response**

In the GET handler, after extracting pricing, apply platform margin for agency users:

```typescript
// After profile role check (line ~29), get margin rate:
const { data: marginSetting } = await supabase
  .from('platform_settings').select('value').eq('key', 'margin_rate').single()
const marginRate = marginSetting ? Number(marginSetting.value) : 0.05

// In the quotesWithPricing mapping, adjust pricing for agency:
const quotesWithPricing = await Promise.all(
  (quotes ?? []).map(async q => {
    const pricing = await extractQuotePricing(q.file_url)
    const adjustedTotal = isOwner && pricing.total
      ? Math.round(pricing.total * (1 + marginRate))
      : pricing.total
    const adjustedPerPerson = isOwner && pricing.per_person
      ? Math.round(pricing.per_person * (1 + marginRate))
      : pricing.per_person
    return {
      ...q,
      profiles: profileMap[q.landco_id] ?? null,
      pricing: { total: adjustedTotal, per_person: adjustedPerPerson },
    }
  })
)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/requests/\[id\]/route.ts
git commit -m "feat: apply platform margin to pricing for agency users in request API"
```

---

## Task 16: Integration Test & Cleanup

- [ ] **Step 1: Run all tests**

Run: `cd /Users/youngjun-hwang/Desktop/Claude/my-land-pick/.worktrees/feature/incentive-quote-mvp && npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`
Expected: No build errors, server starts on localhost:3000

- [ ] **Step 3: Remove unused ExcelPreviewModal imports from agency page**

If the agency request detail page no longer uses `ExcelPreviewModal`, remove the import and related state.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: cleanup unused imports and verify integration"
```
