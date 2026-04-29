# 추가 정산 기능 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행 확정 후 랜드사가 추가 비용을 요청하고 여행사가 승인하면 결제 회차가 자동 생성되는 추가 정산 기능

**Architecture:** 새 테이블 `additional_settlements` + 3개 API endpoint + 랜드사/여행사 양쪽 UI + 알림/채팅 연동. 승인 시 기존 `payment_installments`에 회차 추가.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL), TypeScript, Tailwind CSS

---

### Task 1: DB 스키마 + 타입 정의

**Files:**
- Create: `supabase/migrations/20260429000001_additional_settlements.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
CREATE TABLE additional_settlements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL,
  landco_id uuid REFERENCES profiles(id) NOT NULL,
  sequence_number int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  items jsonb NOT NULL DEFAULT '[]',
  memo text,
  receipt_urls text[] DEFAULT '{}',
  total_amount numeric NOT NULL DEFAULT 0,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE additional_settlements ENABLE ROW LEVEL SECURITY;

GRANT ALL ON additional_settlements TO service_role;
GRANT ALL ON additional_settlements TO authenticated;
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

- [ ] **Step 3: 타입 정의 추가**

`src/lib/supabase/types.ts`에 추가:

```typescript
export interface AdditionalSettlementItem {
  name: string
  amount: number
}

export interface AdditionalSettlement {
  id: string
  request_id: string
  landco_id: string
  sequence_number: number
  status: 'pending' | 'approved' | 'rejected'
  items: AdditionalSettlementItem[]
  memo: string | null
  receipt_urls: string[]
  total_amount: number
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}
```

- [ ] **Step 4: 알림 타입 추가**

`src/components/notifications/NotificationBell.tsx`의 `TYPE_LABEL`에 추가:

```typescript
  additional_settlement_request: '추가 정산 요청이 접수되었습니다',
  additional_settlement_approved: '추가 정산이 승인되었습니다',
  additional_settlement_rejected: '추가 정산이 거부되었습니다',
```

---

### Task 2: 추가 정산 API — 생성 + 목록 조회

**Files:**
- Create: `src/app/api/additional-settlements/route.ts`

- [ ] **Step 1: POST (랜드사 요청 생성) + GET (목록 조회) 구현**

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

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const admin = getAdmin()
  const { data } = await admin
    .from('additional_settlements')
    .select('*')
    .eq('request_id', requestId)
    .order('sequence_number', { ascending: true })

  return NextResponse.json({ settlements: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, items, memo, receiptUrls } = await request.json() as {
    requestId: string
    items: { name: string; amount: number }[]
    memo?: string
    receiptUrls?: string[]
  }

  if (!requestId || !items || items.length === 0) {
    return NextResponse.json({ error: 'requestId와 항목이 필요합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  // 1. request가 finalized인지 확인
  const { data: qr } = await admin
    .from('quote_requests').select('status, agency_id, event_name').eq('id', requestId).single()
  if (qr?.status !== 'finalized') {
    return NextResponse.json({ error: '여행 확정 상태에서만 추가 정산을 요청할 수 있습니다.' }, { status: 400 })
  }

  // 2. 현재 유저가 선택된 랜드사인지 확인
  const { data: sel } = await admin
    .from('quote_selections').select('landco_id').eq('request_id', requestId).single()
  if (!sel || sel.landco_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  // 3. sequence_number 계산
  const { data: existing } = await admin
    .from('additional_settlements').select('sequence_number')
    .eq('request_id', requestId).order('sequence_number', { ascending: false }).limit(1)
  const nextSeq = existing && existing.length > 0 ? existing[0].sequence_number + 1 : 1

  // 4. 합계 계산
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  // 5. insert
  const { data: settlement, error: insertError } = await admin
    .from('additional_settlements')
    .insert({
      request_id: requestId,
      landco_id: user.id,
      sequence_number: nextSeq,
      items,
      memo: memo || null,
      receipt_urls: receiptUrls ?? [],
      total_amount: totalAmount,
    })
    .select().single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // 6. 여행사에 알림
  await admin.from('notifications').insert({
    user_id: qr.agency_id,
    type: 'additional_settlement_request',
    payload: { request_id: requestId, settlement_id: settlement.id, event_name: qr.event_name },
  })

  // 7. 채팅 메시지
  let { data: room } = await admin
    .from('chat_rooms').select('id')
    .eq('request_id', requestId).eq('landco_id', user.id).maybeSingle()

  if (!room) {
    const { data: newRoom } = await admin
      .from('chat_rooms')
      .upsert({ request_id: requestId, agency_id: qr.agency_id, landco_id: user.id }, { onConflict: 'request_id,landco_id' })
      .select('id').single()
    room = newRoom
  }

  if (room) {
    const itemSummary = items.map(i => i.name).join(', ')
    await admin.from('messages').insert({
      room_id: room.id,
      sender_id: user.id,
      content: `추가 정산을 요청했습니다. (${items.length}건, 총 ${totalAmount.toLocaleString('ko-KR')}원 — ${itemSummary})`,
      message_type: 'additional_settlement',
      metadata: { settlement_id: settlement.id, request_id: requestId },
    })
  }

  return NextResponse.json({ settlement }, { status: 201 })
}
```

---

### Task 3: 추가 정산 API — 승인/거부

**Files:**
- Create: `src/app/api/additional-settlements/[id]/review/route.ts`

- [ ] **Step 1: POST 구현**

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action } = await request.json() as { action: 'approve' | 'reject' }

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action은 approve 또는 reject이어야 합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  // 1. 추가 정산 조회
  const { data: settlement } = await admin
    .from('additional_settlements').select('*').eq('id', id).single()
  if (!settlement) return NextResponse.json({ error: '추가 정산을 찾을 수 없습니다.' }, { status: 404 })
  if (settlement.status !== 'pending') {
    return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 })
  }

  // 2. 여행사 권한 확인
  const { data: qr } = await admin
    .from('quote_requests').select('agency_id, event_name').eq('id', settlement.request_id).single()
  if (qr?.agency_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  // 3. 상태 업데이트
  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  await admin.from('additional_settlements').update({
    status: newStatus,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)

  // 4. 승인 시: 결제 회차 추가
  if (action === 'approve') {
    const { data: schedule } = await admin
      .from('payment_schedules').select('id, total_amount').eq('request_id', settlement.request_id).single()

    if (schedule) {
      // 새 installment 추가
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 7)

      await admin.from('payment_installments').insert({
        schedule_id: schedule.id,
        label: `추가 정산 #${settlement.sequence_number}`,
        rate: 0,
        amount: settlement.total_amount,
        paid_amount: 0,
        due_date: dueDate.toISOString().slice(0, 10),
        status: 'pending',
      })

      // total_amount 업데이트
      await admin.from('payment_schedules').update({
        total_amount: schedule.total_amount + settlement.total_amount,
        updated_at: new Date().toISOString(),
      }).eq('id', schedule.id)
    }
  }

  // 5. 랜드사에 알림
  const notifType = action === 'approve' ? 'additional_settlement_approved' : 'additional_settlement_rejected'
  await admin.from('notifications').insert({
    user_id: settlement.landco_id,
    type: notifType,
    payload: { request_id: settlement.request_id, settlement_id: id, event_name: qr?.event_name },
  })

  // 6. 채팅 메시지
  const { data: room } = await admin
    .from('chat_rooms').select('id')
    .eq('request_id', settlement.request_id).eq('landco_id', settlement.landco_id).maybeSingle()

  if (room) {
    const content = action === 'approve'
      ? `추가 정산 #${settlement.sequence_number}이 승인되었습니다. (총 ${settlement.total_amount.toLocaleString('ko-KR')}원)`
      : `추가 정산 #${settlement.sequence_number}이 거부되었습니다.`

    await admin.from('messages').insert({
      room_id: room.id,
      sender_id: user.id,
      content,
      message_type: action === 'approve' ? 'additional_settlement_approved' : 'additional_settlement_rejected',
      metadata: { settlement_id: id, request_id: settlement.request_id },
    })
  }

  return NextResponse.json({ success: true, status: newStatus })
}
```

---

### Task 4: 랜드사 UI — 추가 정산 섹션 + 요청 모달

**Files:**
- Create: `src/components/AdditionalSettlementSection.tsx`
- Modify: `src/app/(dashboard)/landco/requests/[id]/page.tsx`

- [ ] **Step 1: 컴포넌트 생성**

`src/components/AdditionalSettlementSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { AdditionalSettlement } from '@/lib/supabase/types'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

interface Props {
  requestId: string
  settlements: AdditionalSettlement[]
  onCreated: () => void
  role: 'landco' | 'agency'
}

export default function AdditionalSettlementSection({ requestId, settlements, onCreated, role }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [items, setItems] = useState<{ name: string; amount: number }[]>([{ name: '', amount: 0 }])
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  function addItem() { setItems(prev => [...prev, { name: '', amount: 0 }]) }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: 'name' | 'amount', value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

  async function handleSubmit() {
    if (items.some(i => !i.name.trim() || !i.amount)) return
    setSubmitting(true)
    const res = await fetch('/api/additional-settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, items: items.map(i => ({ name: i.name, amount: Number(i.amount) })), memo: memo || undefined }),
    })
    setSubmitting(false)
    if (res.ok) {
      setShowModal(false)
      setItems([{ name: '', amount: 0 }])
      setMemo('')
      onCreated()
    } else {
      const json = await res.json().catch(() => ({}))
      alert(json.error || '요청에 실패했습니다.')
    }
  }

  async function handleReview(settlementId: string, action: 'approve' | 'reject') {
    setReviewingId(settlementId)
    await fetch(`/api/additional-settlements/${settlementId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setReviewingId(null)
    onCreated()
  }

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
        <h3 className="text-sm font-bold text-white">추가 정산</h3>
        {role === 'landco' && (
          <button
            onClick={() => setShowModal(true)}
            className="text-xs font-medium text-white bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
          >
            + 요청하기
          </button>
        )}
      </div>

      <div className="bg-white">
        {settlements.length === 0 ? (
          <p className="text-xs text-gray-400 px-5 py-4">추가 정산 내역이 없습니다.</p>
        ) : (
          settlements.map(s => (
            <div key={s.id} className="px-5 py-4 border-b border-gray-50 last:border-b-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">추가 정산 #{s.sequence_number}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    s.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                    s.status === 'rejected' ? 'bg-red-50 text-red-600' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {s.status === 'approved' ? '승인됨' : s.status === 'rejected' ? '거부됨' : '검토중'}
                  </span>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmt(s.total_amount)}원</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {s.items.map((item, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {item.name} {fmt(item.amount)}원
                  </span>
                ))}
              </div>
              {s.memo && <p className="text-xs text-gray-400 mt-1">{s.memo}</p>}

              {role === 'agency' && s.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    disabled={reviewingId === s.id}
                    onClick={() => handleReview(s.id, 'reject')}
                    className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    거부
                  </button>
                  <button
                    disabled={reviewingId === s.id}
                    onClick={() => handleReview(s.id, 'approve')}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    승인
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 요청 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">추가 정산 요청</h3>
              <p className="text-xs text-gray-500 mt-0.5">여행 중 발생한 추가 비용을 요청합니다.</p>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={item.name}
                    onChange={e => updateItem(idx, 'name', e.target.value)}
                    placeholder="항목명"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <div className="relative w-32">
                    <input
                      type="number"
                      value={item.amount || ''}
                      onChange={e => updateItem(idx, 'amount', Number(e.target.value))}
                      placeholder="금액"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right pr-6 focus:outline-none focus:border-blue-400"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-400 text-lg">-</button>
                  )}
                </div>
              ))}

              <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ 항목 추가</button>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">메모 (선택)</label>
                <textarea
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  placeholder="추가 설명이 있으면 입력해주세요"
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-xs text-gray-500">합계</span>
                <span className="text-base font-bold text-gray-900">{fmt(total)}원</span>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setItems([{ name: '', amount: 0 }]); setMemo('') }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || items.some(i => !i.name.trim() || !i.amount) || total === 0}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting ? '제출 중...' : `${fmt(total)}원 요청`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 랜드사 페이지에 통합**

`src/app/(dashboard)/landco/requests/[id]/page.tsx`에서:

1. import 추가:
```typescript
import AdditionalSettlementSection from '@/components/AdditionalSettlementSection'
import type { AdditionalSettlement } from '@/lib/supabase/types'
```

2. state 추가:
```typescript
const [additionalSettlements, setAdditionalSettlements] = useState<AdditionalSettlement[]>([])
```

3. 데이터 로드 (기존 useEffect 안, payment schedule 로드 후):
```typescript
// 추가 정산 로드
if (json.request?.status === 'finalized') {
  const addRes = await fetch(`/api/additional-settlements?requestId=${id}`)
  if (addRes.ok) {
    const { settlements } = await addRes.json()
    setAdditionalSettlements(settlements ?? [])
  }
}
```

4. JSX — 결제 현황 섹션 바로 아래에 추가 (finalized일 때만):
```tsx
{request.status === 'finalized' && selectionResult === 'selected' && (
  <AdditionalSettlementSection
    requestId={id}
    settlements={additionalSettlements}
    onCreated={async () => {
      const res = await fetch(`/api/additional-settlements?requestId=${id}`)
      if (res.ok) {
        const { settlements } = await res.json()
        setAdditionalSettlements(settlements ?? [])
      }
    }}
    role="landco"
  />
)}
```

---

### Task 5: 여행사 UI — 추가 정산 검토

**Files:**
- Modify: `src/app/(dashboard)/agency/requests/[id]/page.tsx`

- [ ] **Step 1: 여행사 페이지에 통합**

1. import 추가:
```typescript
import AdditionalSettlementSection from '@/components/AdditionalSettlementSection'
import type { AdditionalSettlement } from '@/lib/supabase/types'
```

2. state 추가:
```typescript
const [additionalSettlements, setAdditionalSettlements] = useState<AdditionalSettlement[]>([])
```

3. 데이터 로드 (기존 useEffect 안, payment schedule 로드 후):
```typescript
// 추가 정산 로드
if (json.request?.status === 'finalized') {
  const addRes = await fetch(`/api/additional-settlements?requestId=${id}`)
  if (addRes.ok) {
    const { settlements } = await addRes.json()
    setAdditionalSettlements(settlements ?? [])
  }
}
```

4. JSX — PaymentScheduleCard 바로 아래에 추가 (finalized일 때만):
```tsx
{request.status === 'finalized' && (
  <AdditionalSettlementSection
    requestId={id}
    settlements={additionalSettlements}
    onCreated={async () => {
      const res = await fetch(`/api/additional-settlements?requestId=${id}`)
      if (res.ok) {
        const { settlements } = await res.json()
        setAdditionalSettlements(settlements ?? [])
      }
      // 결제 스케줄도 새로고침 (승인 시 회차 추가됨)
      const schedRes = await fetch(`/api/payment-schedule?requestId=${id}`)
      if (schedRes.ok) {
        const { schedule, installments } = await schedRes.json()
        setPaymentSchedule(schedule)
        setPaymentInstallments(installments ?? [])
      }
    }}
    role="agency"
  />
)}
```

---

### Task 6: 알림에 추가 정산 액션 추가

**Files:**
- Modify: `src/components/notifications/NotificationBell.tsx`

- [ ] **Step 1: 여행사 알림에 승인/거부 버튼 추가**

기존 `post_travel_approval_request` 패턴과 동일하게, `additional_settlement_request` 알림에 승인/거부 버튼 추가:

```tsx
{n.type === 'additional_settlement_request' && n.payload.settlement_id && (
  actionResults[n.id] ? (
    <div className={`mt-2 text-xs font-medium px-3 py-1.5 rounded-md inline-block ${
      actionResults[n.id] === 'approved'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-red-50 text-red-600'
    }`}>
      {actionResults[n.id] === 'approved' ? '승인 완료' : '거부 완료'}
    </div>
  ) : (
    <div className="flex gap-2 mt-2">
      <button
        disabled={actingId === n.id}
        onClick={async (e) => {
          e.stopPropagation()
          setActingId(n.id)
          await fetch(`/api/additional-settlements/${n.payload.settlement_id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reject' }),
          })
          setActionResults(prev => ({ ...prev, [n.id]: 'rejected' }))
          load()
          setActingId(null)
        }}
        className="px-3 py-1 text-xs font-medium border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
      >
        거부
      </button>
      <button
        disabled={actingId === n.id}
        onClick={async (e) => {
          e.stopPropagation()
          setActingId(n.id)
          await fetch(`/api/additional-settlements/${n.payload.settlement_id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve' }),
          })
          setActionResults(prev => ({ ...prev, [n.id]: 'approved' }))
          load()
          setActingId(null)
        }}
        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        승인
      </button>
    </div>
  )
)}
```
