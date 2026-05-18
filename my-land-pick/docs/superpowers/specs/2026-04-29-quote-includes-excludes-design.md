# 견적서 포함사항/불포함사항 기능

## 개요

랜드사 견적서 웹에디터에서 포함사항/불포함사항을 입력하고, 여행사 미리보기 및 엑셀 다운로드에 반영한다.

## 변경 범위

### 1. DB 스키마

`quotes` 테이블에 컬럼 추가:

```sql
ALTER TABLE quotes ADD COLUMN includes text;
ALTER TABLE quotes ADD COLUMN excludes text;
```

- 자유 텍스트, 줄바꿈(`\n`)으로 항목 구분
- nullable (기존 견적은 null)

### 2. 타입 정의

`src/lib/supabase/types.ts` — `Quote` 인터페이스에 추가:

```typescript
includes?: string | null
excludes?: string | null
```

### 3. 랜드사 견적 에디터

**파일:** `src/components/quote-editor/QuoteEditorShell.tsx`

- 일정표/견적서 탭 영역 아래에 "포함사항 / 불포함사항" 섹션 추가
- 각각 textarea (placeholder: "줄바꿈으로 항목을 구분해주세요")
- 기존 autosave 로직에 `includes`, `excludes` 필드 포함
- draft 저장/로드 시 함께 처리

### 4. API 변경

#### `POST /api/quotes/draft` (자동저장)
- request body에 `includes`, `excludes` 추가
- `quote_drafts` 또는 `quotes` 테이블에 저장

#### `POST /api/quotes/draft/submit` (제출)
- `quotes` 테이블 insert 시 `includes`, `excludes` 포함

#### `GET /api/quotes/[id]/detail` (상세 조회)
- 응답에 `includes`, `excludes` 포함

#### `GET /api/quotes/[id]/download` (엑셀 다운로드)
- `generateFilledQuoteTemplate` 호출 시 `includes`, `excludes` 전달
- `TemplateOptions` 인터페이스에 이미 정의되어 있음 — 값만 연결

### 5. 엑셀 템플릿

**파일:** `src/lib/excel/template.ts`

일정표 시트의 정보 섹션(행사명/발신처/총인원/출발일/도착일) 바로 아래에:

```
포함사항  | 호텔 5성급, 전일정 식사 포함, 가이드비 포함
불포함사항 | 입장료, 개인 경비, 여행자 보험
```

- 줄바꿈 항목은 쉼표(`, `)로 구분하여 한 셀에 표시
- includes/excludes가 null이면 해당 행 생략

### 6. 여행사 미리보기

**파일:** `src/app/(dashboard)/agency/quotes/[quoteId]/page.tsx`

일정표 탭에서 일정 테이블 위에 포함사항/불포함사항 표시:

- 각 항목을 줄바꿈 기준으로 파싱하여 리스트로 표시
- null이면 섹션 자체를 숨김
- 선택 전/후 모두 표시 (미리보기/다운로드 시 보임)

## 데이터 흐름

```
랜드사 에디터 → autosave API → DB (quotes.includes/excludes)
                                    ↓
여행사 미리보기 ← detail API ← DB
여행사 다운로드 ← download API → template.ts → Excel
```

## 미래 확장 (현재 구현 안 함)

- 자주 쓰는 포함/불포함 항목 템플릿
- 항목별 체크박스 UI
