# 견적서 포함사항/불포함사항 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜드사 견적 에디터에서 포함사항/불포함사항을 입력하고, 여행사 미리보기 및 엑셀 다운로드에 반영

**Architecture:** DB에 includes/excludes 텍스트 컬럼 추가 → 에디터 UI에 textarea 추가 → autosave/submit 흐름에 포함 → 엑셀 템플릿 정보 섹션에 행 추가 → 여행사 미리보기에 표시

**Tech Stack:** Next.js 16, Supabase (PostgreSQL), ExcelJS, TypeScript

---

### Task 1: DB 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/20260429000000_quote_includes_excludes.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- quote_drafts 테이블에 추가
ALTER TABLE quote_drafts ADD COLUMN IF NOT EXISTS includes text;
ALTER TABLE quote_drafts ADD COLUMN IF NOT EXISTS excludes text;

-- quotes 테이블에 추가
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS includes text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS excludes text;
```

- [ ] **Step 2: Supabase에 마이그레이션 적용**

Supabase SQL Editor에서 위 SQL 직접 실행.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260429000000_quote_includes_excludes.sql
git commit -m "feat: add includes/excludes columns to quotes and quote_drafts"
```

---

### Task 2: 타입 정의 업데이트

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Quote 인터페이스에 필드 추가**

`src/lib/supabase/types.ts`의 Quote 인터페이스 끝에 추가:

```typescript
// 기존 마지막 필드 아래에 추가
  summary_per_person?: number
  includes?: string | null
  excludes?: string | null
}
```

- [ ] **Step 2: QuoteDraft 인터페이스에도 추가**

QuoteDraft 인터페이스에 동일하게 추가:

```typescript
  includes?: string | null
  excludes?: string | null
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add includes/excludes to Quote and QuoteDraft types"
```

---

### Task 3: Draft API 업데이트

**Files:**
- Modify: `src/app/api/quotes/draft/route.ts`

- [ ] **Step 1: PUT body 타입에 includes/excludes 추가**

`route.ts` 62-69번 줄의 body 타입에 추가:

```typescript
  const body = await request.json() as {
    requestId: string
    itinerary: ItineraryDay[]
    pricing: PricingData
    pricing_mode?: 'detailed' | 'summary'
    summary_total?: number
    summary_per_person?: number
    includes?: string | null
    excludes?: string | null
  }
  const { requestId, itinerary, pricing, pricing_mode, summary_total, summary_per_person, includes, excludes } = body
```

- [ ] **Step 2: upsert 데이터에 includes/excludes 포함**

78-89번 줄의 upsert 객체에 추가:

```typescript
    .upsert(
      {
        request_id: requestId,
        landco_id: user!.id,
        itinerary,
        pricing,
        pricing_mode: pricing_mode ?? 'detailed',
        summary_total: summary_total ?? 0,
        summary_per_person: summary_per_person ?? 0,
        includes: includes ?? null,
        excludes: excludes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'request_id,landco_id' },
    )
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/quotes/draft/route.ts
git commit -m "feat: include includes/excludes in draft save/load"
```

---

### Task 4: Submit API 업데이트

**Files:**
- Modify: `src/app/api/quotes/draft/submit/route.ts`

- [ ] **Step 1: draft select에 includes/excludes 추가**

31-36번 줄의 draft select를 수정:

```typescript
  const { data: draft, error: draftError } = await supabase
    .from('quote_drafts')
    .select('itinerary, pricing, pricing_mode, summary_total, summary_per_person, includes, excludes')
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)
    .single()
```

- [ ] **Step 2: generateFilledQuoteTemplate 호출에 includes/excludes 전달**

57-72번 줄에서 이미 `includes: ''`, `excludes: ''`로 되어있는 부분을 수정:

```typescript
      includes: draft.includes ?? '',
      excludes: draft.excludes ?? '',
```

- [ ] **Step 3: quotes insert에 includes/excludes 추가**

112-123번 줄의 insert 객체에 추가:

```typescript
    .insert({
      request_id: requestId,
      landco_id: user!.id,
      version: nextVersion,
      file_url: urlData?.signedUrl ?? officialPath,
      file_name: fileName,
      itinerary: draft.itinerary,
      pricing: draft.pricing,
      pricing_mode: submittedPricingMode ?? draft.pricing_mode ?? 'detailed',
      summary_total: draft.summary_total ?? 0,
      summary_per_person: draft.summary_per_person ?? 0,
      includes: draft.includes ?? null,
      excludes: draft.excludes ?? null,
    })
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/quotes/draft/submit/route.ts
git commit -m "feat: pass includes/excludes through submit flow"
```

---

### Task 5: 엑셀 템플릿에 포함/불포함 행 추가

**Files:**
- Modify: `src/lib/excel/template.ts`

- [ ] **Step 1: infoRows 배열에 포함사항/불포함사항 추가**

83-89번 줄의 infoRows 배열 끝에 조건부 추가:

```typescript
  const infoRows: Array<{ label: string; value: string }> = [
    { label: '행사명', value: opts.event_name },
    { label: '발신처', value: opts.landco_name ?? '' },
    { label: '총 인원', value: peopleText },
    { label: '출발일', value: formatDateWithDay(opts.depart_date) },
    { label: '도착일', value: formatDateWithDay(opts.return_date) },
  ]

  if (opts.includes) {
    infoRows.push({ label: '포함사항', value: opts.includes.split('\n').filter(Boolean).join(', ') })
  }
  if (opts.excludes) {
    infoRows.push({ label: '불포함사항', value: opts.excludes.split('\n').filter(Boolean).join(', ') })
  }
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/excel/template.ts
git commit -m "feat: render includes/excludes in Excel info section"
```

---

### Task 6: Download API에 includes/excludes 전달

**Files:**
- Modify: `src/app/api/quotes/[id]/download/route.ts`

- [ ] **Step 1: quote에서 includes/excludes 읽어서 전달**

download route에서 `generateFilledQuoteTemplate` 호출 시 includes/excludes 추가. quote 객체에서 읽어온다:

```typescript
const workbook = await generateFilledQuoteTemplate(
  {
    event_name: req.event_name,
    destination: `${req.destination_country} ${req.destination_city}`.trim(),
    depart_date: req.depart_date,
    return_date: req.return_date,
    total_people: totalPeople,
    adults: req.adults,
    children: req.children,
    infants: req.infants,
    leaders: req.leaders,
    hotel_grade: req.hotel_grade,
    landco_name: landcoProfile?.company_name ?? '',
    markup_krw: markupForTemplate,
    includes: quote.includes ?? '',
    excludes: quote.excludes ?? '',
  },
  { itinerary: draft.itinerary, pricing },
)
```

quote select에 `includes, excludes`가 포함되어 있는지 확인하고 없으면 추가.

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/quotes/[id]/download/route.ts
git commit -m "feat: pass includes/excludes to Excel download"
```

---

### Task 7: Detail API에 includes/excludes 포함

**Files:**
- Modify: `src/app/api/quotes/[id]/detail/route.ts`

- [ ] **Step 1: 응답에 includes/excludes 추가**

detail route의 응답 JSON에 includes/excludes를 추가:

```typescript
return NextResponse.json({
  quote: { id: quote.id, request_id: quote.request_id, landco_id: quote.landco_id, status: quote.status, file_name: quote.file_name },
  request: req,
  draft: { itinerary: draft.itinerary, pricing: draft.pricing },
  pricing_mode: quote.pricing_mode ?? 'detailed',
  summary_total: quote.summary_total ?? 0,
  summary_per_person: quote.summary_per_person ?? 0,
  markup: markup ?? null,
  isSelected,
  landcoName: landcoProfile?.company_name ?? '',
  includes: quote.includes ?? null,
  excludes: quote.excludes ?? null,
})
```

quote select가 `*`이면 이미 포함됨. 명시적 select인 경우 필드 추가.

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/quotes/[id]/detail/route.ts
git commit -m "feat: include includes/excludes in quote detail response"
```

---

### Task 8: 랜드사 견적 에디터 UI

**Files:**
- Modify: `src/components/quote-editor/QuoteEditorShell.tsx`

- [ ] **Step 1: state 추가**

기존 state 선언부에 추가:

```typescript
const [includes, setIncludes] = useState('')
const [excludes, setExcludes] = useState('')
```

ref도 추가 (autosave에서 최신 값 참조용):

```typescript
const includesRef = useRef('')
const excludesRef = useRef('')
```

- [ ] **Step 2: ref 동기화**

itineraryRef/pricingRef 동기화와 동일한 패턴으로:

```typescript
useEffect(() => { includesRef.current = includes }, [includes])
useEffect(() => { excludesRef.current = excludes }, [excludes])
```

- [ ] **Step 3: draft 로드 시 includes/excludes 초기화**

기존 draft 로드 로직에서 includes/excludes를 초기화:

```typescript
if (draftJson.draft) {
  // 기존 코드...
  setIncludes(draftJson.draft.includes ?? '')
  setExcludes(draftJson.draft.excludes ?? '')
}
```

이전 버전 로드 시에도 동일하게:

```typescript
if (quote.includes) setIncludes(quote.includes)
if (quote.excludes) setExcludes(quote.excludes)
```

- [ ] **Step 4: saveDraft에 includes/excludes 포함**

saveDraft 함수의 body에 추가:

```typescript
body: JSON.stringify({
  requestId,
  itinerary: itineraryRef.current,
  pricing: pricingRef.current,
  pricing_mode: pricingModeRef.current,
  summary_total: summaryTotalRef.current,
  summary_per_person: summaryPerPersonRef.current,
  includes: includesRef.current || null,
  excludes: excludesRef.current || null,
}),
```

- [ ] **Step 5: UI — 탭 영역과 컨텐츠 사이에 포함/불포함 섹션 추가**

견적서 탭 컨텐츠 아래, 제출 버튼 영역 위에 섹션 추가:

```tsx
{/* 포함사항 / 불포함사항 */}
<div className="border-t border-gray-200 px-6 py-4 flex-shrink-0">
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">포함사항</label>
      <textarea
        value={includes}
        onChange={e => { setIncludes(e.target.value); isDirtyRef.current = true }}
        placeholder="줄바꿈으로 항목을 구분해주세요"
        rows={4}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-blue-400"
      />
    </div>
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">불포함사항</label>
      <textarea
        value={excludes}
        onChange={e => { setExcludes(e.target.value); isDirtyRef.current = true }}
        placeholder="줄바꿈으로 항목을 구분해주세요"
        rows={4}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-blue-400"
      />
    </div>
  </div>
</div>
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/quote-editor/QuoteEditorShell.tsx
git commit -m "feat: add includes/excludes textarea to quote editor"
```

---

### Task 9: 여행사 미리보기에 포함/불포함 표시

**Files:**
- Modify: `src/app/(dashboard)/agency/quotes/[quoteId]/page.tsx`

- [ ] **Step 1: data에서 includes/excludes 추출**

기존 data fetch 후 state 또는 변수로 추출:

```typescript
const includesText = data.includes as string | null
const excludesText = data.excludes as string | null
```

- [ ] **Step 2: 일정표 탭에서 ItineraryView 위에 포함/불포함 표시**

```tsx
{activeTab === 'itinerary' && (
  <>
    {(includesText || excludesText) && (
      <div className="grid grid-cols-2 gap-4 mb-4">
        {includesText && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-emerald-700 mb-2">포함사항</h4>
            <ul className="space-y-1">
              {includesText.split('\n').filter(Boolean).map((item, i) => (
                <li key={i} className="text-sm text-emerald-800 flex items-start gap-1.5">
                  <span className="text-emerald-500 mt-0.5">+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {excludesText && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-red-700 mb-2">불포함사항</h4>
            <ul className="space-y-1">
              {excludesText.split('\n').filter(Boolean).map((item, i) => (
                <li key={i} className="text-sm text-red-800 flex items-start gap-1.5">
                  <span className="text-red-500 mt-0.5">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )}
    <ItineraryView itinerary={data.draft.itinerary} />
  </>
)}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/(dashboard)/agency/quotes/[quoteId]/page.tsx
git commit -m "feat: display includes/excludes in agency quote preview"
```
