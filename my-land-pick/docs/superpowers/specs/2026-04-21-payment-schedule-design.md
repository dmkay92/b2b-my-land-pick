# 결제 스케줄 시스템 설계

## 배경

견적 확정 후 고객이 분할 결제(계약금/중도금/잔금)할 수 있도록 결제 스케줄을 자동 생성하고 상태를 관리한다. 실제 PG 연동은 기존 플랫폼에서 직접 코딩하여 붙이며, 이 프로덕트는 스케줄 관리 + 상태 추적 + 연결점(함수)만 제공한다.

---

## 1. 결제 스케줄 템플릿

### 템플릿 1: 일반 (2단계)
| 단계 | 비율 | 기한 |
|------|------|------|
| 계약금 | 10% | 확정 즉시 |
| 잔금 | 90% | 출발 7일 전 |

### 템플릿 2: 대형행사 (3단계)
| 단계 | 비율 | 기한 |
|------|------|------|
| 계약금 | 10% | 확정 즉시 |
| 중도금 | 40% | 출발 30일 전 |
| 잔금 | 50% | 출발 7일 전 |

### 템플릿 3: 즉시완납
| 단계 | 비율 | 기한 |
|------|------|------|
| 전액 | 100% | 확정 즉시 |

---

## 2. 자동 적용 규칙

| 조건 | 디폴트 | Agency 선택 가능 |
|------|--------|----------------|
| 총 인원 ≥ 50명 | 대형행사 (3단계) | 즉시완납으로 변경 가능 |
| 총 인원 < 50명 | 일반 (2단계) | 즉시완납으로 변경 가능 |

- 즉시완납은 항상 선택 가능
- 단계를 올리는 건 불가 (50명 미만이 3단계 선택 불가)

---

## 3. 결제 흐름

```
1. Agency 견적 확정 (confirm API)
   → quote_settlements 생성 (기존)
   → payment_schedules 자동 생성 (인원 기준 디폴트 템플릿)
   → payment_installments N건 자동 생성

2. Agency가 스케줄 변경 (선택적)
   → 즉시완납으로 전환 가능
   → 기존 installments 삭제 → 새로 1건 생성

3. 각 installment 결제
   → 플랫폼 코드에서 markAsPaid(installmentId, txInfo) 호출
   → installment status: paid, paid_at 기록

4. 전체 완납 확인
   → 모든 installments가 paid → request status: finalized

5. 기한 도래 알림
   → due_date 기준 D-3, D-1, D-day 알림
```

---

## 4. DB 스키마

### payment_schedules
```sql
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
```

### payment_installments (결제 단계)
```sql
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
```

### payment_transactions (개별 거래)
```sql
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
```

### 분할결제(혼합결제) 규칙

| 단계 | allow_split | 설명 |
|------|------------|------|
| 계약금 | false | 단일 수단으로만 결제 (거래 1건) |
| 중도금 | true | 현금+카드 혼합 가능 (거래 N건) |
| 잔금 | true | 현금+카드 혼합 가능 (거래 N건) |
| 전액 (즉시완납) | true | 현금+카드 혼합 가능 (거래 N건) |

- installment.paid_amount = 해당 단계의 success 거래 합계
- paid_amount >= amount → status: paid
- 0 < paid_amount < amount → status: partial
- installment.paid_at = 마지막 거래로 paid가 된 시각

### RLS 정책
- Agency: 자기 request의 schedule/installments/transactions 조회 가능
- Landco: 자기가 관련된 request의 schedule/installments 조회 가능
- Admin: 전체 관리

---

## 5. 연결점 (플랫폼 연동용)

### 핵심 함수 (export)

```typescript
// 거래 등록 — 플랫폼에서 결제 성공 시 호출
// allow_split=false인 installment에 이미 거래가 있으면 에러
addTransaction(installmentId: string, txInfo: {
  amount: number
  payment_method: 'virtual_account' | 'card_link' | 'card_keyin'
  pg_transaction_id?: string
  pg_response?: Record<string, unknown>
}): Promise<{
  success: boolean
  installmentStatus: 'partial' | 'paid'
  allPaid: boolean  // true이면 전체 완납 → finalized 처리됨
}>
```

```typescript
// 스케줄 조회 (플랫폼에서 결제 UI 렌더링 시)
getPaymentSchedule(requestId: string): Promise<{
  schedule: PaymentSchedule
  installments: PaymentInstallment[]
}>
```

```typescript
// 결제 취소 시
cancelInstallment(installmentId: string): Promise<void>
```

---

## 6. UI

### Agency 견적 확정 후 — 결제 스케줄 카드

```
┌─────────────────────────────────────────────┐
│ 결제 스케줄                    [즉시완납 전환] │
│                                             │
│ ● 계약금 10%    1,014,000원   확정 즉시      │
│   → 결제대기                                 │
│                                             │
│ ○ 잔금 90%      9,126,000원   2026-04-15    │
│   → 대기 중                                  │
│                                             │
│ 총 결제금액: 10,140,000원                     │
└─────────────────────────────────────────────┘
```

### 상태 표시
- `pending`: 결제대기 (기한 전)
- `paid`: 결제완료 ✓ (결제일시 표시)
- `overdue`: 기한초과 (빨간색 경고)
- `cancelled`: 취소됨

### 즉시완납 전환
- 버튼 클릭 → 확인 모달 → 기존 installments 삭제 → 전액 1건 생성

---

## 7. 알림

| 시점 | 대상 | 내용 |
|------|------|------|
| 스케줄 생성 | Agency | 결제 스케줄이 생성되었습니다 |
| 기한 D-3 | Agency | 잔금 결제 기한이 3일 남았습니다 |
| 기한 D-1 | Agency | 잔금 결제 기한이 내일입니다 |
| 기한 D-day | Agency | 잔금 결제 기한입니다 |
| 결제 완료 | Agency + Landco | 계약금이 결제되었습니다 |
| 전체 완납 | Agency + Landco | 전체 결제가 완료되었습니다 |
| 기한 초과 | Agency + Admin | 잔금 결제 기한이 초과되었습니다 |
