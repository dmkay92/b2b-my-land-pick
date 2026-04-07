# 입금대기(Payment Pending) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행사 견적 확정 후 랜드사가 입금을 확인해야 최종확정되는 "입금대기" 단계를 플로우에 추가한다.

**Architecture:** `QuoteRequestStatus`에 `'payment_pending'`을 추가하고, 여행사의 견적 확정 시 `payment_pending`으로 전환, 랜드사의 입금확인 API 호출 시 `finalized`로 전환한다. 기존 `finalized` 레코드는 모두 `payment_pending`으로 마이그레이션한다.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL), TypeScript, Tailwind CSS

---

## 파일 구조

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `src/lib/supabase/types.ts` | 수정 | `QuoteRequestStatus` + `payment_pending`, `QuoteSelection.payment_memo` 추가 |
| `src/app/api/quotes/confirm/route.ts` | 수정 | `payment_pending` 상태로 변경, `finalized_at` 즉시 설정 제거 |
| `src/app/api/quotes/payment-confirm/route.ts` | 신규 생성 | 랜드사 입금확인 엔드포인트 |
| `src/app/(dashboard)/agency/page.tsx` | 수정 | `getPhase()` + `payment_pending`, `finalizedIds` 필터, counts |
| `src/app/(dashboard)/agency/DashboardClient.tsx` | 수정 | `TravelPhase`, `PhasedRequest.phase`, KPI 카드, 섹션, 취소 버튼 조건 |
| `src/app/(dashboard)/agency/requests/[id]/page.tsx` | 수정 | 수정 버튼 숨김, 확정 버튼 조건, payment_pending 배너 |
| `src/app/(dashboard)/landco/page.tsx` | 수정 | `getPhase()` + `payment_pending`, 쿼리 `in('status', [...])` |
| `src/app/(dashboard)/landco/LandcoDashboardClient.tsx` | 수정 | `PhasedLandcoRequest.phase`, KPI 카드, 섹션 |
| `src/app/(dashboard)/landco/requests/[id]/page.tsx` | 수정 | 업로드 비활성화 조건, 입금확인 UI |
| `src/components/chat/FloatingChat.tsx` | 수정 | `payment_pending` 태그 추가 |

---

## Task 1: DB 스키마 마이그레이션

**Files:**
- Supabase SQL Editor에서 직접 실행

- [ ] **Step 1: Supabase SQL Editor에서 아래 SQL 실행**

```sql
-- 1. payment_memo 컬럼 추가
ALTER TABLE quote_selections ADD COLUMN IF NOT EXISTS payment_memo TEXT;

-- 2. 기존 finalized 레코드의 finalized_at을 NULL로 초기화 (랜드사가 아직 확인한 적 없음)
UPDATE quote_selections
SET finalized_at = NULL
WHERE request_id IN (
  SELECT id FROM quote_requests WHERE status = 'finalized'
);

-- 3. quote_requests 상태를 payment_pending으로 마이그레이션
UPDATE quote_requests SET status = 'payment_pending' WHERE status = 'finalized';

-- 4. 선택된 견적 quotes.status도 selected로 되돌림
UPDATE quotes SET status = 'selected'
WHERE status = 'finalized'
  AND id IN (
    SELECT selected_quote_id FROM quote_selections
  );
```

- [ ] **Step 2: 결과 확인**

```sql
SELECT status, COUNT(*) FROM quote_requests GROUP BY status;
SELECT finalized_at, COUNT(*) FROM quote_selections GROUP BY finalized_at IS NULL;
```

Expected: `finalized` 레코드 0개, `payment_pending` 레코드가 이전 `finalized` 수와 동일

---

## Task 2: TypeScript 타입 업데이트

**Files:**
- Modify: `src/lib/supabase/types.ts:4`

- [ ] **Step 1: `QuoteRequestStatus`에 `payment_pending` 추가, `QuoteSelection`에 `payment_memo` 추가**

```typescript
// src/lib/supabase/types.ts

export type UserRole = 'agency' | 'landco' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'rejected'
export type HotelGrade = 3 | 4 | 5
export type QuoteRequestStatus = 'open' | 'in_progress' | 'closed' | 'payment_pending' | 'finalized'
export type QuoteStatus = 'submitted' | 'selected' | 'finalized' | 'rejected'

// ... (Profile, QuoteRequest, Quote 인터페이스 동일)

export interface QuoteSelection {
  request_id: string
  selected_quote_id: string
  landco_id: string
  selected_at: string
  finalized_at: string | null
  payment_memo: string | null
}
```

- [ ] **Step 2: TypeScript 에러 없는지 확인**

```bash
cd /Users/youngjun-hwang/Desktop/Claude/incentive-quote/.worktrees/feature/incentive-quote-mvp
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: types.ts 관련 에러 없음 (기존 에러만 유지)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add payment_pending to QuoteRequestStatus and payment_memo to QuoteSelection"
```

---

## Task 3: `/api/quotes/confirm` 수정

**Files:**
- Modify: `src/app/api/quotes/confirm/route.ts`

- [ ] **Step 1: confirm 라우트를 `payment_pending`으로 전환하도록 수정**

`finalized_at: now` 제거, `quotes.status = 'selected'`, `quote_requests.status = 'payment_pending'`으로 변경:

```typescript
// src/app/api/quotes/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSelectedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, quoteId, landcoId } = await request.json()
  if (!requestId || !quoteId || !landcoId) {
    return NextResponse.json({ error: 'requestId, quoteId, landcoId required' }, { status: 400 })
  }

  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id, event_name, status').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 이미 입금대기 또는 확정된 경우 차단
  if (qr?.status === 'payment_pending' || qr?.status === 'finalized') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 409 })
  }

  // 선택 기록 저장 (finalized_at은 null — 랜드사 입금확인 후 설정)
  await supabase.from('quote_selections').upsert({
    request_id: requestId,
    selected_quote_id: quoteId,
    landco_id: landcoId,
    finalized_at: null,
  }, { onConflict: 'request_id' })

  // 선택된 견적서 상태: selected
  await supabase.from('quotes').update({ status: 'selected' }).eq('id', quoteId)

  // 요청 상태: payment_pending
  await supabase.from('quote_requests').update({ status: 'payment_pending' }).eq('id', requestId)

  // 랜드사 알림 (선택됨)
  await supabase.from('notifications').insert({
    user_id: landcoId,
    type: 'quote_selected',
    payload: { request_id: requestId, event_name: qr?.event_name },
  })

  const { data: landco } = await supabase
    .from('profiles').select('email, company_name').eq('id', landcoId).single()
  if (landco) {
    await sendQuoteSelectedEmail({
      to: landco.email,
      company_name: landco.company_name,
      event_name: qr?.event_name ?? '',
      request_id: requestId,
    })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "confirm/route"
```

Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/quotes/confirm/route.ts
git commit -m "feat: confirm now sets payment_pending instead of finalized"
```

---

## Task 4: `/api/quotes/payment-confirm` 신규 생성

**Files:**
- Create: `src/app/api/quotes/payment-confirm/route.ts`

- [ ] **Step 1: 랜드사 입금확인 API 생성**

```typescript
// src/app/api/quotes/payment-confirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendFinalizedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, memo } = await request.json()
  if (!requestId) {
    return NextResponse.json({ error: 'requestId required' }, { status: 400 })
  }

  // 랜드사 역할 확인
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'landco') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 요청 상태 확인
  const { data: qr } = await admin
    .from('quote_requests').select('status, agency_id, event_name').eq('id', requestId).single()
  if (!qr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (qr.status !== 'payment_pending') {
    return NextResponse.json({ error: 'Not in payment_pending state' }, { status: 409 })
  }

  // 이 랜드사가 선택된 견적인지 확인
  const { data: selection } = await admin
    .from('quote_selections')
    .select('selected_quote_id, landco_id')
    .eq('request_id', requestId)
    .single()
  if (!selection || selection.landco_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date().toISOString()

  // 입금 확인 처리
  await admin.from('quote_selections').update({
    finalized_at: now,
    payment_memo: memo ?? null,
  }).eq('request_id', requestId)

  await admin.from('quotes').update({ status: 'finalized' }).eq('id', selection.selected_quote_id)

  await admin.from('quote_requests').update({ status: 'finalized' }).eq('id', requestId)

  // 여행사 알림
  await admin.from('notifications').insert({
    user_id: qr.agency_id,
    type: 'quote_finalized',
    payload: { request_id: requestId, event_name: qr.event_name },
  })

  // 여행사 이메일
  const { data: agency } = await admin
    .from('profiles').select('email, company_name').eq('id', qr.agency_id).single()
  if (agency) {
    await sendFinalizedEmail({
      to: agency.email,
      company_name: agency.company_name,
      event_name: qr.event_name ?? '',
    })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "payment-confirm"
```

Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/quotes/payment-confirm/route.ts
git commit -m "feat: add payment-confirm API for landco payment confirmation"
```

---

## Task 5: Agency `page.tsx` 업데이트

**Files:**
- Modify: `src/app/(dashboard)/agency/page.tsx`

- [ ] **Step 1: `getPhase()` + `InternalPhase` 타입 업데이트, `finalizedIds` 필터 수정, `counts` 업데이트**

```typescript
// src/app/(dashboard)/agency/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { AgencyDashboardClient } from './DashboardClient'
import type { PhasedRequest, TravelPhase, SelectedInfo } from './DashboardClient'
import type { QuoteRequest } from '@/lib/supabase/types'
import { extractQuotePricing } from '@/lib/excel/parse'

type InternalPhase = PhasedRequest['phase']

function getPhase(req: QuoteRequest, today: string): InternalPhase {
  if (req.status === 'closed') return 'cancelled'
  if (req.status === 'payment_pending') return 'payment_pending'
  if (req.status !== 'finalized') return 'ing'
  const d = req.depart_date.slice(0, 10)
  const r = req.return_date.slice(0, 10)
  if (today < d) return 'pre'
  if (today > r) return 'end'
  return 'mid'
}

function getDday(req: QuoteRequest, phase: InternalPhase, today: string): number | null {
  if (phase === 'pre') {
    const [ty, tm, td] = today.split('-').map(Number)
    const [dy, dm, dd] = req.depart_date.slice(0, 10).split('-').map(Number)
    return Math.ceil((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000)
  }
  if (phase === 'mid') {
    const [ty, tm, td] = today.split('-').map(Number)
    const [ry, rm, rd] = req.return_date.slice(0, 10).split('-').map(Number)
    return Math.ceil((Date.UTC(ry, rm - 1, rd) - Date.UTC(ty, tm - 1, td)) / 86400000)
  }
  return null
}

export default async function AgencyDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: raw } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('agency_id', user!.id)
    .order('created_at', { ascending: false })

  const requestIds = (raw ?? []).map(r => r.id)

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: quoteRows } = requestIds.length > 0
    ? await admin.from('quotes').select('request_id, landco_id, submitted_at')
        .in('request_id', requestIds)
        .order('submitted_at', { ascending: false })
    : { data: [] }

  const landcoSetMap: Record<string, Set<string>> = {}
  const quoteRowCountMap: Record<string, number> = {}
  const latestSubmittedAt: Record<string, string> = {}
  for (const row of (quoteRows ?? []) as { request_id: string; landco_id: string; submitted_at: string }[]) {
    if (!landcoSetMap[row.request_id]) landcoSetMap[row.request_id] = new Set()
    landcoSetMap[row.request_id].add(row.landco_id)
    quoteRowCountMap[row.request_id] = (quoteRowCountMap[row.request_id] ?? 0) + 1
    if (!latestSubmittedAt[row.request_id]) {
      latestSubmittedAt[row.request_id] = row.submitted_at
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const allRequests = (raw ?? []).map(r => r as unknown as QuoteRequest)
  // payment_pending과 finalized 모두 selectedInfo 조회 대상
  const nonIngIds = allRequests
    .filter(r => {
      const p = getPhase(r, today)
      return p !== 'ing' && p !== 'cancelled'
    })
    .map(r => r.id)

  const selectedInfoMap: Record<string, SelectedInfo> = {}
  if (nonIngIds.length > 0) {
    const { data: selections } = await admin
      .from('quote_selections')
      .select('request_id, selected_quote_id, landco_id')
      .in('request_id', nonIngIds)

    if (selections && selections.length > 0) {
      const selectedQuoteIds = selections.map((s: { selected_quote_id: string }) => s.selected_quote_id)
      const landcoIds = [...new Set(selections.map((s: { landco_id: string }) => s.landco_id))]

      const [{ data: selectedQuotes }, { data: landcoProfiles }] = await Promise.all([
        admin.from('quotes').select('id, file_url').in('id', selectedQuoteIds),
        admin.from('profiles').select('id, company_name').in('id', landcoIds),
      ])

      const quoteFileMap = Object.fromEntries((selectedQuotes ?? []).map((q: { id: string; file_url: string }) => [q.id, q.file_url]))
      const landcoNameMap = Object.fromEntries((landcoProfiles ?? []).map((p: { id: string; company_name: string }) => [p.id, p.company_name]))
      const selectionMap = Object.fromEntries(selections.map((s: { request_id: string; selected_quote_id: string; landco_id: string }) => [s.request_id, s]))

      await Promise.all(
        nonIngIds.map(async reqId => {
          const sel = selectionMap[reqId]
          if (!sel) return
          const fileUrl = quoteFileMap[sel.selected_quote_id]
          const landcoName = landcoNameMap[sel.landco_id] ?? ''
          const pricing = fileUrl ? await extractQuotePricing(fileUrl) : { total: null, per_person: null }
          selectedInfoMap[reqId] = { landcoName, total: pricing.total, per_person: pricing.per_person }
        })
      )
    }
  }

  const requests: PhasedRequest[] = allRequests.map(req => {
    const phase = getPhase(req, today)
    const dday = getDday(req, phase, today)
    const quoteCount = quoteRowCountMap[req.id] ?? 0
    const landcoCount = landcoSetMap[req.id]?.size ?? 0
    const selectedInfo = selectedInfoMap[req.id]
    return { ...req, phase, dday, quoteCount, landcoCount, ...(selectedInfo ? { selectedInfo } : {}) }
  }).sort((a, b) => {
    const ta = latestSubmittedAt[a.id] ?? a.created_at
    const tb = latestSubmittedAt[b.id] ?? b.created_at
    return tb.localeCompare(ta)
  })

  const counts: Record<TravelPhase, number> = {
    all: requests.length,
    ing: requests.filter(r => r.phase === 'ing').length,
    payment_pending: requests.filter(r => r.phase === 'payment_pending').length,
    confirmed: requests.filter(r => r.phase === 'pre' || r.phase === 'mid').length,
    end: requests.filter(r => r.phase === 'end').length,
    cancelled: requests.filter(r => r.phase === 'cancelled').length,
  }

  return <AgencyDashboardClient requests={requests} counts={counts} />
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(dashboard)/agency/page.tsx
git commit -m "feat: agency page.tsx handles payment_pending phase"
```

---

## Task 6: Agency `DashboardClient.tsx` 업데이트

**Files:**
- Modify: `src/app/(dashboard)/agency/DashboardClient.tsx`

- [ ] **Step 1: 타입, KPI 카드, 섹션, 취소 버튼 조건 업데이트**

아래 4곳을 순서대로 수정한다.

**1-1. 타입 업데이트 (파일 상단)**

```typescript
export type TravelPhase = 'all' | 'ing' | 'payment_pending' | 'confirmed' | 'end' | 'cancelled'

export type PhasedRequest = QuoteRequest & {
  quoteCount: number
  landcoCount: number
  phase: 'ing' | 'payment_pending' | 'pre' | 'mid' | 'end' | 'cancelled'
  dday: number | null
  selectedInfo?: SelectedInfo
}
```

**1-2. KPI_CARDS 배열에 `payment_pending` 카드 추가**

```typescript
const KPI_CARDS: { phase: TravelPhase; label: string; subtext: string; color?: string }[] = [
  { phase: 'all',             label: '전체',          subtext: '모든 요청' },
  { phase: 'ing',             label: '진행 중인 견적',  subtext: '랜드사 견적 대기 중', color: '#2563eb' },
  { phase: 'payment_pending', label: '입금대기',        subtext: '랜드사 입금 확인 중',  color: '#d97706' },
  { phase: 'confirmed',       label: '확정된 견적',    subtext: '여행 전 · 여행 중',   color: '#7c3aed' },
  { phase: 'end',             label: '여행 완료',      subtext: '일정 종료',           color: '#059669' },
  { phase: 'cancelled',       label: '취소한 견적',    subtext: '선택 없이 마감',      color: '#9ca3af' },
]
```

**1-3. `ALL_FILTER_PHASES` 및 `counts` 초기값 수정 (컴포넌트 내부)**

```typescript
type FilterPhase = 'ing' | 'payment_pending' | 'confirmed' | 'end' | 'cancelled'
const ALL_FILTER_PHASES: FilterPhase[] = ['ing', 'payment_pending', 'confirmed', 'end', 'cancelled']
```

`counts` 초기값:
```typescript
const counts: Record<TravelPhase, number> = {
  all: fullyFilteredRequests.length,
  ing: fullyFilteredRequests.filter(r => r.phase === 'ing').length,
  payment_pending: fullyFilteredRequests.filter(r => r.phase === 'payment_pending').length,
  confirmed: fullyFilteredRequests.filter(r => r.phase === 'pre' || r.phase === 'mid').length,
  end: fullyFilteredRequests.filter(r => r.phase === 'end').length,
  cancelled: fullyFilteredRequests.filter(r => r.phase === 'cancelled').length,
}
```

`filteredRequests` 매핑:
```typescript
const filteredRequests = fullyFilteredRequests.filter(r => {
  const key: FilterPhase =
    r.phase === 'pre' || r.phase === 'mid' ? 'confirmed' :
    r.phase === 'payment_pending' ? 'payment_pending' :
    r.phase
  return activePhases.has(key)
})
```

**1-4. SECTIONS 배열에 `payment_pending` 섹션 추가 (ing 다음)**

```typescript
const SECTIONS = [
  {
    key: 'ing' as const,
    label: '진행 중인 견적',
    dotColor: 'bg-blue-500',
    filter: (r: PhasedRequest) => r.phase === 'ing',
  },
  {
    key: 'payment_pending' as const,
    label: '입금대기',
    dotColor: 'bg-amber-500',
    filter: (r: PhasedRequest) => r.phase === 'payment_pending',
  },
  {
    key: 'confirmed' as const,
    label: '확정된 견적',
    dotColor: 'bg-purple-500',
    filter: (r: PhasedRequest) => r.phase === 'pre' || r.phase === 'mid',
  },
  {
    key: 'end' as const,
    label: '여행 완료',
    dotColor: 'bg-green-500',
    filter: (r: PhasedRequest) => r.phase === 'end',
  },
  {
    key: 'cancelled' as const,
    label: '취소한 견적',
    dotColor: 'bg-gray-400',
    filter: (r: PhasedRequest) => r.phase === 'cancelled',
  },
]
```

**1-5. `getBorderColor` 함수에 `payment_pending` 추가**

```typescript
function getBorderColor(req: PhasedRequest): string {
  if (req.phase === 'ing') return '#2563eb'
  if (req.phase === 'payment_pending') return '#d97706'
  if (req.phase === 'pre') return '#7c3aed'
  if (req.phase === 'mid') return '#7c3aed'
  if (req.phase === 'end') return '#059669'
  return '#9ca3af'
}
```

**1-6. 카드 렌더링 내부: `payment_pending` 태그 + 취소 버튼 조건 수정**

태그 영역에 추가 (기존 `isDone = false` 라인 아래 `const isCancelled` 근처):
```tsx
{phase === 'payment_pending' && (
  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">입금대기</span>
)}
```

취소 버튼 조건: `payment_pending`에서도 취소 가능하도록
```tsx
{(phase === 'ing' || phase === 'payment_pending') && (
  <button
    onClick={e => { e.preventDefault(); e.stopPropagation(); setCancelTarget(req.id) }}
    className="text-[11px] text-red-400 hover:text-red-600 font-medium px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
  >
    견적 취소
  </button>
)}
```

- [ ] **Step 2: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "DashboardClient"
```

Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/(dashboard)/agency/DashboardClient.tsx
git commit -m "feat: agency dashboard adds payment_pending KPI, section, and tags"
```

---

## Task 7: Agency `requests/[id]/page.tsx` 업데이트

**Files:**
- Modify: `src/app/(dashboard)/agency/requests/[id]/page.tsx`

- [ ] **Step 1: `handleConfirm` 성공 시 상태 업데이트 수정**

```typescript
async function handleConfirm(landcoId: string, quoteId: string) {
  const res = await fetch('/api/quotes/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: id, landcoId, quoteId }),
  })
  if (res.ok) {
    setSelection({ landco_id: landcoId, selected_quote_id: quoteId, finalized_at: null })
    setRequest(prev => prev ? { ...prev, status: 'payment_pending' } : prev)
  }
}
```

- [ ] **Step 2: 헤더 버튼 영역 수정 — 수정 버튼을 `payment_pending`에서 숨김**

```tsx
<div className="flex gap-2">
  <button
    onClick={() => setShowCopyModal(true)}
    className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-gray-50"
  >
    견적 복사
  </button>
  {request.status !== 'finalized' && request.status !== 'closed' && request.status !== 'payment_pending' && (
    <button
      onClick={() => router.push(`/agency/requests/${id}/edit`)}
      className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-gray-50"
    >
      ✏️ 수정
    </button>
  )}
  {request.status !== 'finalized' && request.status !== 'closed' && (
    <button
      onClick={() => setShowCancelModal(true)}
      className="border border-red-300 text-red-500 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-red-50"
    >
      견적 취소
    </button>
  )}
</div>
```

- [ ] **Step 3: 입금대기 배너 추가 (h2 "랜드사 견적서" 위에)**

```tsx
{request.status === 'payment_pending' && (
  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
    <span className="text-2xl">⏳</span>
    <div>
      <p className="text-sm font-semibold text-amber-700">입금 대기 중입니다</p>
      <p className="text-xs text-amber-600 mt-0.5">랜드사의 입금 확인을 기다리고 있습니다.</p>
    </div>
  </div>
)}
```

- [ ] **Step 4: 확정 버튼 조건 수정**

기존:
```tsx
{selection?.selected_quote_id === q.id && selection.finalized_at ? (
  <span className="bg-purple-100 text-purple-700 ...">최종 확정됨</span>
) : !selection?.finalized_at && (
  <button onClick={() => setConfirmTarget(...)}>이 견적서로 확정</button>
)}
```

변경 후:
```tsx
{selection?.selected_quote_id === q.id && request.status === 'finalized' ? (
  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
    최종 확정됨
  </span>
) : selection?.selected_quote_id === q.id && request.status === 'payment_pending' ? (
  <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-medium">
    입금 대기 중
  </span>
) : request.status !== 'finalized' && request.status !== 'payment_pending' && (
  <button
    onClick={() => setConfirmTarget({ landcoId, quoteId: q.id })}
    className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-blue-700"
  >
    이 견적서로 확정
  </button>
)}
```

- [ ] **Step 5: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "agency/requests/\[id\]"
```

Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(dashboard)/agency/requests/[id]/page.tsx"
git commit -m "feat: agency request detail handles payment_pending state"
```

---

## Task 8: Landco `page.tsx` 업데이트

**Files:**
- Modify: `src/app/(dashboard)/landco/page.tsx`

- [ ] **Step 1: `getPhase()` 및 `getDday()` 타입 + 쿼리 수정**

```typescript
// src/app/(dashboard)/landco/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { LandcoDashboardClient } from './LandcoDashboardClient'
import type { PhasedLandcoRequest } from './LandcoDashboardClient'
import type { QuoteRequest } from '@/lib/supabase/types'

function getPhase(req: QuoteRequest, today: string): 'ing' | 'pre' | 'mid' | 'end' | 'lost' {
  if (req.status !== 'finalized') return 'ing'
  const d = req.depart_date.slice(0, 10)
  const r = req.return_date.slice(0, 10)
  if (today < d) return 'pre'
  if (today > r) return 'end'
  return 'mid'
}

function getDday(req: QuoteRequest, phase: 'ing' | 'pre' | 'mid' | 'end' | 'lost', today: string): number | null {
  if (phase === 'pre') {
    const [ty, tm, td] = today.split('-').map(Number)
    const [dy, dm, dd] = req.depart_date.slice(0, 10).split('-').map(Number)
    return Math.ceil((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000)
  }
  if (phase === 'mid') {
    const [ty, tm, td] = today.split('-').map(Number)
    const [ry, rm, rd] = req.return_date.slice(0, 10).split('-').map(Number)
    return Math.ceil((Date.UTC(ry, rm - 1, rd) - Date.UTC(ty, tm - 1, td)) / 86400000)
  }
  return null
}

export default async function LandcoDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('country_codes').eq('id', user.id).single()

  const countryCodes = (profile?.country_codes ?? []) as string[]

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().slice(0, 10)

  const { data: myQuotesRaw } = await admin
    .from('quotes')
    .select('request_id, submitted_at')
    .eq('landco_id', user.id)
    .order('submitted_at', { ascending: false })

  const latestSubmittedAt = new Map<string, string>()
  for (const q of (myQuotesRaw ?? []) as { request_id: string; submitted_at: string }[]) {
    if (!latestSubmittedAt.has(q.request_id)) {
      latestSubmittedAt.set(q.request_id, q.submitted_at)
    }
  }

  const submittedRequestIds = new Set(latestSubmittedAt.keys())

  const { data: mySelectionsRaw } = await admin
    .from('quote_selections')
    .select('request_id')
    .eq('landco_id', user.id)

  const selectedRequestIds = new Set(
    (mySelectionsRaw ?? []).map((s: { request_id: string }) => s.request_id)
  )

  const { data: myAbandonmentsRaw } = await admin
    .from('quote_abandonments')
    .select('request_id')
    .eq('landco_id', user.id)

  const abandonedRequestIds = new Set(
    (myAbandonmentsRaw ?? []).map((a: { request_id: string }) => a.request_id)
  )

  const { data: openRaw } = await supabase
    .from('quote_requests')
    .select('*')
    .in('destination_country', countryCodes.length > 0 ? countryCodes : ['__none__'])
    .in('status', ['open', 'in_progress'])
    .order('deadline', { ascending: true })

  const openRequestIds = new Set((openRaw ?? []).map((r: { id: string }) => r.id))

  const submittedNotOpen = [...submittedRequestIds].filter(id => !openRequestIds.has(id))

  // payment_pending과 finalized 모두 조회
  const { data: nonOpenRaw } = submittedNotOpen.length > 0
    ? await admin
        .from('quote_requests')
        .select('*')
        .in('id', submittedNotOpen)
        .in('status', ['payment_pending', 'finalized'])
    : { data: [] }

  const openRequests: PhasedLandcoRequest[] = (openRaw ?? []).map(r => {
    const req = r as unknown as QuoteRequest
    if (abandonedRequestIds.has(req.id)) {
      return { ...req, phase: 'abandoned' as const, dday: null, submitted: submittedRequestIds.has(req.id) }
    }
    return { ...req, phase: 'ing' as const, dday: null, submitted: submittedRequestIds.has(req.id) }
  })

  const nonOpenRequests: PhasedLandcoRequest[] = (nonOpenRaw ?? []).map(r => {
    const req = r as unknown as QuoteRequest
    if (!selectedRequestIds.has(req.id)) {
      return { ...req, phase: 'lost' as const, dday: null, submitted: true }
    }
    if (req.status === 'payment_pending') {
      return { ...req, phase: 'payment_pending' as const, dday: null, submitted: true }
    }
    const phase = getPhase(req, today)
    const dday = getDday(req, phase, today)
    return { ...req, phase, dday, submitted: true }
  })

  const requests: PhasedLandcoRequest[] = [...openRequests, ...nonOpenRequests]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return <LandcoDashboardClient requests={requests} />
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(dashboard)/landco/page.tsx
git commit -m "feat: landco page.tsx handles payment_pending phase"
```

---

## Task 9: Landco `LandcoDashboardClient.tsx` 업데이트

**Files:**
- Modify: `src/app/(dashboard)/landco/LandcoDashboardClient.tsx`

- [ ] **Step 1: `PhasedLandcoRequest.phase` 타입 + KPI 카드 + 섹션 업데이트**

**타입 업데이트:**
```typescript
export type LandcoPhase = 'all' | 'ing' | 'payment_pending' | 'confirmed' | 'end' | 'abandoned' | 'lost'

export type PhasedLandcoRequest = QuoteRequest & {
  phase: 'ing' | 'payment_pending' | 'pre' | 'mid' | 'end' | 'lost' | 'abandoned'
  dday: number | null
  submitted: boolean
}
```

**KPI_CARDS 배열에 `payment_pending` 추가** (ing 다음):
```typescript
{ phase: 'payment_pending', label: '입금대기', subtext: '입금 확인 중', color: '#d97706' },
```

**SECTIONS 배열에 `payment_pending` 추가** (ing 다음):
```typescript
{
  key: 'payment_pending' as const,
  label: '입금대기',
  dotColor: 'bg-amber-500',
  filter: (r: PhasedLandcoRequest) => r.phase === 'payment_pending',
},
```

**getBorderColor에 추가:**
```typescript
if (phase === 'payment_pending') return '#d97706'
```

**카드 태그에 `payment_pending` 추가** (기존 `phase === 'lost'` 태그 다음):
```tsx
{phase === 'payment_pending' && (
  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">입금대기</span>
)}
```

**`FilterPhase`, `ALL_FILTER_PHASES`, `filteredRequests` 매핑 업데이트:**
```typescript
type FilterPhase = 'ing' | 'payment_pending' | 'confirmed' | 'end' | 'abandoned' | 'lost'
const ALL_FILTER_PHASES: FilterPhase[] = ['ing', 'payment_pending', 'confirmed', 'end', 'abandoned', 'lost']

// filteredRequests 매핑 (payment_pending 추가)
const filteredRequests = fullyFilteredRequests.filter(r => {
  const key: FilterPhase =
    r.phase === 'pre' || r.phase === 'mid' ? 'confirmed' :
    r.phase === 'payment_pending' ? 'payment_pending' :
    r.phase
  return activePhases.has(key)
})
```

**KPI counts 업데이트** (컴포넌트 내부 counts 계산):
```typescript
const counts: Record<LandcoPhase, number> = {
  all:             fullyFilteredRequests.length,
  ing:             fullyFilteredRequests.filter(r => r.phase === 'ing').length,
  payment_pending: fullyFilteredRequests.filter(r => r.phase === 'payment_pending').length,
  confirmed:       fullyFilteredRequests.filter(r => r.phase === 'pre' || r.phase === 'mid').length,
  end:             fullyFilteredRequests.filter(r => r.phase === 'end').length,
  abandoned:       fullyFilteredRequests.filter(r => r.phase === 'abandoned').length,
  lost:            fullyFilteredRequests.filter(r => r.phase === 'lost').length,
}
```

**KPI 그리드 7개로 변경 (파일 내 `grid-cols-6` → `grid-cols-7`):**
```tsx
<div className="grid grid-cols-7 gap-3 mb-8">
```

- [ ] **Step 2: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "LandcoDashboardClient"
```

Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/(dashboard)/landco/LandcoDashboardClient.tsx
git commit -m "feat: landco dashboard adds payment_pending KPI and section"
```

---

## Task 10: Landco `requests/[id]/page.tsx` 업데이트

**Files:**
- Modify: `src/app/(dashboard)/landco/requests/[id]/page.tsx`

- [ ] **Step 1: `isUploadDisabled` 조건에 `payment_pending` 추가**

```typescript
const isUploadDisabled = request.status === 'finalized' || request.status === 'payment_pending' || isAbandoned
```

- [ ] **Step 2: 입금확인 UI state 추가 (컴포넌트 상단 useState 영역)**

```typescript
const [paymentMemo, setPaymentMemo] = useState('')
const [paymentConfirming, setPaymentConfirming] = useState(false)
const [paymentConfirmed, setPaymentConfirmed] = useState(false)
```

- [ ] **Step 3: 입금확인 핸들러 추가**

```typescript
async function handlePaymentConfirm() {
  setPaymentConfirming(true)
  const res = await fetch('/api/quotes/payment-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: id, memo: paymentMemo || undefined }),
  })
  if (res.ok) {
    setPaymentConfirmed(true)
    setRequest(prev => prev ? { ...prev, status: 'finalized' } : prev)
    setSelectionResult('selected')
  }
  setPaymentConfirming(false)
}
```

- [ ] **Step 4: 입금확인 UI 추가**

선택 결과 배너(selectionResult 배너) 바로 아래, 견적 조건 카드 위에 추가:

```tsx
{/* 입금 확인 섹션 — 랜드사만 표시, payment_pending + 선택됨 */}
{request.status === 'payment_pending' && selectionResult === 'selected' && !paymentConfirmed && (
  <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-amber-200">
    <h2 className="font-semibold text-lg mb-1">입금 확인</h2>
    <p className="text-sm text-gray-500 mb-4">입금이 확인되면 아래 버튼을 눌러 최종 확정 처리해주세요.</p>
    <textarea
      value={paymentMemo}
      onChange={e => setPaymentMemo(e.target.value)}
      placeholder="메모 입력 (선택사항, 내부 기록용)"
      rows={3}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-amber-400 mb-3"
    />
    <div className="flex justify-end">
      <button
        onClick={handlePaymentConfirm}
        disabled={paymentConfirming}
        className="bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {paymentConfirming ? '처리 중...' : '✓ 입금확인 완료'}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: 입금 확인 완료 배너 추가 (paymentConfirmed 상태)**

```tsx
{paymentConfirmed && (
  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
    <span className="text-2xl">✅</span>
    <div>
      <p className="text-sm font-semibold text-amber-700">입금 확인이 완료되었습니다.</p>
      <p className="text-xs text-amber-600 mt-0.5">최종 확정 처리가 완료되었습니다.</p>
    </div>
  </div>
)}
```

- [ ] **Step 6: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "landco/requests/\[id\]"
```

Expected: 출력 없음

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(dashboard)/landco/requests/[id]/page.tsx"
git commit -m "feat: landco request detail adds payment confirm UI"
```

---

## Task 11: FloatingChat 태그 업데이트

**Files:**
- Modify: `src/components/chat/FloatingChat.tsx`

- [ ] **Step 1: `payment_pending` 태그 추가**

```typescript
type RequestPhase = 'pre' | 'mid' | 'end' | 'payment_pending'

function getRequestPhase(req: { status: string; depart_date: string; return_date: string } | undefined): RequestPhase | null {
  if (!req) return null
  const today = new Date().toISOString().slice(0, 10)
  if (req.status === 'payment_pending') return 'payment_pending'
  if (req.status === 'finalized') {
    if (today < req.depart_date) return 'pre'
    if (today <= req.return_date) return 'mid'
    return 'end'
  }
  return null
}

const PHASE_TAG: Record<RequestPhase, { label: string; style: React.CSSProperties }> = {
  payment_pending: { label: '입금대기', style: { backgroundColor: '#fef3c7', color: '#b45309' } },
  pre: { label: '여행전', style: { backgroundColor: '#ede9fe', color: '#6d28d9' } },
  mid: { label: '여행중', style: { backgroundColor: '#fef3c7', color: '#b45309' } },
  end: { label: '여행완료', style: { backgroundColor: '#d1fae5', color: '#065f46' } },
}
```

- [ ] **Step 2: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "FloatingChat"
```

Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/chat/FloatingChat.tsx
git commit -m "feat: chat list shows payment_pending tag"
```

---

## Task 12: 전체 QA

- [ ] **Step 1: 전체 TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 기존과 동일한 에러만 존재 (새로운 에러 없음)

- [ ] **Step 2: Next.js 빌드 확인**

```bash
npm run build 2>&1 | tail -20
```

Expected: 빌드 성공 또는 기존 에러만 존재

- [ ] **Step 3: 시나리오 체크리스트**

| 시나리오 | 기대 결과 |
|---------|---------|
| 여행사가 "이 견적서로 확정" 클릭 | request.status = payment_pending, 확정 버튼 사라짐, 입금대기 배너 표시 |
| 여행사 대시보드 | 입금대기 KPI 카드 + 섹션 표시, 취소 버튼 있음, 수정 버튼 없음 |
| 랜드사 대시보드 | 입금대기 KPI 카드 + 섹션 + 입금대기 태그 표시 |
| 랜드사 요청 상세 | 입금확인 버튼 + 메모 필드 표시, 업로드 비활성화 |
| 랜드사 입금확인 클릭 | status = finalized, 여행전/중/완료로 이동 |
| 채팅 목록 | payment_pending 상태 채팅방에 "입금대기" 태그 표시 |
| 기존 finalized 레코드 | 모두 payment_pending 섹션에 표시 |
