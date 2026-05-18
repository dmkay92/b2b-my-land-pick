# Settlement Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결제완료 installment를 정산 히스토리 테이블(settlement_ledger)로 기록하고, 랜드사/여행사 지급을 독립적으로 관리하는 정산관리 시스템을 구현한다.

**Architecture:** DB 마이그레이션(settlement_ledger 신규 + payment_installments 컬럼 추가) → API 라우트 4개(CRUD + export) → 결제관리 UI 체크박스/벌크 추가 → 정산관리 UI 신규 페이지

**Tech Stack:** Next.js 16, Supabase PostgreSQL, ExcelJS (엑셀 다운로드)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260512000000_settlement_ledger.sql` | settlement_ledger 테이블 + payment_installments 컬럼 추가 |
| Create | `src/app/api/admin/settlement-ledger/bulk-create/route.ts` | 결제완료 → 정산 검토 벌크 생성 |
| Create | `src/app/api/admin/settlement-ledger/route.ts` | 정산 목록 조회 (GET) |
| Create | `src/app/api/admin/settlement-ledger/bulk-update/route.ts` | 상태 벌크 변경 (PATCH) |
| Create | `src/app/api/admin/settlement-ledger/export/route.ts` | 정산 엑셀 다운로드 |
| Create | `src/app/api/admin/payments/export/route.ts` | 결제 엑셀 다운로드 |
| Create | `src/app/(dashboard)/admin/settlement-ledger/page.tsx` | 정산관리 UI 페이지 |
| Modify | `src/app/(dashboard)/admin/payments/page.tsx` | 체크박스 + 벌크 "정산 검토로 넘기기" 추가 |
| Modify | `src/app/api/admin/payments/route.ts` | settlement_status 필터 + request_id 반환 |
| Modify | `src/lib/supabase/types.ts` | SettlementLedger 인터페이스 추가 |
| Modify | `src/app/(dashboard)/admin/layout.tsx` 또는 사이드바 | 정산관리 메뉴 링크 추가 |

---

### Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/20260512000000_settlement_ledger.sql`

- [ ] **Step 1: Create migration file**

```sql
-- settlement_ledger 테이블 생성
CREATE TABLE settlement_ledger (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id             text UNIQUE,
  request_id             uuid REFERENCES quote_requests(id) NOT NULL,
  installment_id         uuid REFERENCES payment_installments(id) NOT NULL UNIQUE,

  installment_label      text NOT NULL,
  installment_rate       numeric NOT NULL,
  paid_amount            numeric NOT NULL,

  platform_fee           numeric NOT NULL DEFAULT 0,
  agency_fee             numeric NOT NULL DEFAULT 0,
  landco_payout_amount   numeric NOT NULL DEFAULT 0,

  landco_payout_status   text NOT NULL DEFAULT 'reviewing'
    CHECK (landco_payout_status IN ('reviewing', 'confirmed', 'paid')),
  landco_confirmed_at    timestamptz,
  landco_paid_at         timestamptz,

  agency_payout_status   text NOT NULL DEFAULT 'accrued'
    CHECK (agency_payout_status IN ('accrued', 'payable', 'paid')),
  agency_paid_at         timestamptz,

  created_by             uuid REFERENCES profiles(id),
  created_at             timestamptz DEFAULT now()
);

-- display_id 자동 생성 트리거
CREATE TRIGGER set_settlement_ledger_display_id
  BEFORE INSERT ON settlement_ledger
  FOR EACH ROW
  WHEN (NEW.display_id IS NULL)
  EXECUTE FUNCTION set_display_id_trigger('SLD');

-- RLS
ALTER TABLE settlement_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on settlement_ledger"
  ON settlement_ledger FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- payment_installments에 request_id, settlement_status 컬럼 추가
ALTER TABLE payment_installments ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES quote_requests(id);
ALTER TABLE payment_installments ADD COLUMN IF NOT EXISTS settlement_status text DEFAULT NULL;

-- 기존 installments에 request_id 백필
UPDATE payment_installments pi
SET request_id = ps.request_id
FROM payment_schedules ps
WHERE pi.schedule_id = ps.id AND pi.request_id IS NULL;
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260512000000_settlement_ledger.sql
git commit -m "feat: add settlement_ledger table and payment_installments columns"
```

---

### Task 2: TypeScript 타입 추가

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add SettlementLedger interface**

At the end of the types file, add:

```typescript
export interface SettlementLedger {
  id: string
  display_id: string | null
  request_id: string
  installment_id: string
  installment_label: string
  installment_rate: number
  paid_amount: number
  platform_fee: number
  agency_fee: number
  landco_payout_amount: number
  landco_payout_status: 'reviewing' | 'confirmed' | 'paid'
  landco_confirmed_at: string | null
  landco_paid_at: string | null
  agency_payout_status: 'accrued' | 'payable' | 'paid'
  agency_paid_at: string | null
  created_by: string | null
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add SettlementLedger type definition"
```

---

### Task 3: Bulk Create API (결제 → 정산 검토)

**Files:**
- Create: `src/app/api/admin/settlement-ledger/bulk-create/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { installmentIds } = await request.json() as { installmentIds: string[] }
  if (!installmentIds?.length) return NextResponse.json({ error: 'installmentIds required' }, { status: 400 })

  const admin = getAdmin()

  // 선택된 installments 조회 (paid이고 settlement_status가 NULL인 것만)
  const { data: installments, error: instErr } = await admin
    .from('payment_installments')
    .select('id, schedule_id, label, rate, amount, paid_amount, request_id')
    .in('id', installmentIds)
    .eq('status', 'paid')
    .is('settlement_status', null)

  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 })
  if (!installments?.length) return NextResponse.json({ error: '정산 가능한 결제 건이 없습니다.' }, { status: 400 })

  // request_id가 없는 경우 schedule에서 가져와서 채움
  for (const inst of installments) {
    if (!inst.request_id) {
      const { data: schedule } = await admin
        .from('payment_schedules').select('request_id').eq('id', inst.schedule_id).single()
      if (schedule) {
        inst.request_id = schedule.request_id
        await admin.from('payment_installments')
          .update({ request_id: schedule.request_id })
          .eq('id', inst.id)
      }
    }
  }

  // 각 installment에 대해 정산 금액 계산
  const ledgerRows = []
  for (const inst of installments) {
    if (!inst.request_id) continue

    // 해당 request의 settlement 정보 조회
    const { data: settlement } = await admin
      .from('quote_settlements')
      .select('platform_fee, agency_commission, gmv')
      .eq('request_id', inst.request_id)
      .maybeSingle()

    let platformFee = 0
    let agencyFee = 0
    let landcoPayoutAmount = Number(inst.paid_amount)

    if (inst.rate > 0 && settlement && Number(settlement.gmv) > 0) {
      // 일반 installment: 비례 계산
      const gmv = Number(settlement.gmv)
      platformFee = Math.round(Number(inst.paid_amount) * (Number(settlement.platform_fee) / gmv))
      agencyFee = Math.round(Number(inst.paid_amount) * (Number(settlement.agency_commission) / gmv))
      landcoPayoutAmount = Number(inst.paid_amount) - platformFee - agencyFee
    }
    // rate = 0 (추가정산/공제): 랜드사 100% 귀속, 수수료 0

    ledgerRows.push({
      request_id: inst.request_id,
      installment_id: inst.id,
      installment_label: inst.label,
      installment_rate: inst.rate,
      paid_amount: inst.paid_amount,
      platform_fee: platformFee,
      agency_fee: agencyFee,
      landco_payout_amount: landcoPayoutAmount,
      landco_payout_status: 'reviewing',
      agency_payout_status: 'accrued',
      created_by: user.id,
    })
  }

  if (!ledgerRows.length) return NextResponse.json({ error: '처리할 건이 없습니다.' }, { status: 400 })

  // settlement_ledger에 벌크 삽입
  const { error: insertErr } = await admin.from('settlement_ledger').insert(ledgerRows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // 원본 installments의 settlement_status 업데이트
  const ids = ledgerRows.map(r => r.installment_id)
  await admin.from('payment_installments')
    .update({ settlement_status: 'reviewing' })
    .in('id', ids)

  return NextResponse.json({ success: true, count: ledgerRows.length })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/settlement-ledger/bulk-create/route.ts
git commit -m "feat: add settlement ledger bulk create API"
```

---

### Task 4: Settlement Ledger 목록 조회 API

**Files:**
- Create: `src/app/api/admin/settlement-ledger/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const params = request.nextUrl.searchParams
  const tab = params.get('tab') ?? 'reviewing' // reviewing | confirmed | landco_paid | agency_payable | agency_paid | all

  let query = admin
    .from('settlement_ledger')
    .select('*')
    .order('created_at', { ascending: false })

  if (tab === 'reviewing') query = query.eq('landco_payout_status', 'reviewing')
  else if (tab === 'confirmed') query = query.eq('landco_payout_status', 'confirmed')
  else if (tab === 'landco_paid') query = query.eq('landco_payout_status', 'paid')
  else if (tab === 'agency_payable') query = query.eq('agency_payout_status', 'payable')
  else if (tab === 'agency_paid') query = query.eq('agency_payout_status', 'paid')
  // 'all' = no filter

  const { data: ledger, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // request 정보 + 프로필 정보 enrichment
  const requestIds = [...new Set((ledger ?? []).map(l => l.request_id))]
  const installmentIds = (ledger ?? []).map(l => l.installment_id)

  const { data: requests } = requestIds.length > 0
    ? await admin.from('quote_requests').select('id, display_id, event_name, depart_date, return_date, created_at').in('id', requestIds)
    : { data: [] }

  const { data: settlements } = requestIds.length > 0
    ? await admin.from('quote_settlements').select('request_id, landco_id, agency_id').in('request_id', requestIds)
    : { data: [] }

  const profileIds = [...new Set([
    ...(settlements ?? []).map(s => s.landco_id),
    ...(settlements ?? []).map(s => s.agency_id),
  ])]
  const { data: profiles } = profileIds.length > 0
    ? await admin.from('profiles').select('id, display_id, company_name').in('id', profileIds)
    : { data: [] }

  const { data: installmentDisplayIds } = installmentIds.length > 0
    ? await admin.from('payment_installments').select('id, display_id').in('id', installmentIds)
    : { data: [] }

  // Maps
  const reqMap = Object.fromEntries((requests ?? []).map(r => [r.id, r]))
  const stlMap = Object.fromEntries((settlements ?? []).map(s => [s.request_id, s]))
  const profMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  const instMap = Object.fromEntries((installmentDisplayIds ?? []).map(i => [i.id, i.display_id]))

  const enriched = (ledger ?? []).map(l => {
    const req = reqMap[l.request_id]
    const stl = stlMap[l.request_id]
    return {
      ...l,
      request_display_id: req?.display_id ?? '',
      event_name: req?.event_name ?? '',
      depart_date: req?.depart_date ?? '',
      return_date: req?.return_date ?? '',
      request_created_at: req?.created_at ?? '',
      installment_display_id: instMap[l.installment_id] ?? '',
      agency_name: stl ? (profMap[stl.agency_id]?.company_name ?? '') : '',
      landco_name: stl ? (profMap[stl.landco_id]?.company_name ?? '') : '',
    }
  })

  return NextResponse.json({ ledger: enriched })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/settlement-ledger/route.ts
git commit -m "feat: add settlement ledger list API with enrichment"
```

---

### Task 5: Bulk Update API (상태 변경)

**Files:**
- Create: `src/app/api/admin/settlement-ledger/bulk-update/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids, action } = await request.json() as {
    ids: string[]
    action: 'confirm' | 'landco_paid' | 'agency_paid'
  }

  if (!ids?.length || !action) {
    return NextResponse.json({ error: 'ids and action required' }, { status: 400 })
  }

  const admin = getAdmin()
  const now = new Date().toISOString()

  let updateData: Record<string, unknown> = {}
  if (action === 'confirm') {
    updateData = { landco_payout_status: 'confirmed', landco_confirmed_at: now }
  } else if (action === 'landco_paid') {
    updateData = { landco_payout_status: 'paid', landco_paid_at: now }
  } else if (action === 'agency_paid') {
    updateData = { agency_payout_status: 'paid', agency_paid_at: now }
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await admin
    .from('settlement_ledger')
    .update(updateData)
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // landco_paid 시 원본 installment settlement_status도 settled로
  if (action === 'landco_paid') {
    const { data: ledgerRows } = await admin
      .from('settlement_ledger')
      .select('installment_id')
      .in('id', ids)
    const instIds = (ledgerRows ?? []).map(r => r.installment_id)
    if (instIds.length > 0) {
      await admin.from('payment_installments')
        .update({ settlement_status: 'settled' })
        .in('id', instIds)
    }
  }

  return NextResponse.json({ success: true, count: ids.length })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/settlement-ledger/bulk-update/route.ts
git commit -m "feat: add settlement ledger bulk update API"
```

---

### Task 6: 여행사 수수료 자동 전환 로직

**Files:**
- Modify: `src/app/api/admin/payments/route.ts`

- [ ] **Step 1: Add agency fee auto-transition after installment paid**

In the PATCH handler, after successfully updating an installment to 'paid', add the agency fee auto-transition check:

```typescript
  // 여행사 수수료 자동 전환: 해당 request의 모든 일반 installment가 paid인지 체크
  if (action === 'paid') {
    const { data: schedule } = await admin
      .from('payment_schedules').select('request_id').eq('id', inst.schedule_id).single()

    if (schedule) {
      const requestId = schedule.request_id

      // 해당 request의 모든 일반 installment(rate > 0) 조회
      const { data: allSchedules } = await admin
        .from('payment_schedules').select('id').eq('request_id', requestId)
      const scheduleIds = (allSchedules ?? []).map(s => s.id)

      const { data: allInsts } = await admin
        .from('payment_installments')
        .select('status, rate')
        .in('schedule_id', scheduleIds)

      const regularInsts = (allInsts ?? []).filter(i => Number(i.rate) > 0)
      const allRegularPaid = regularInsts.length > 0 && regularInsts.every(i => i.status === 'paid')

      if (allRegularPaid) {
        // 해당 request의 settlement_ledger에서 accrued → payable 전환
        await admin
          .from('settlement_ledger')
          .update({ agency_payout_status: 'payable' })
          .eq('request_id', requestId)
          .eq('agency_payout_status', 'accrued')
      }
    }
  }
```

Also add `request_id` to the installment update when marking as paid:

```typescript
  // request_id 자동 채움 (없을 경우)
  if (action === 'paid') {
    const { data: instData } = await admin
      .from('payment_installments').select('request_id, schedule_id').eq('id', installmentId).single()
    if (instData && !instData.request_id) {
      const { data: sch } = await admin
        .from('payment_schedules').select('request_id').eq('id', instData.schedule_id).single()
      if (sch) {
        await admin.from('payment_installments')
          .update({ request_id: sch.request_id })
          .eq('id', installmentId)
      }
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/payments/route.ts
git commit -m "feat: add agency fee auto-transition on full payment"
```

---

### Task 7: 결제관리 UI — 체크박스 + 벌크 액션

**Files:**
- Modify: `src/app/(dashboard)/admin/payments/page.tsx`

- [ ] **Step 1: Add checkbox selection and bulk action**

Changes needed:
1. Add `selectedIds` state: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`
2. Add checkbox column to table header and each row
3. Only show checkbox for `status === 'paid'` and `settlement_status === null`
4. Add "정산 검토로 넘기기" button above table (visible when selections exist)
5. Add `settlement_status` to the `Installment` interface
6. Call `POST /api/admin/settlement-ledger/bulk-create` on bulk action
7. Show settlement_status badge on rows that are already `reviewing` or `settled`

Key UI additions:

```tsx
// State
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

// Bulk action button (above table, shown when selections > 0)
{selectedIds.size > 0 && (
  <button onClick={handleBulkSettlement} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg">
    선택 항목 정산 검토로 넘기기 ({selectedIds.size}건)
  </button>
)}

// Checkbox in table header
<th className="px-4 py-3 w-10">
  <input type="checkbox" onChange={toggleAll} checked={allChecked} />
</th>

// Checkbox in each row (only for eligible rows)
<td className="px-4 py-3">
  {inst.status === 'paid' && !inst.settlement_status && (
    <input type="checkbox" checked={selectedIds.has(inst.id)} onChange={() => toggle(inst.id)} />
  )}
  {inst.settlement_status === 'reviewing' && (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">정산검토중</span>
  )}
  {inst.settlement_status === 'settled' && (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600">정산완료</span>
  )}
</td>
```

- [ ] **Step 2: Add export button for 결제관리 엑셀 다운로드**

```tsx
<button onClick={() => window.open(`/api/admin/payments/export?status=${filter}`, '_blank')}
  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
  엑셀 다운로드
</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/admin/payments/page.tsx
git commit -m "feat: add checkbox selection and bulk settlement action to payments"
```

---

### Task 8: 결제 엑셀 다운로드 API

**Files:**
- Create: `src/app/api/admin/payments/export/route.ts`

- [ ] **Step 1: Create the export API**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const params = request.nextUrl.searchParams
  const status = params.get('status') ?? 'all'

  let query = admin
    .from('payment_installments')
    .select('*, payment_schedules!inner(request_id, quote_requests!inner(display_id, event_name, depart_date, return_date, created_at, agency_id, profiles!quote_requests_agency_id_fkey(company_name)))')
    .order('due_date', { ascending: true })
    .limit(500)

  if (status !== 'all') query = query.eq('status', status)

  const { data: installments } = await query

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('결제 관리')

  ws.columns = [
    { header: '결제ID', key: 'pin', width: 22 },
    { header: '요청ID', key: 'req', width: 22 },
    { header: '행사명', key: 'event', width: 28 },
    { header: '여행사', key: 'agency', width: 16 },
    { header: '항목', key: 'label', width: 16 },
    { header: '금액', key: 'amount', width: 14 },
    { header: '납부액', key: 'paid', width: 14 },
    { header: '납부기한', key: 'due', width: 12 },
    { header: '상태', key: 'status', width: 12 },
    { header: '정산상태', key: 'stl_status', width: 12 },
    { header: '요청일', key: 'req_date', width: 12 },
    { header: '여행시작일', key: 'depart', width: 12 },
    { header: '여행종료일', key: 'return_d', width: 12 },
  ]

  // Header style
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
  })

  for (const inst of (installments ?? [])) {
    const qr = (inst as Record<string, unknown>).payment_schedules as Record<string, unknown> | undefined
    const req = qr?.quote_requests as Record<string, unknown> | undefined
    const agency = req?.profiles as Record<string, unknown> | undefined

    ws.addRow({
      pin: inst.display_id ?? '',
      req: (req?.display_id as string) ?? '',
      event: (req?.event_name as string) ?? '',
      agency: (agency?.company_name as string) ?? '',
      label: inst.label,
      amount: Number(inst.amount),
      paid: Number(inst.paid_amount),
      due: inst.due_date,
      status: inst.status,
      stl_status: inst.settlement_status ?? '미처리',
      req_date: req?.created_at ? (req.created_at as string).slice(0, 10) : '',
      depart: (req?.depart_date as string) ?? '',
      return_d: (req?.return_date as string) ?? '',
    })
  }

  ;['amount', 'paid'].forEach(key => {
    const col = ws.columns.findIndex(c => c.key === key) + 1
    if (col) ws.getColumn(col).numFmt = '#,##0'
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payments_${new Date().toISOString().slice(0,10)}.xlsx"`,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/payments/export/route.ts
git commit -m "feat: add payments excel export API"
```

---

### Task 9: 정산관리 UI 페이지

**Files:**
- Create: `src/app/(dashboard)/admin/settlement-ledger/page.tsx`

- [ ] **Step 1: Create the settlement ledger page**

This is the largest task. The page needs:

1. **Tab navigation:** 검토중 | 확정 | 랜드사 지급완료 | 여행사 지급대기 | 여행사 지급완료 | 전체
2. **Table** with columns: 요청ID | 정산ID | 결제ID | 행사명 | 여행사 | 랜드사 | 항목 | 납부액 | 플랫폼수수료 | 여행사수수료 | 랜드사정산금 | 랜드사상태 | 여행사상태 | 생성일
3. **Checkbox multi-select** on each row
4. **Bulk action buttons** (context-dependent per tab):
   - 검토중 → "정산 확정"
   - 확정 → "랜드사 지급완료"
   - 여행사 지급대기 → "여행사 지급완료"
5. **Excel download button**
6. **Filters:** daterange, 여행사/랜드사 검색

The page follows the same pattern as `admin/payments/page.tsx` — client component with useState, useEffect, fetch.

```typescript
'use client'

import { useEffect, useState } from 'react'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

type Tab = 'reviewing' | 'confirmed' | 'landco_paid' | 'agency_payable' | 'agency_paid' | 'all'

interface LedgerRow {
  id: string
  display_id: string | null
  request_id: string
  installment_id: string
  installment_label: string
  installment_rate: number
  paid_amount: number
  platform_fee: number
  agency_fee: number
  landco_payout_amount: number
  landco_payout_status: string
  agency_payout_status: string
  landco_confirmed_at: string | null
  landco_paid_at: string | null
  agency_paid_at: string | null
  created_at: string
  // enriched
  request_display_id: string
  event_name: string
  depart_date: string
  return_date: string
  installment_display_id: string
  agency_name: string
  landco_name: string
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'reviewing', label: '검토중' },
  { key: 'confirmed', label: '확정' },
  { key: 'landco_paid', label: '랜드사 지급완료' },
  { key: 'agency_payable', label: '여행사 지급대기' },
  { key: 'agency_paid', label: '여행사 지급완료' },
  { key: 'all', label: '전체' },
]

export default function SettlementLedgerPage() {
  const [tab, setTab] = useState<Tab>('reviewing')
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    setSelectedIds(new Set())
    const res = await fetch(`/api/admin/settlement-ledger?tab=${tab}`)
    if (res.ok) {
      const { ledger } = await res.json()
      setRows(ledger ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [tab])

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === rows.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(rows.map(r => r.id)))
  }

  async function handleBulkAction(action: 'confirm' | 'landco_paid' | 'agency_paid') {
    const labels = { confirm: '정산 확정', landco_paid: '랜드사 지급완료', agency_paid: '여행사 지급완료' }
    if (!confirm(`${selectedIds.size}건을 ${labels[action]} 처리하시겠습니까?`)) return
    await fetch('/api/admin/settlement-ledger/bulk-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds], action }),
    })
    load()
  }

  const landcoStatusBadge = (status: string) => {
    switch (status) {
      case 'reviewing': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">검토중</span>
      case 'confirmed': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">확정</span>
      case 'paid': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">지급완료</span>
      default: return null
    }
  }

  const agencyStatusBadge = (status: string) => {
    switch (status) {
      case 'accrued': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">적립</span>
      case 'payable': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">지급대기</span>
      case 'paid': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">지급완료</span>
      default: return null
    }
  }

  const bulkAction = tab === 'reviewing' ? 'confirm'
    : tab === 'confirmed' ? 'landco_paid'
    : tab === 'agency_payable' ? 'agency_paid'
    : null

  const bulkLabel = tab === 'reviewing' ? '정산 확정'
    : tab === 'confirmed' ? '랜드사 지급완료'
    : tab === 'agency_payable' ? '여행사 지급완료'
    : ''

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">정산 관리</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Bulk action + Export */}
      <div className="flex gap-2 mb-4">
        {bulkAction && selectedIds.size > 0 && (
          <button onClick={() => handleBulkAction(bulkAction)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            {bulkLabel} ({selectedIds.size}건)
          </button>
        )}
        <button onClick={() => window.open(`/api/admin/settlement-ledger/export?tab=${tab}`, '_blank')}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
          엑셀 다운로드
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {bulkAction && <th className="px-3 py-3 w-10"><input type="checkbox" onChange={toggleAll} checked={rows.length > 0 && selectedIds.size === rows.length} /></th>}
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">요청ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">정산ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">결제ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">행사명</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">여행사</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">랜드사</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">항목</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">납부액</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">플랫폼수수료</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">여행사수수료</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">랜드사정산금</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">랜드사상태</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">여행사상태</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">생성일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={15} className="text-center py-8 text-gray-400 text-sm">로딩 중...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={15} className="text-center py-8 text-gray-400 text-sm">데이터가 없습니다.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                {bulkAction && (
                  <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} /></td>
                )}
                <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.request_display_id}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.display_id}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.installment_display_id}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{r.event_name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{r.agency_name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{r.landco_name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{r.installment_label}</td>
                <td className="px-4 py-3 text-sm text-right font-medium">{fmt(Number(r.paid_amount))}원</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{fmt(Number(r.platform_fee))}원</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{fmt(Number(r.agency_fee))}원</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">{fmt(Number(r.landco_payout_amount))}원</td>
                <td className="px-4 py-3 text-center">{landcoStatusBadge(r.landco_payout_status)}</td>
                <td className="px-4 py-3 text-center">{agencyStatusBadge(r.agency_payout_status)}</td>
                <td className="px-4 py-3 text-xs text-center text-gray-400">{r.created_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/admin/settlement-ledger/page.tsx
git commit -m "feat: add settlement ledger admin UI page"
```

---

### Task 10: 정산 엑셀 다운로드 API

**Files:**
- Create: `src/app/api/admin/settlement-ledger/export/route.ts`

- [ ] **Step 1: Create the export API**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const params = request.nextUrl.searchParams
  const tab = params.get('tab') ?? 'all'

  // Fetch ledger (same logic as list API)
  let query = admin.from('settlement_ledger').select('*').order('created_at', { ascending: false })
  if (tab === 'reviewing') query = query.eq('landco_payout_status', 'reviewing')
  else if (tab === 'confirmed') query = query.eq('landco_payout_status', 'confirmed')
  else if (tab === 'landco_paid') query = query.eq('landco_payout_status', 'paid')
  else if (tab === 'agency_payable') query = query.eq('agency_payout_status', 'payable')
  else if (tab === 'agency_paid') query = query.eq('agency_payout_status', 'paid')

  const { data: ledger } = await query

  // Enrichment
  const requestIds = [...new Set((ledger ?? []).map(l => l.request_id))]
  const installmentIds = (ledger ?? []).map(l => l.installment_id)

  const { data: requests } = requestIds.length > 0
    ? await admin.from('quote_requests').select('id, display_id, event_name, depart_date, return_date, created_at').in('id', requestIds)
    : { data: [] }
  const { data: settlements } = requestIds.length > 0
    ? await admin.from('quote_settlements').select('request_id, landco_id, agency_id').in('request_id', requestIds)
    : { data: [] }
  const profileIds = [...new Set([...(settlements ?? []).map(s => s.landco_id), ...(settlements ?? []).map(s => s.agency_id)])]
  const { data: profiles } = profileIds.length > 0
    ? await admin.from('profiles').select('id, company_name').in('id', profileIds)
    : { data: [] }
  const { data: instDisplayIds } = installmentIds.length > 0
    ? await admin.from('payment_installments').select('id, display_id').in('id', installmentIds)
    : { data: [] }

  const reqMap = Object.fromEntries((requests ?? []).map(r => [r.id, r]))
  const stlMap = Object.fromEntries((settlements ?? []).map(s => [s.request_id, s]))
  const profMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  const instMap = Object.fromEntries((instDisplayIds ?? []).map(i => [i.id, i.display_id]))

  const statusLabels: Record<string, string> = {
    reviewing: '검토중', confirmed: '확정', paid: '지급완료',
    accrued: '적립', payable: '지급대기',
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('정산 관리')

  ws.columns = [
    { header: '요청ID', key: 'req_id', width: 22 },
    { header: '정산ID', key: 'sld_id', width: 22 },
    { header: '결제ID', key: 'pin_id', width: 22 },
    { header: '행사명', key: 'event', width: 28 },
    { header: '여행사', key: 'agency', width: 16 },
    { header: '랜드사', key: 'landco', width: 16 },
    { header: '항목', key: 'label', width: 16 },
    { header: '납부액', key: 'paid', width: 14 },
    { header: '플랫폼수수료', key: 'pf', width: 14 },
    { header: '여행사수수료', key: 'af', width: 14 },
    { header: '랜드사정산금', key: 'lp', width: 14 },
    { header: '랜드사상태', key: 'l_status', width: 12 },
    { header: '여행사상태', key: 'a_status', width: 12 },
    { header: '요청일', key: 'req_date', width: 12 },
    { header: '여행시작일', key: 'depart', width: 12 },
    { header: '여행종료일', key: 'return_d', width: 12 },
    { header: '생성일', key: 'created', width: 12 },
  ]

  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
  })

  for (const l of (ledger ?? [])) {
    const req = reqMap[l.request_id]
    const stl = stlMap[l.request_id]
    ws.addRow({
      req_id: req?.display_id ?? '',
      sld_id: l.display_id ?? '',
      pin_id: instMap[l.installment_id] ?? '',
      event: req?.event_name ?? '',
      agency: stl ? (profMap[stl.agency_id]?.company_name ?? '') : '',
      landco: stl ? (profMap[stl.landco_id]?.company_name ?? '') : '',
      label: l.installment_label,
      paid: Number(l.paid_amount),
      pf: Number(l.platform_fee),
      af: Number(l.agency_fee),
      lp: Number(l.landco_payout_amount),
      l_status: statusLabels[l.landco_payout_status] ?? l.landco_payout_status,
      a_status: statusLabels[l.agency_payout_status] ?? l.agency_payout_status,
      req_date: req?.created_at ? req.created_at.slice(0, 10) : '',
      depart: req?.depart_date ?? '',
      return_d: req?.return_date ?? '',
      created: l.created_at.slice(0, 10),
    })
  }

  ;['paid', 'pf', 'af', 'lp'].forEach(key => {
    const col = ws.columns.findIndex(c => c.key === key) + 1
    if (col) ws.getColumn(col).numFmt = '#,##0'
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="settlement_ledger_${new Date().toISOString().slice(0,10)}.xlsx"`,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/settlement-ledger/export/route.ts
git commit -m "feat: add settlement ledger excel export API"
```

---

### Task 11: Admin 사이드바에 정산관리 메뉴 추가

**Files:**
- Modify: admin layout or sidebar component

- [ ] **Step 1: Find and modify admin navigation**

Search for existing admin menu items (결제 관리, 정산 관리 등) and add a "정산 관리" link pointing to `/admin/settlement-ledger`. Place it after the existing 정산 관리 or 결제 관리 link.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add settlement ledger link to admin sidebar"
```

---

### Task 12: Final Build Verification

- [ ] **Step 1: Run build**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build succeeds

- [ ] **Step 2: Fix any build errors**

- [ ] **Step 3: Commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve build errors from settlement ledger implementation"
```
