# Email Service Redesign — Resend + 브랜드 템플릿

## 개요

기존 5개 이메일 함수를 브랜드 템플릿 기반으로 리팩터링하고, 5개 신규 이메일을 추가한다.
채팅 메시지 이메일은 즉시 발송에서 Cron 기반 지연 발송(미확인 5분 경과)으로 변경한다.

## 파일 구조

```
src/lib/email/
├── template.ts      # 공통 HTML 레이아웃 (로고 헤더 + 푸터)
├── notifications.ts # 10개 발송 함수
└── constants.ts     # FROM 주소, 로고 URL, 미확인 임계값 등
```

### constants.ts

```ts
export const FROM = 'noreply@mylandpick.com'
export const LOGO_URL = 'https://depqyjvkjpdnwtxxlkcl.supabase.co/storage/v1/object/public/assets/logos/myrealtrip-logo.png'
export const UNREAD_THRESHOLD_MINUTES = 5
```

### template.ts

모든 이메일이 공유하는 HTML 래퍼. 본문 슬롯만 각 함수에서 주입한다.

```
[로고 헤더: 마이랜드픽 by Myrealtrip]  (table + vertical-align:middle)
─────────────────────────────
{본문 슬롯}
─────────────────────────────
본 메일은 마이랜드픽에서 자동 발송된 메일입니다.
```

스타일:
- max-width: 600px, font-family: Apple SD Gothic Neo, Malgun Gothic
- 로고: table 레이아웃, vertical-align:middle, 마이랜드픽(18px bold) + by(12px gray) + Myrealtrip 로고(16px)
- CTA 버튼: background #2563eb, color white, border-radius 6px, padding 12px 24px
- 푸터: border-top, color #9ca3af, font-size 12px

## 이메일 함수 목록 (10개)

### 1. sendApprovalEmail (신규)
- **수신자:** 승인된 대리점(여행사) 또는 랜드사
- **트리거:** admin이 가입 승인 시
- **제목:** `[마이랜드픽] 가입이 승인되었습니다`
- **본문:** 승인 완료 안내 + 로그인 링크
- **호출 위치:** `POST /api/admin/approve`

### 2. sendNewRequestEmail (기존 리팩터)
- **수신자:** 매칭되는 랜드사들 (country/city 기준)
- **트리거:** 여행사가 견적 요청 생성 시
- **제목:** `[견적요청] {행사명}`
- **본문:** 행사명, 목적지, 마감일 + 견적 작성 링크
- **호출 위치:** `POST /api/requests`

### 3. sendQuoteSubmittedEmail (기존 리팩터)
- **수신자:** 여행사
- **트리거:** 랜드사가 견적 제출 시
- **제목:** `[견적도착] {행사명} — {랜드사명}`
- **본문:** 행사명, 랜드사명 + 견적 확인 링크
- **호출 위치:** `POST /api/quotes`, `POST /api/quotes/draft/submit`

### 4. sendRequestUpdatedEmail (신규)
- **수신자:** 해당 견적 요청에 견적을 제출한 랜드사
- **트리거:** 여행사가 견적 요청 내용(행사명, 일정, 인원 등) 수정 시
- **제목:** `[수정알림] {행사명} 견적 요청이 수정되었습니다`
- **본문:** 행사명 + 수정된 요청 확인 링크
- **호출 위치:** `PATCH /api/requests/[id]`

### 5. sendUnreadMessageEmail (신규 — 기존 sendChatMessageEmail 대체)
- **수신자:** 미확인 측 (대리점 또는 랜드사)
- **트리거:** Cron — 첫 미확인 메시지 5분 경과 시 1회만 발송
- **제목:** `[채팅] {행사명} — 읽지 않은 메시지가 있습니다`
- **본문:** 보낸 사람, 행사명 + 채팅 확인 링크
- **호출 위치:** `GET /api/cron/unread-messages`

### 6. sendQuoteSelectedEmail (기존 리팩터)
- **수신자:** 선택된 랜드사
- **트리거:** 여행사가 견적 최종 선택 시
- **제목:** `[선택됨] {행사명} 견적이 선택되었습니다`
- **본문:** 축하 메시지 + 협업 진행 링크
- **호출 위치:** `POST /api/quotes/select`

### 7. sendSettlementRequestEmail (신규)
- **수신자:** 랜드사
- **트리거:** 여행 후 정산 승인 요청 시
- **제목:** `[정산] {행사명} 정산 승인 요청`
- **본문:** 행사명 + 정산 확인 링크
- **호출 위치:** `POST /api/payment-schedule` (post_travel 생성 시)

### 8. sendSettlementApprovedEmail (신규)
- **수신자:** 여행사(대리점)
- **트리거:** 랜드사가 정산 승인 완료 시
- **제목:** `[정산] {행사명} 정산이 승인되었습니다`
- **본문:** 행사명 + 정산 내역 확인 링크
- **호출 위치:** `POST /api/payment-schedule/approve`

### 9. sendFinalizedEmail (기존 리팩터 — 수신자 변경)
- **수신자:** 여행사(대리점) ← 기존에는 랜드사에게 발송했으나 변경
- **트리거:** 결제 대기 상태에서 랜드사가 '결제확인 완료' 버튼 클릭 시
- **제목:** `[최종확정] {행사명} 여행이 확정되었습니다`
- **본문:** 행사명 + 상세 확인 링크
- **호출 위치:** `POST /api/quotes/finalize`

### 10. sendCancellationEmail (신규)
- **수신자:** 랜드사
- **트리거:** 행사 취소 및 환불 요청 시
- **제목:** `[취소] {행사명} 행사 취소 및 환불이 요청되었습니다`
- **본문:** 행사명 + 취소 내역 확인 링크
- **호출 위치:** 취소/환불 요청 API

## Cron 미확인 메시지 처리

### 동작 방식
1. Vercel Cron이 `/api/cron/unread-messages`를 1분마다 호출
2. DB에서 조회: 미확인 메시지 중 생성 후 `UNREAD_THRESHOLD_MINUTES`분 경과 + `email_sent_at IS NULL`인 채팅방
3. 해당 채팅방 수신자에게 이메일 1회 발송
4. 발송 후 `email_sent_at` 타임스탬프 기록

### DB 스키마 변경
`chat_rooms` 테이블에 컬럼 추가:
- `agency_email_sent_at TIMESTAMPTZ DEFAULT NULL`
- `landco_email_sent_at TIMESTAMPTZ DEFAULT NULL`

### 재발송 방지 & 리셋 로직
- 이메일 발송 시 → 해당 `email_sent_at` 컬럼에 타임스탬프 기록
- 채팅방 read 시 (`POST /api/chat/rooms/[roomId]/read`) → `email_sent_at = NULL`로 리셋
- Cron은 `email_sent_at IS NULL`인 채팅방만 대상으로 조회
- **사이클:** 미확인 → 5분 경과 → 이메일 발송 → 읽음 → 리셋 → 다음 미확인 시 다시 발송

### Cron 설정
`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/unread-messages",
      "schedule": "* * * * *"
    }
  ]
}
```

### Cron 보안
- `CRON_SECRET` 환경 변수로 Vercel Cron 요청만 허용
- `Authorization: Bearer {CRON_SECRET}` 헤더 검증

## API 라우트 변경 요약

### 신규 생성
- `GET /api/cron/unread-messages` — Cron 전용 라우트

### 기존 수정
- `POST /api/admin/approve` — `sendApprovalEmail` 호출 추가
- `PATCH /api/requests/[id]` — `sendRequestUpdatedEmail` 호출 추가
- `POST /api/chat/rooms/[roomId]/messages` — `sendChatMessageEmail` 즉시 호출 제거
- `POST /api/chat/rooms/[roomId]/read` — `email_sent_at` 리셋 추가
- `POST /api/payment-schedule` — `sendSettlementRequestEmail` 호출 추가 (post_travel)
- `POST /api/payment-schedule/approve` — `sendSettlementApprovedEmail` 호출 추가
- `POST /api/quotes/finalize` — `sendFinalizedEmail` 수신자를 여행사로 변경
- 취소/환불 API — `sendCancellationEmail` 호출 추가

### DB 마이그레이션
- `chat_rooms` 테이블에 `agency_email_sent_at`, `landco_email_sent_at` 컬럼 추가

## 도메인 설정
- 발신: `noreply@mylandpick.com` (Resend에 도메인 인증 필요)
- 테스트 시: `onboarding@resend.dev` 사용
