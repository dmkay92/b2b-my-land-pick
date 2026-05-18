# 여행 후 정산 결제 플랜

## 배경

현재 결제 플랜(standard, large_event, immediate)은 모두 여행 출발 전에 전액 결제가 완료되는 구조다. 여행 후 잔금을 정산하는 플랜을 추가하여 여행사에 유연한 결제 옵션을 제공한다. 단, 랜드사 입장에서 미수금 리스크가 있으므로 랜드사 승인을 필수로 한다.

## 결제 구조

```
post_travel (여행 후 정산)
├─ 계약금 10%  → 확정 후 7일 이내
├─ 중도금 40%  → 출발 7일 전
└─ 잔금   50%  → 귀국일 + 30일
```

## 승인 흐름

```
여행사: 결제 플랜에서 "여행 후 정산" 선택
    ↓
안내 모달 표시:
  - "여행 후 정산 플랜은 랜드사 승인이 필요합니다"
  - "승인 전까지 결제 일정이 확정되지 않습니다"
  - "랜드사가 거부할 경우 다른 플랜을 선택해야 합니다"
  - 결제 비율/일정 미리보기 (계약금 10%, 중도금 40%, 잔금 50%)
    ↓
여행사: "승인 요청" 확인 버튼 클릭
    ↓
시스템:
  - payment_schedules.approval_status = 'pending' 저장
  - 랜드사 대시보드에 알림 생성
  - 채팅방에 승인 요청 시스템 메시지 전송
    ↓
랜드사: 대시보드 알림 or 채팅에서 승인/거부
    ↓
┌─ 승인 → approval_status = 'approved', 결제 일정 확정, 여행사에 알림+채팅
└─ 거부 → approval_status = 'rejected', 여행사에 다른 플랜 선택 안내 알림+채팅
```

## DB 변경

### 1. payment_schedules 테이블

```sql
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved'
  CHECK (approval_status IN ('approved', 'pending', 'rejected'));
```

- 기존 플랜(standard, large_event, immediate)은 승인 불필요 → 기본값 `'approved'`
- `post_travel`만 생성 시 `'pending'`으로 시작

### 2. template_type CHECK 제약조건 업데이트

```sql
ALTER TABLE payment_schedules DROP CONSTRAINT IF EXISTS payment_schedules_template_type_check;
ALTER TABLE payment_schedules ADD CONSTRAINT payment_schedules_template_type_check
  CHECK (template_type IN ('standard', 'large_event', 'immediate', 'post_travel'));
```

### 3. 채팅 메시지 시스템 메시지 타입

기존 채팅 메시지에 `message_type` 컬럼이 없다면 추가:

```sql
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'
  CHECK (message_type IN ('text', 'file', 'system', 'approval_request', 'approval_result'));
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb;
```

- `approval_request`: 승인 요청 메시지 (채팅 UI에서 승인/거부 버튼 표시)
- `approval_result`: 승인/거부 결과 메시지
- `metadata`: `{ schedule_id, approval_status }` 등 추가 데이터

## API 변경

### 1. PUT /api/payment-schedule

기존 templateType 변경 로직에 `post_travel` 추가.

- `post_travel` 선택 시: `approval_status = 'pending'`으로 저장, 알림+채팅 발송
- 이미 paid/partial 회차가 있으면 변경 불가 (기존 로직 유지)

### 2. POST /api/payment-schedule/approve (신규)

랜드사가 승인/거부하는 엔드포인트.

- Request: `{ scheduleId, action: 'approve' | 'reject' }`
- 승인: `approval_status = 'approved'`, 여행사에 알림+채팅
- 거부: `approval_status = 'rejected'`, 여행사에 다른 플랜 선택 알림+채팅
- 권한 검증: 해당 견적의 랜드사만 가능

### 3. 채팅 메시지 API 확장

POST /api/chat/rooms/[roomId]/messages 에서 `message_type`과 `metadata` 지원.

## UI 변경

### 1. PaymentScheduleCard (여행사)

- 플랜 선택 버튼에 "여행 후 정산" 추가
- 클릭 시 안내 모달:
  - 랜드사 승인 필요 안내
  - 승인 전까지 미확정 안내
  - 거부 시 다른 플랜 선택 안내
  - 일정 미리보기 (계약금 10%, 중도금 40%, 잔금 50%)
  - [취소] [승인 요청] 버튼
- `approval_status === 'pending'` 일 때: "랜드사 승인 대기중" 배지 표시, 결제 버튼 비활성화
- `approval_status === 'rejected'` 일 때: "거부됨 - 다른 플랜을 선택해주세요" 안내

### 2. 랜드사 대시보드

- 알림 영역에 승인 요청 표시
- 클릭 시 승인/거부 모달 (플랜 상세 표시)

### 3. 채팅 UI

- `message_type === 'approval_request'`: 승인 요청 카드 렌더링 (승인/거부 버튼 포함)
- `message_type === 'approval_result'`: 승인/거부 결과 표시
- 승인/거부 버튼 클릭 → POST /api/payment-schedule/approve 호출
- 처리 완료된 요청은 버튼 비활성화

## buildInstallments 확장

`src/lib/payment/schedule.ts`에 `post_travel` 케이스 추가:

```typescript
if (templateType === 'post_travel') {
  const deposit = Math.round(totalAmount * 0.1)
  const interim = Math.round(totalAmount * 0.4)
  const balance = totalAmount - deposit - interim
  return [
    { label: '계약금', rate: 0.1, amount: deposit, due_date: depositDueDate(departDate), allow_split: false },
    { label: '중도금', rate: 0.4, amount: interim, due_date: daysBeforeDeparture(departDate, 7), allow_split: true },
    { label: '잔금', rate: 0.5, amount: balance, due_date: daysAfterReturnDate(returnDate, 30), allow_split: true },
  ]
}
```

`returnDate` 파라미터 추가 필요 — `buildInstallments` 함수 시그니처에 `returnDate?: string` 추가.

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `supabase/migrations/새파일` | approval_status, message_type, metadata 컬럼 추가 |
| `src/lib/supabase/types.ts` | PaymentTemplateType에 'post_travel' 추가, 채팅 타입 확장 |
| `src/lib/payment/schedule.ts` | post_travel 분할 로직 + returnDate 파라미터 추가 |
| `src/app/api/payment-schedule/route.ts` | post_travel 선택 시 pending + 알림/채팅 발송 |
| `src/app/api/payment-schedule/approve/route.ts` | 신규 — 승인/거부 API |
| `src/app/api/chat/rooms/[roomId]/messages/route.ts` | message_type, metadata 지원 |
| `src/components/PaymentScheduleCard.tsx` | 여행 후 정산 버튼 + 안내 모달 + 상태 표시 |
| `src/components/chat/ChatMessage.tsx` (또는 해당 컴포넌트) | 승인 요청/결과 카드 렌더링 |
| 랜드사 대시보드 | 승인 요청 알림 + 승인/거부 UI |
