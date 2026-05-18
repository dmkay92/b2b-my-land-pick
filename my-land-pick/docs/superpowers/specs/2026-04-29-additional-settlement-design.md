# 추가 정산 기능

## 개요

여행 확정(finalized) 후 랜드사가 여행 중/후 발생한 추가 비용을 요청하고, 여행사가 검토/승인하면 별도 결제 회차가 자동 생성되는 기능.

## 플로우

```
랜드사: 추가 정산 요청 (항목들 + 메모 + 영수증)
    ↓ 알림 + 채팅 메시지
여행사: 요청 단위로 검토 → 승인/거부
    ↓ 알림 + 채팅 메시지
승인 시: payment_installments에 "추가 정산 #N" 회차 자동 생성
```

## 조건

- `finalized` 상태에서만 요청 가능
- 여러 번 요청 가능 (추가 정산 #1, #2, ...)
- 요청 단위(묶음)로 승인/거부 (항목별 X)
- 영수증 첨부 선택

## DB 스키마

### 새 테이블: `additional_settlements`

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
```

**items 구조 (jsonb):**
```json
[
  { "name": "주류", "amount": 50000 },
  { "name": "음료", "amount": 30000 }
]
```

**total_amount**: items의 amount 합계 (서버에서 계산)

## API

### `POST /api/additional-settlements` — 요청 생성 (랜드사)

**요청:**
```json
{
  "requestId": "uuid",
  "items": [{ "name": "주류", "amount": 50000 }],
  "memo": "여행 중 발생한 추가 비용",
  "receiptUrls": []
}
```

**처리:**
1. request가 `finalized` 상태인지 확인
2. 현재 유저가 선택된 랜드사인지 확인
3. sequence_number 계산 (기존 요청 수 + 1)
4. DB insert
5. 여행사에 알림 + 채팅 메시지

### `GET /api/additional-settlements?requestId=uuid` — 목록 조회

요청에 대한 추가 정산 목록 반환 (랜드사/여행사 모두 조회 가능)

### `POST /api/additional-settlements/[id]/review` — 승인/거부 (여행사)

**요청:**
```json
{
  "action": "approve" | "reject"
}
```

**승인 시 처리:**
1. status → `approved`, reviewed_by, reviewed_at 업데이트
2. payment_installments에 새 회차 추가:
   - label: "추가 정산 #N"
   - amount: total_amount
   - rate: 0 (비율 기반이 아님)
   - due_date: 승인일 + 7일
   - status: 'pending'
3. payment_schedules의 total_amount 업데이트
4. 랜드사에 알림 + 채팅 메시지

**거부 시 처리:**
1. status → `rejected`, reviewed_by, reviewed_at 업데이트
2. 랜드사에 알림 + 채팅 메시지

## 알림

| 이벤트 | 수신자 | type | 메시지 |
|-------|-------|------|-------|
| 요청 생성 | 여행사 | `additional_settlement_request` | 추가 정산 요청이 접수되었습니다 |
| 승인 | 랜드사 | `additional_settlement_approved` | 추가 정산이 승인되었습니다 |
| 거부 | 랜드사 | `additional_settlement_rejected` | 추가 정산이 거부되었습니다 |

## 채팅 메시지

| 이벤트 | 발신자 | message_type | 내용 |
|-------|-------|-------------|------|
| 요청 | 랜드사 | `additional_settlement` | 추가 정산을 요청했습니다. (N건, 총 XX원) |
| 승인 | 여행사 | `additional_settlement_approved` | 추가 정산 #N이 승인되었습니다. (총 XX원) |
| 거부 | 여행사 | `additional_settlement_rejected` | 추가 정산 #N이 거부되었습니다. |

## UI

### 랜드사 — 결제 현황 아래

```
┌─────────────────────────────────────────┐
│ 추가 정산                    [+ 요청하기] │
│─────────────────────────────────────────│
│ #1  주류, 음료  80,000원        승인됨    │
│ #2  택시비      35,000원        검토중    │
└─────────────────────────────────────────┘
```

**"+ 요청하기" 모달:**
- 항목 추가/삭제 (항목명 + 금액)
- 메모 (선택)
- 영수증 첨부 (선택, 복수 파일)
- 합계 자동 계산
- 제출 버튼

### 여행사 — 결제하기 섹션 아래

```
┌─────────────────────────────────────────┐
│ 추가 정산 요청                           │
│─────────────────────────────────────────│
│ #2  주류 50,000 + 음료 30,000 = 80,000원 │
│     메모: 여행 중 추가 비용              │
│     [거부]  [승인]                       │
│─────────────────────────────────────────│
│ #1  택시비 35,000원          승인됨 ✅    │
└─────────────────────────────────────────┘
```

### 결제 현황 통합

승인된 추가 정산은 결제 스케줄에 별도 회차로 표시:

```
1  계약금     10%   결제완료   2,318,120원
2  중도금     40%   결제완료   9,272,480원
3  잔금(여행후) 50%  결제대기  11,590,600원
4  추가 정산 #1     결제대기      80,000원  ← 새로 추가
```
