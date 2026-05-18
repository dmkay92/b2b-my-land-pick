# Payment Schedule System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 확정 시 결제 스케줄(계약금/중도금/잔금)을 자동 생성하고 상태를 관리하며, 플랫폼 연동용 함수를 제공한다

**Architecture:** 3개 DB 테이블(payment_schedules, payment_installments, payment_transactions) + 스케줄 생성/관리 유틸 + confirm API에 연결 + agency UI에 스케줄 카드 표시. 실제 PG 연동은 플랫폼에서 처리하며, `addTransaction()` 등 연결점 함수만 export.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL), TypeScript

**Spec:** `docs/superpowers/specs/2026-04-21-payment-schedule-design.md`

**Important:** This is a Next.js 16 project — read `node_modules/next/dist/docs/` before writing new route handlers or pages if unsure about API conventions.

---

## File Structure

### New Files
- `supabase/migrations/20260421000001_payment_schedule.sql` — 3개 테이블 + RLS
- `src/lib/supabase/types.ts` — PaymentSchedule, PaymentInstallment, PaymentTransaction 타입 추가
- `src/lib/payment/schedule.ts` — 스케줄 생성 + 템플릿 로직
- `src/lib/payment/transactions.ts` — addTransaction, cancelInstallment 등 연결점 함수
- `src/lib/payment/__tests__/schedule.test.ts` — 스케줄 생성 로직 테스트
- `src/lib/payment/__tests__/transactions.test.ts` — 거래 로직 테스트
- `src/app/api/payment-schedule/route.ts` — 스케줄 조회 + 즉시완납 전환 API
- `src/app/api/payment-schedule/transaction/route.ts` — 거래 등록 API (플랫폼 연동용)
- `src/components/PaymentScheduleCard.tsx` — 결제 스케줄 UI 카드

### Modified Files
- `src/app/api/quotes/confirm/route.ts` — 견적 확정 시 결제 스케줄 자동 생성 추가
- `src/app/(dashboard)/agency/requests/[id]/page.tsx` — 결제 스케줄 카드 표시

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260421000001_payment_schedule.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Payment schedule system: 3 tables

-- 1. 결제 스케줄
CREATE TABLE payment_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL UNIQUE,
  settlement_id uuid REFERENCES quote_settlements(id),
  template_type text NOT NULL CHECK (template_type IN ('standard', 'large_event', 'immediate')),
  total_amount numeric NOT NULL,
  total_people integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency can read own schedules" ON payment_schedules FOR SELECT
  USING (request_id IN (SELECT id FROM quote_requests WHERE agency_id = (select auth.uid())));
CREATE POLICY "Agency can insert own schedules" ON payment_schedules FOR INSERT
  WITH CHECK (request_id IN (SELECT id FROM quote_requests WHERE agency_id = (select auth.uid())));
CREATE POLICY "Agency can update own schedules" ON payment_schedules FOR UPDATE
  USING (request_id IN (SELECT id FROM quote_requests WHERE agency_id = (select auth.uid())));
CREATE POLICY "Landco can read related schedules" ON payment_schedules FOR SELECT
  USING (settlement_id IN (SELECT id FROM quote_settlements WHERE landco_id = (select auth.uid())));
CREATE POLICY "Admin can manage all schedules" ON payment_schedules FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

-- 2. 결제 단계
CREATE TABLE payment_installments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid REFERENCES payment_schedules(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  rate numeric NOT NULL,
  amount numeric NOT NULL,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  allow_split boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read installments via schedule" ON payment_installments FOR SELECT
  USING (schedule_id IN (SELECT id FROM payment_schedules));
CREATE POLICY "Users can manage installments via schedule" ON payment_installments FOR ALL
  USING (schedule_id IN (SELECT id FROM payment_schedules));

-- 3. 개별 거래
CREATE TABLE payment_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id uuid REFERENCES payment_installments(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('virtual_account', 'card_link', 'card_keyin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  pg_transaction_id text,
  pg_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read transactions via installment" ON payment_transactions FOR SELECT
  USING (installment_id IN (SELECT id FROM payment_installments));
CREATE POLICY "Users can manage transactions via installment" ON payment_transactions FOR ALL
  USING (installment_id IN (SELECT id FROM payment_installments));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260421000001_payment_schedule.sql
git commit -m "feat: add payment_schedules, payment_installments, payment_transactions tables"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add payment types at end of file**

```typescript
export type PaymentTemplateType = 'standard' | 'large_event' | 'immediate'
export type PaymentInstallmentStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled'
export type PaymentTransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled'
export type PaymentMethod = 'virtual_account' | 'card_link' | 'card_keyin'

export interface PaymentSchedule {
  id: string
  request_id: string
  settlement_id: string | null
  template_type: PaymentTemplateType
  total_amount: number
  total_people: number
  created_at: string
  updated_at: string
}

export interface PaymentInstallment {
  id: string
  schedule_id: string
  label: string
  rate: number
  amount: number
  paid_amount: number
  due_date: string
  status: PaymentInstallmentStatus
  allow_split: boolean
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface PaymentTransaction {
  id: string
  installment_id: string
  amount: number
  payment_method: PaymentMethod
  status: PaymentTransactionStatus
  pg_transaction_id: string | null
  pg_response: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add PaymentSchedule, PaymentInstallment, PaymentTransaction types"
```

---

## Task 3: Schedule Creation Utility (TDD)

**Files:**
- Create: `src/lib/payment/schedule.ts`
- Create: `src/lib/payment/__tests__/schedule.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/payment/__tests__/schedule.test.ts`:

```typescript
import {
  getDefaultTemplateType,
  buildInstallments,
  LARGE_EVENT_THRESHOLD,
} from '../schedule'

describe('getDefaultTemplateType', () => {
  it('returns large_event for 50+ people', () => {
    expect(getDefaultTemplateType(50)).toBe('large_event')
    expect(getDefaultTemplateType(100)).toBe('large_event')
  })

  it('returns standard for under 50 people', () => {
    expect(getDefaultTemplateType(49)).toBe('standard')
    expect(getDefaultTemplateType(1)).toBe('standard')
  })
})

describe('buildInstallments', () => {
  const departDate = '2026-06-15'

  it('builds standard (2-step) installments', () => {
    const result = buildInstallments('standard', 10000000, departDate)
    expect(result).toHaveLength(2)

    expect(result[0].label).toBe('계약금')
    expect(result[0].rate).toBe(0.1)
    expect(result[0].amount).toBe(1000000)
    expect(result[0].allow_split).toBe(false)

    expect(result[1].label).toBe('잔금')
    expect(result[1].rate).toBe(0.9)
    expect(result[1].amount).toBe(9000000)
    expect(result[1].due_date).toBe('2026-06-08') // 7 days before departure
    expect(result[1].allow_split).toBe(true)
  })

  it('builds large_event (3-step) installments', () => {
    const result = buildInstallments('large_event', 10000000, departDate)
    expect(result).toHaveLength(3)

    expect(result[0].label).toBe('계약금')
    expect(result[0].rate).toBe(0.1)
    expect(result[0].amount).toBe(1000000)
    expect(result[0].allow_split).toBe(false)

    expect(result[1].label).toBe('중도금')
    expect(result[1].rate).toBe(0.4)
    expect(result[1].amount).toBe(4000000)
    expect(result[1].due_date).toBe('2026-05-16') // 30 days before departure
    expect(result[1].allow_split).toBe(true)

    expect(result[2].label).toBe('잔금')
    expect(result[2].rate).toBe(0.5)
    expect(result[2].amount).toBe(5000000)
    expect(result[2].due_date).toBe('2026-06-08')
    expect(result[2].allow_split).toBe(true)
  })

  it('builds immediate (1-step) installment', () => {
    const result = buildInstallments('immediate', 10000000, departDate)
    expect(result).toHaveLength(1)

    expect(result[0].label).toBe('전액')
    expect(result[0].rate).toBe(1.0)
    expect(result[0].amount).toBe(10000000)
    expect(result[0].allow_split).toBe(true)
  })

  it('rounds amounts to integer', () => {
    const result = buildInstallments('standard', 9999999, departDate)
    expect(result[0].amount).toBe(1000000) // Math.round(9999999 * 0.1)
    expect(result[1].amount).toBe(8999999) // remainder
    expect(result[0].amount + result[1].amount).toBe(9999999)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/payment/__tests__/schedule.test.ts --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement schedule utility**

Create `src/lib/payment/schedule.ts`:

```typescript
import type { PaymentTemplateType } from '@/lib/supabase/types'

export const LARGE_EVENT_THRESHOLD = 50

export function getDefaultTemplateType(totalPeople: number): PaymentTemplateType {
  return totalPeople >= LARGE_EVENT_THRESHOLD ? 'large_event' : 'standard'
}

function daysBeforeDeparture(departDate: string, days: number): string {
  const d = new Date(departDate)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

interface InstallmentDraft {
  label: string
  rate: number
  amount: number
  due_date: string
  allow_split: boolean
}

export function buildInstallments(
  templateType: PaymentTemplateType,
  totalAmount: number,
  departDate: string,
): InstallmentDraft[] {
  const today = new Date().toISOString().slice(0, 10)

  if (templateType === 'immediate') {
    return [{
      label: '전액',
      rate: 1.0,
      amount: totalAmount,
      due_date: today,
      allow_split: true,
    }]
  }

  if (templateType === 'large_event') {
    const deposit = Math.round(totalAmount * 0.1)
    const interim = Math.round(totalAmount * 0.4)
    const balance = totalAmount - deposit - interim
    return [
      { label: '계약금', rate: 0.1, amount: deposit, due_date: today, allow_split: false },
      { label: '중도금', rate: 0.4, amount: interim, due_date: daysBeforeDeparture(departDate, 30), allow_split: true },
      { label: '잔금', rate: 0.5, amount: balance, due_date: daysBeforeDeparture(departDate, 7), allow_split: true },
    ]
  }

  // standard (2-step)
  const deposit = Math.round(totalAmount * 0.1)
  const balance = totalAmount - deposit
  return [
    { label: '계약금', rate: 0.1, amount: deposit, due_date: today, allow_split: false },
    { label: '잔금', rate: 0.9, amount: balance, due_date: daysBeforeDeparture(departDate, 7), allow_split: true },
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/payment/__tests__/schedule.test.ts --no-cache`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/payment/schedule.ts src/lib/payment/__tests__/schedule.test.ts
git commit -m "feat: add payment schedule creation utility with TDD"
```

---

## Task 4: Transaction Utility (TDD)

**Files:**
- Create: `src/lib/payment/transactions.ts`
- Create: `src/lib/payment/__tests__/transactions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/payment/__tests__/transactions.test.ts`:

```typescript
import {
  validateTransaction,
  calculateInstallmentStatus,
} from '../transactions'

describe('validateTransaction', () => {
  it('allows transaction on split-enabled installment', () => {
    const result = validateTransaction({
      allow_split: true,
      amount: 1000000,
      paid_amount: 500000,
      status: 'partial',
      existingTxCount: 1,
    }, 300000)
    expect(result.valid).toBe(true)
  })

  it('blocks second transaction on non-split installment', () => {
    const result = validateTransaction({
      allow_split: false,
      amount: 1000000,
      paid_amount: 0,
      status: 'pending',
      existingTxCount: 1,
    }, 1000000)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('단일')
  })

  it('allows first transaction on non-split installment', () => {
    const result = validateTransaction({
      allow_split: false,
      amount: 1000000,
      paid_amount: 0,
      status: 'pending',
      existingTxCount: 0,
    }, 1000000)
    expect(result.valid).toBe(true)
  })

  it('blocks transaction exceeding remaining amount', () => {
    const result = validateTransaction({
      allow_split: true,
      amount: 1000000,
      paid_amount: 800000,
      status: 'partial',
      existingTxCount: 1,
    }, 300000)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('초과')
  })

  it('blocks transaction on paid installment', () => {
    const result = validateTransaction({
      allow_split: true,
      amount: 1000000,
      paid_amount: 1000000,
      status: 'paid',
      existingTxCount: 2,
    }, 100000)
    expect(result.valid).toBe(false)
  })
})

describe('calculateInstallmentStatus', () => {
  it('returns paid when fully paid', () => {
    expect(calculateInstallmentStatus(1000000, 1000000)).toBe('paid')
  })

  it('returns partial when partially paid', () => {
    expect(calculateInstallmentStatus(1000000, 500000)).toBe('partial')
  })

  it('returns pending when nothing paid', () => {
    expect(calculateInstallmentStatus(1000000, 0)).toBe('pending')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/payment/__tests__/transactions.test.ts --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement transaction utility**

Create `src/lib/payment/transactions.ts`:

```typescript
import type { PaymentInstallmentStatus } from '@/lib/supabase/types'

interface InstallmentContext {
  allow_split: boolean
  amount: number
  paid_amount: number
  status: PaymentInstallmentStatus
  existingTxCount: number
}

export function validateTransaction(
  installment: InstallmentContext,
  txAmount: number,
): { valid: boolean; error?: string } {
  if (installment.status === 'paid') {
    return { valid: false, error: '이미 결제 완료된 단계입니다.' }
  }

  if (installment.status === 'cancelled') {
    return { valid: false, error: '취소된 결제 단계입니다.' }
  }

  if (!installment.allow_split && installment.existingTxCount > 0) {
    return { valid: false, error: '단일 결제만 가능한 단계입니다. (혼합 결제 불가)' }
  }

  const remaining = installment.amount - installment.paid_amount
  if (txAmount > remaining) {
    return { valid: false, error: `결제 금액이 잔여 금액(${remaining}원)을 초과합니다.` }
  }

  return { valid: true }
}

export function calculateInstallmentStatus(
  amount: number,
  paidAmount: number,
): PaymentInstallmentStatus {
  if (paidAmount >= amount) return 'paid'
  if (paidAmount > 0) return 'partial'
  return 'pending'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/payment/__tests__/transactions.test.ts --no-cache`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/payment/transactions.ts src/lib/payment/__tests__/transactions.test.ts
git commit -m "feat: add transaction validation and installment status utilities with TDD"
```

---

## Task 5: Payment Schedule API

**Files:**
- Create: `src/app/api/payment-schedule/route.ts`

- [ ] **Step 1: Create schedule API (GET + PUT)**

GET: returns schedule + installments for a request.
PUT: switches to immediate template.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildInstallments } from '@/lib/payment/schedule'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const { data: schedule } = await supabase
    .from('payment_schedules').select('*').eq('request_id', requestId).maybeSingle()
  if (!schedule) return NextResponse.json({ schedule: null, installments: [] })

  const { data: installments } = await supabase
    .from('payment_installments').select('*')
    .eq('schedule_id', schedule.id).order('rate', { ascending: true })

  return NextResponse.json({ schedule, installments: installments ?? [] })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, templateType } = await request.json()
  if (!requestId || templateType !== 'immediate') {
    return NextResponse.json({ error: 'Only immediate switch is allowed' }, { status: 400 })
  }

  // Get existing schedule
  const { data: schedule } = await supabase
    .from('payment_schedules').select('*').eq('request_id', requestId).single()
  if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

  // Check no installments are already paid
  const { data: installments } = await supabase
    .from('payment_installments').select('status')
    .eq('schedule_id', schedule.id)
  const hasPaid = (installments ?? []).some(i => i.status === 'paid' || i.status === 'partial')
  if (hasPaid) {
    return NextResponse.json({ error: '이미 결제가 진행된 스케줄은 변경할 수 없습니다.' }, { status: 400 })
  }

  // Get departure date
  const { data: qr } = await supabase
    .from('quote_requests').select('depart_date').eq('id', requestId).single()

  // Delete existing installments
  await supabase.from('payment_installments').delete().eq('schedule_id', schedule.id)

  // Create new immediate installment
  const newInstallments = buildInstallments('immediate', schedule.total_amount, qr!.depart_date)
  for (const inst of newInstallments) {
    await supabase.from('payment_installments').insert({
      schedule_id: schedule.id,
      ...inst,
    })
  }

  // Update schedule template type
  await supabase.from('payment_schedules')
    .update({ template_type: 'immediate', updated_at: new Date().toISOString() })
    .eq('id', schedule.id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/payment-schedule/route.ts
git commit -m "feat: add payment schedule API (GET query + PUT immediate switch)"
```

---

## Task 6: Transaction API

**Files:**
- Create: `src/app/api/payment-schedule/transaction/route.ts`

- [ ] **Step 1: Create transaction API (POST)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTransaction, calculateInstallmentStatus } from '@/lib/payment/transactions'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { installmentId, amount, paymentMethod, pgTransactionId, pgResponse } = await request.json()
  if (!installmentId || !amount || !paymentMethod) {
    return NextResponse.json({ error: 'installmentId, amount, paymentMethod required' }, { status: 400 })
  }

  // Get installment
  const { data: installment } = await supabase
    .from('payment_installments').select('*').eq('id', installmentId).single()
  if (!installment) return NextResponse.json({ error: 'Installment not found' }, { status: 404 })

  // Count existing success transactions
  const { count } = await supabase
    .from('payment_transactions').select('id', { count: 'exact', head: true })
    .eq('installment_id', installmentId)
    .in('status', ['pending', 'success'])

  // Validate
  const validation = validateTransaction({
    allow_split: installment.allow_split,
    amount: installment.amount,
    paid_amount: installment.paid_amount,
    status: installment.status,
    existingTxCount: count ?? 0,
  }, amount)

  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // Insert transaction
  const { data: tx, error: txError } = await supabase
    .from('payment_transactions').insert({
      installment_id: installmentId,
      amount,
      payment_method: paymentMethod,
      status: 'success',
      pg_transaction_id: pgTransactionId ?? null,
      pg_response: pgResponse ?? null,
    }).select().single()

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

  // Update installment paid_amount and status
  const newPaidAmount = installment.paid_amount + amount
  const newStatus = calculateInstallmentStatus(installment.amount, newPaidAmount)

  await supabase.from('payment_installments').update({
    paid_amount: newPaidAmount,
    status: newStatus,
    paid_at: newStatus === 'paid' ? new Date().toISOString() : installment.paid_at,
    updated_at: new Date().toISOString(),
  }).eq('id', installmentId)

  // Check if all installments are paid → finalize request
  const { data: schedule } = await supabase
    .from('payment_schedules').select('request_id')
    .eq('id', installment.schedule_id).single()

  const { data: allInstallments } = await supabase
    .from('payment_installments').select('status')
    .eq('schedule_id', installment.schedule_id)

  const allPaid = (allInstallments ?? []).every(i =>
    i.status === 'paid' || i.status === 'cancelled'
  )

  if (allPaid && schedule) {
    await supabase.from('quote_requests')
      .update({ status: 'finalized' }).eq('id', schedule.request_id)
    await supabase.from('quote_selections')
      .update({ finalized_at: new Date().toISOString() }).eq('request_id', schedule.request_id)
  }

  return NextResponse.json({
    success: true,
    transaction: tx,
    installmentStatus: newStatus,
    allPaid,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/payment-schedule/transaction/route.ts
git commit -m "feat: add transaction API with validation, status update, and auto-finalization"
```

---

## Task 7: Integrate with Confirm API

**Files:**
- Modify: `src/app/api/quotes/confirm/route.ts`

- [ ] **Step 1: Add payment schedule creation after settlement**

After the `quote_settlements` upsert (around line 95), before `return NextResponse.json({ success: true })`, add:

```typescript
// Create payment schedule
const { getDefaultTemplateType, buildInstallments } = await import('@/lib/payment/schedule')
const { calculateTotalPeople } = await import('@/lib/utils')

const totalPeople = calculateTotalPeople({
  adults: qr.adults ?? 0, children: qr.children ?? 0,
  infants: qr.infants ?? 0, leaders: qr.leaders ?? 0,
})

// Need full request data for depart_date
const { data: fullRequest } = await supabase
  .from('quote_requests').select('depart_date, adults, children, infants, leaders')
  .eq('id', requestId).single()

const templateType = getDefaultTemplateType(totalPeople)
const installmentDrafts = buildInstallments(templateType, gmv, fullRequest!.depart_date)

// Get settlement ID
const { data: settlement } = await supabase
  .from('quote_settlements').select('id').eq('request_id', requestId).single()

const { data: schedule } = await supabase
  .from('payment_schedules').upsert({
    request_id: requestId,
    settlement_id: settlement?.id ?? null,
    template_type: templateType,
    total_amount: gmv,
    total_people: totalPeople,
  }, { onConflict: 'request_id' }).select().single()

if (schedule) {
  // Delete existing installments (in case of re-confirm)
  await supabase.from('payment_installments').delete().eq('schedule_id', schedule.id)

  for (const inst of installmentDrafts) {
    await supabase.from('payment_installments').insert({
      schedule_id: schedule.id,
      ...inst,
    })
  }
}
```

Note: `qr` only has `agency_id, event_name, status` from the earlier select. We need a second query for `depart_date` and people counts. Also `gmv` is already calculated earlier in the file.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/quotes/confirm/route.ts
git commit -m "feat: auto-create payment schedule on quote confirmation"
```

---

## Task 8: PaymentScheduleCard Component

**Files:**
- Create: `src/components/PaymentScheduleCard.tsx`

- [ ] **Step 1: Create payment schedule UI card**

```tsx
'use client'

import { useState } from 'react'
import type { PaymentSchedule, PaymentInstallment } from '@/lib/supabase/types'

interface Props {
  schedule: PaymentSchedule
  installments: PaymentInstallment[]
  onSwitchToImmediate: () => Promise<void>
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

function statusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">결제완료</span>
    case 'partial':
      return <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">부분결제</span>
    case 'overdue':
      return <span className="text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">기한초과</span>
    case 'cancelled':
      return <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">취소됨</span>
    default:
      return <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">결제대기</span>
  }
}

function templateLabel(type: string) {
  switch (type) {
    case 'large_event': return '대형행사 (3단계)'
    case 'immediate': return '즉시완납'
    default: return '일반 (2단계)'
  }
}

export default function PaymentScheduleCard({ schedule, installments, onSwitchToImmediate }: Props) {
  const [switching, setSwitching] = useState(false)
  const canSwitch = schedule.template_type !== 'immediate'
    && installments.every(i => i.status === 'pending')

  const handleSwitch = async () => {
    setSwitching(true)
    try { await onSwitchToImmediate() } finally { setSwitching(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900">결제 스케줄</h3>
          <span className="text-[11px] text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
            {templateLabel(schedule.template_type)}
          </span>
        </div>
        {canSwitch && (
          <button
            onClick={handleSwitch}
            disabled={switching}
            className="text-xs text-blue-600 border border-blue-300 px-3 py-1 rounded-full hover:bg-blue-50 disabled:opacity-50"
          >
            {switching ? '변경 중...' : '즉시완납 전환'}
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {installments.map((inst, idx) => (
          <div key={inst.id} className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                inst.status === 'partial' ? 'bg-blue-500 text-white' :
                'bg-gray-200 text-gray-500'
              }`}>
                {inst.status === 'paid' ? '✓' : idx + 1}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{inst.label}</span>
                  <span className="text-xs text-gray-400">{Math.round(inst.rate * 100)}%</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  기한: {inst.due_date}
                  {inst.allow_split && <span className="ml-2 text-gray-400">(혼합결제 가능)</span>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-gray-900">{fmt(inst.amount)}원</div>
              <div className="mt-0.5 flex items-center gap-1.5 justify-end">
                {inst.paid_amount > 0 && inst.status !== 'paid' && (
                  <span className="text-[10px] text-gray-400">{fmt(inst.paid_amount)}원 결제됨</span>
                )}
                {statusBadge(inst.status)}
              </div>
              {inst.paid_at && (
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(inst.paid_at).toLocaleString('ko-KR')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
        <span className="text-xs text-gray-500">총 결제금액</span>
        <span className="text-base font-bold text-gray-900">{fmt(schedule.total_amount)}원</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PaymentScheduleCard.tsx
git commit -m "feat: add PaymentScheduleCard UI component"
```

---

## Task 9: Integrate Schedule Card into Agency Request Page

**Files:**
- Modify: `src/app/(dashboard)/agency/requests/[id]/page.tsx`

- [ ] **Step 1: Add schedule state and fetch**

Add import at top:
```typescript
import PaymentScheduleCard from '@/components/PaymentScheduleCard'
import type { PaymentSchedule, PaymentInstallment } from '@/lib/supabase/types'
```

Add state after existing state declarations:
```typescript
const [paymentSchedule, setPaymentSchedule] = useState<PaymentSchedule | null>(null)
const [paymentInstallments, setPaymentInstallments] = useState<PaymentInstallment[]>([])
```

In the `load()` function, after the agency markups fetch block, add:
```typescript
// Fetch payment schedule
const scheduleRes = await fetch(`/api/payment-schedule?requestId=${id}`)
if (scheduleRes.ok) {
  const { schedule, installments } = await scheduleRes.json()
  setPaymentSchedule(schedule)
  setPaymentInstallments(installments ?? [])
}
```

- [ ] **Step 2: Replace the "결제 대기 중" banner with PaymentScheduleCard**

Find the existing payment_pending banner (around line 421-428):
```tsx
{request.status === 'payment_pending' && (
  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
    ...
  </div>
)}
```

Replace with:
```tsx
{(request.status === 'payment_pending' || request.status === 'finalized') && paymentSchedule && (
  <div className="mb-6">
    <PaymentScheduleCard
      schedule={paymentSchedule}
      installments={paymentInstallments}
      onSwitchToImmediate={async () => {
        await fetch('/api/payment-schedule', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: id, templateType: 'immediate' }),
        })
        // Reload schedule
        const res = await fetch(`/api/payment-schedule?requestId=${id}`)
        if (res.ok) {
          const { schedule, installments } = await res.json()
          setPaymentSchedule(schedule)
          setPaymentInstallments(installments ?? [])
        }
      }}
    />
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/agency/requests/\[id\]/page.tsx
git commit -m "feat: show PaymentScheduleCard on agency request detail page"
```

---

## Task 10: Run All Tests and Verify

- [ ] **Step 1: Run all tests**

Run: `npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup and verify all tests pass"
```
