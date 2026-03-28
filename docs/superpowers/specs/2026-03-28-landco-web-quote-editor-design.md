# 랜드사 견적서 웹 에디터 디자인

## 개요

랜드사가 견적서를 제출하는 방법을 두 가지로 제공한다.

1. **엑셀 업로드** (기존 방식 유지) — 템플릿 다운로드 → Excel 편집 → 파일 업로드
2. **웹 에디터** (신규) — 브라우저에서 직접 일정표·견적서 작성 → Excel 자동 생성 → 제출

두 방식 모두 동일한 `/api/quotes` POST 엔드포인트로 제출되므로 백엔드 핵심 로직은 변경 없다.

---

## UI 흐름

### 1. 견적 요청 상세 페이지 (기존 페이지 수정)

`견적서 제출` 섹션을 두 영역으로 분리한다.

```
┌─────────────────────┬─────┬─────────────────────┐
│   📂 엑셀 파일 업로드  │ 또는 │  ✏️ 웹에서 직접 작성   │
│  드래그 또는 클릭     │     │  새 탭으로 열립니다 ↗  │
│  ↓ 템플릿 다운로드   │     │  [작성 시작]           │
└─────────────────────┴─────┴─────────────────────┘
```

- 임시저장된 draft가 있을 경우 "임시저장된 작업이 있습니다 — 이어서 작성하기" 배너 표시

### 2. 웹 에디터 (새 탭)

URL: `/landco/requests/[id]/quote/new`

#### 시작 화면 — 순서 선택

```
어디서부터 시작할까요?
탭으로 언제든 자유롭게 이동할 수 있습니다

  [ 📅 일정표부터 ]   [ 💰 견적서부터 ]
```

선택한 옵션이 에디터의 첫 번째 활성 탭이 된다.

#### 에디터 화면 — 탭 기반 자유 이동

```
┌──────────────────────────────────────────────────┐
│ 견적서 작성 — [이벤트명]           자동저장됨 ✓   │
├────────────┬────────────┬──────────────────────── │
│ 📅 일정표  │ 💰 견적서  │          [미리보기·제출→]│
├────────────┴────────────┴──────────────────────── │
│  (탭 내용)                                        │
└──────────────────────────────────────────────────┘
```

- 두 탭을 언제든 자유롭게 전환 가능
- 탭 전환 시 자동으로 서버에 draft 저장
- "미리보기·제출" 버튼은 우측 상단에 항상 표시

---

## 일정표 탭

### 구조

- 요청의 `depart_date` ~ `return_date` 기준으로 Day를 자동 생성
- 각 Day마다 헤더(날짜 표시) + 테이블 행들 + 호텔 행(고정)
- Day별로 "+ 행 추가" 버튼으로 행을 자유롭게 추가/삭제

### 컬럼

| 여행지역 | 교통편 | 시간 | 여행일정 | 식사 | 삭제 |
|----------|--------|------|----------|------|------|
| text     | text   | text | text     | text | ✕   |

### 데이터 구조 (draft JSON)

```json
{
  "itinerary": [
    {
      "day": 1,
      "date": "2025-06-01",
      "rows": [
        { "area": "바르셀로나", "transport": "전용버스", "time": "09:00", "content": "사그라다 파밀리아 관람", "meal": "중식 포함" }
      ]
    }
  ]
}
```

---

## 견적서 탭

### 구조

카테고리 6개를 섹션으로 분리. 각 섹션에서 행 자유 추가/삭제.

- 호텔 / 차량 / 식사 / 입장료 / 가이드비용 / 기타

### 컬럼

| 날짜 | 세부내역 | 가격(원) | 횟수 | 인원/수량 | 합계(자동) | 삭제 |
|------|----------|----------|------|-----------|------------|------|

- 합계 = 가격 × 횟수 × 인원/수량 (실시간 자동 계산)
- 하단에 총 합계 및 1인당 견적가 실시간 표시

### 데이터 구조 (draft JSON)

```json
{
  "pricing": {
    "호텔": [
      { "date": "06.01", "detail": "5성급 호텔 2박", "price": 250000, "count": 2, "quantity": 30 }
    ],
    "차량": [],
    "식사": [],
    "입장료": [],
    "가이드비용": [],
    "기타": []
  }
}
```

---

## 미리보기 · 제출

`generateQuoteTemplate()`은 서버(Node.js)에서만 동작하므로, 미리보기와 제출 모두 서버 API를 통해 처리한다.

1. "미리보기·제출" 클릭 시 draft 데이터를 `/api/quotes/draft/preview` POST로 전송
2. 서버에서 `generateQuoteTemplate()` 호출 → Excel 생성 → Supabase Storage에 임시 업로드 → signed URL 반환
3. 클라이언트는 반환된 signed URL을 기존 `ExcelPreviewModal`에 전달해 미리보기 표시
4. "제출" 클릭 시 해당 URL을 `/api/quotes/draft/submit` POST로 전송
5. 서버에서 기존 `/api/quotes` 로직 그대로 실행 (버전 관리, 알림 이메일 등)
6. 제출 성공 시 draft 삭제, 새 탭에 완료 메시지 표시 및 원래 탭 새로고침 안내

### 추가 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/quotes/draft/preview` | draft → Excel 생성 → signed URL 반환 |
| POST | `/api/quotes/draft/submit` | signed URL 기반 최종 제출 + draft 삭제 |

---

## 임시저장 (Draft)

### DB 테이블 신규 추가: `quote_drafts`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| request_id | uuid FK → quote_requests | |
| landco_id | uuid FK → profiles | |
| itinerary | jsonb | 일정표 데이터 |
| pricing | jsonb | 견적서 데이터 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

- `(request_id, landco_id)` unique constraint — 건당 1개 draft

### API 엔드포인트 신규 추가

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/quotes/draft?requestId=` | draft 조회 |
| PUT | `/api/quotes/draft` | draft 저장/갱신 |
| DELETE | `/api/quotes/draft?requestId=` | draft 삭제 (제출 후 자동 호출) |
| POST | `/api/quotes/draft/preview` | draft → Excel 생성 → signed URL 반환 |
| POST | `/api/quotes/draft/submit` | signed URL 기반 최종 제출 + draft 삭제 |

### 저장 트리거

- 탭 전환 시 자동 저장
- 30초마다 자동 저장 (변경사항 있을 때만)
- "임시저장" 수동 버튼

---

## 신규 파일 목록

| 파일 | 설명 |
|------|------|
| `src/app/(dashboard)/landco/requests/[id]/quote/new/page.tsx` | 웹 에디터 페이지 |
| `src/components/quote-editor/QuoteEditorShell.tsx` | 탭 + 상단 헤더 컨테이너 |
| `src/components/quote-editor/ItineraryEditor.tsx` | 일정표 탭 |
| `src/components/quote-editor/PricingEditor.tsx` | 견적서 탭 |
| `src/components/quote-editor/QuotePreview.tsx` | 미리보기 + 제출 |
| `src/app/api/quotes/draft/route.ts` | draft CRUD API |

## 기존 파일 수정

| 파일 | 변경 내용 |
|------|-----------|
| `src/app/(dashboard)/landco/requests/[id]/page.tsx` | 제출 섹션에 "웹에서 작성" 옵션 추가, draft 배너 추가 |
| `src/lib/excel/template.ts` | 클라이언트에서도 호출 가능하도록 export 확인 |
