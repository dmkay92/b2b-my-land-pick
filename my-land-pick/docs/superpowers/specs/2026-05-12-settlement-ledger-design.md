# Settlement Ledger (정산 히스토리) Design

## 개요

결제완료된 payment_installment를 정산 히스토리 테이블(`settlement_ledger`)로 기록하여, 정산 행위의 불변 이력을 관리한다. 랜드사 정산과 여행사 수수료 지급을 독립적으로 추적하며, 비례 계산된 금액을 스냅샷으로 저장한다.

## 핵심 규칙 (입점계약서 기준)

- 정산금 = 견적가 - 플랫폼 수수료(5%) - 기타 공제액
- 여행사로부터 실제 수령한 대금 범위 내에서만 랜드사에게 정산금 지급 (제13조 ④항)
- 여행완료 익월 말일까지 지급 (제13조 ①항)
- 추가정산/공제 추가 청구는 랜드사 100% 귀속 (플랫폼 수수료 0%, 여행사 수수료 0%)

## DB 스키마

### 신규 테이블: settlement_ledger

```sql
CREATE TABLE settlement_ledger (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id             text UNIQUE,
  request_id             uuid REFERENCES quote_requests(id) NOT NULL,
  installment_id         uuid REFERENCES payment_installments(id) NOT NULL UNIQUE,

  -- 원본 스냅샷 (생성 시점에 고정)
  installment_label      text NOT NULL,
  installment_rate       numeric NOT NULL,
  paid_amount            numeric NOT NULL,

  -- 비례 계산 (생성 시점에 고정)
  platform_fee           numeric NOT NULL DEFAULT 0,
  agency_fee             numeric NOT NULL DEFAULT 0,
  landco_payout_amount   numeric NOT NULL DEFAULT 0,

  -- 랜드사 정산 상태
  landco_payout_status   text NOT NULL DEFAULT 'reviewing'
    CHECK (landco_payout_status IN ('reviewing', 'confirmed', 'paid')),
  landco_confirmed_at    timestamptz,
  landco_paid_at         timestamptz,

  -- 여행사 수수료 상태
  agency_payout_status   text NOT NULL DEFAULT 'accrued'
    CHECK (agency_payout_status IN ('accrued', 'payable', 'paid')),
  agency_paid_at         timestamptz,

  -- 메타
  created_by             uuid REFERENCES profiles(id),
  created_at             timestamptz DEFAULT now()
);
```

display_id 형식: `SLD-YYYYMMDD-NNNNNN`

### 기존 테이블 변경

**payment_installments:**
- `request_id uuid REFERENCES quote_requests(id)` 컬럼 추가
- `settlement_status text DEFAULT NULL` 컬럼 추가
  - `NULL`: 미처리
  - `reviewing`: 정산 검토로 넘어감
  - `settled`: 정산 완료

## 비례 계산 규칙

### 일반 installment (rate > 0)

해당 installment의 paid_amount를 기준으로, 전체 GMV 대비 비례 계산:

```
platform_fee = paid_amount × (quote_settlements.platform_fee / quote_settlements.gmv)
agency_fee = paid_amount × (quote_settlements.agency_commission / quote_settlements.gmv)
landco_payout_amount = paid_amount - platform_fee - agency_fee
```

### 추가정산/공제 (rate = 0)

```
platform_fee = 0
agency_fee = 0
landco_payout_amount = paid_amount  (랜드사 100% 귀속)
```

## 플로우

### 1. 결제관리 → 정산 검토 넘기기

- admin이 결제완료 installment를 체크박스 멀티셀렉트
- "정산 검토로 넘기기" 벌크 액션
- API: `POST /api/admin/settlement-ledger/bulk-create`
  - `settlement_ledger`에 row 생성 (비례 계산 스냅샷 포함)
  - 원본 `payment_installments.settlement_status` → `reviewing`
  - 초기 상태: `landco_payout_status: reviewing`, `agency_payout_status: accrued`

### 2. 정산관리에서 상태 변경 (벌크)

- API: `PATCH /api/admin/settlement-ledger/bulk-update`
- 검토중 → 확정: `landco_payout_status: confirmed`, `landco_confirmed_at` 기록
- 확정 → 지급완료: `landco_payout_status: paid`, `landco_paid_at` 기록
- 여행사 지급대기 → 지급완료: `agency_payout_status: paid`, `agency_paid_at` 기록

### 3. 여행사 수수료 자동 전환

- installment 결제완료 시마다, 해당 request의 모든 installment(rate > 0)가 paid인지 체크
- 전액 결제 완료 시 → 해당 request의 `settlement_ledger` 전체 row의 `agency_payout_status`를 `accrued → payable`로 자동 전환
- 트리거 시점: installment status가 paid로 변경될 때 (기존 결제 처리 API에서 호출)

## 정산관리 UI

### 탭 구조

| 탭 | 필터 조건 | 설명 |
|---|---|---|
| 검토중 | `landco_payout_status = reviewing` | 결제관리에서 넘어온 건 |
| 확정 | `landco_payout_status = confirmed` | 정산 확정, 지급 대기 |
| 랜드사 지급완료 | `landco_payout_status = paid` | 랜드사 송금 완료 |
| 여행사 지급대기 | `agency_payout_status = payable` | 전액 결제 완료, 지급 가능 |
| 여행사 지급완료 | `agency_payout_status = paid` | 여행사 송금 완료 |
| 전체 | 필터 없음 | 모든 정산 이력 |

### 테이블 컬럼

요청ID | 정산ID | 결제ID | 행사명 | 여행사 | 랜드사 | 항목 | 납부액 | 플랫폼수수료 | 여행사수수료 | 랜드사정산금 | 랜드사상태 | 여행사상태 | 생성일

### 벌크 액션

- 체크박스 멀티셀렉트 + 상단 버튼
- "검토중" 탭: **정산 확정** 버튼
- "확정" 탭: **랜드사 지급완료** 버튼
- "여행사 지급대기" 탭: **여행사 지급완료** 버튼

### 필터

- daterange (요청일, 여행시작일, 여행종료일)
- 여행사/랜드사 검색
- 엑셀 다운로드 버튼

## 결제관리 변경사항

### 체크박스 + 벌크 액션 추가

- 결제완료 탭에 체크박스 추가
- `settlement_status`가 NULL인 건만 선택 가능 (이미 넘긴 건은 비활성)
- "정산 검토로 넘기기" 버튼

### 엑셀 다운로드

- API: `GET /api/admin/payments/export`
- 필터: 상태 (결제대기/결제완료/취소됨), daterange (요청일, 여행시작일, 여행종료일)
- payment_installments 기반, JOIN으로 행사명/여행사/랜드사 포함

## 엑셀 다운로드 (정산관리)

- API: `GET /api/admin/settlement-ledger/export`
- 필터: 랜드사상태, 여행사상태, daterange (요청일, 여행시작일, 여행종료일)
- settlement_ledger 기반, JOIN으로 행사명/여행사/랜드사 포함

## API 요약

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/admin/settlement-ledger/bulk-create` | 결제완료 건 → 정산 검토로 벌크 생성 |
| GET | `/api/admin/settlement-ledger` | 정산 목록 조회 (탭/필터) |
| PATCH | `/api/admin/settlement-ledger/bulk-update` | 상태 벌크 변경 |
| GET | `/api/admin/settlement-ledger/export` | 정산 엑셀 다운로드 |
| GET | `/api/admin/payments/export` | 결제 엑셀 다운로드 |
