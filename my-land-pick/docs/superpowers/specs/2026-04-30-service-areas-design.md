# 랜드사 담당 지역 세분화 (국가+도시)

## 개요

랜드사가 국가 단위가 아닌 국가+도시 단위로 담당 지역을 등록하고, 해당 지역의 견적 요청만 받을 수 있도록 한다. 도시 목록은 DB에서 관리하며 admin이 추가/삭제/순서 변경 가능.

## DB 스키마

### 새 테이블: `cities`

```sql
CREATE TABLE cities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code text NOT NULL,
  city_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(country_code, city_name)
);
```

### profiles 컬럼 추가

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS service_areas jsonb DEFAULT '[]';
```

**service_areas 구조:**
```json
[
  { "country": "JP", "city": "도쿄" },
  { "country": "JP", "city": "오사카" },
  { "country": "VN", "city": "하노이" }
]
```

## API

### `GET /api/cities?country=JP` — 도시 목록 조회
- country 파라미터 필수
- sort_order 순 정렬
- 인증 필요 (가입/견적 요청 시 사용)

### `POST /api/admin/cities` — 도시 추가 (admin)
- body: `{ countryCode, cityName }`

### `DELETE /api/admin/cities/[id]` — 도시 삭제 (admin)

### `PATCH /api/admin/cities` — 순서 변경 (admin)
- body: `{ updates: [{ id, sort_order }] }`

### `POST /api/admin/assign-service-areas` — 랜드사 담당 지역 지정 (admin)
- body: `{ landcoId, serviceAreas: [{ country, city }] }`
- profiles.service_areas 업데이트 + 로그

## UI 변경

### 1. Admin — 도시 목록 관리 (`/admin/cities`)
- 사이드바에 "도시 관리" 메뉴 추가
- 국가별 탭 → 해당 국가의 도시 목록 테이블
- 도시 추가/삭제 + sort_order 변경

### 2. Admin — 랜드사 상세 모달
- 기존 "담당 국가" 섹션 → "담당 지역" 섹션으로 변경
- 국가 선택 → 해당 국가 도시 검색 드롭다운 (복수 선택)
- 저장 시 profiles.service_areas 업데이트

### 3. 랜드사 가입 — Step5
- 기존 국가만 선택 → 국가 선택 후 도시 검색 드롭다운 (복수 선택)
- "오사" 입력 → "오사카" autocomplete

### 4. 여행사 견적 요청 — 목적지 도시
- 기존 자유 입력 → 국가 드롭다운 선택 후 도시 검색 드롭다운 (단일 선택)
- cities 테이블에서 조회

### 5. 랜드사 대시보드 — 필터링
- 기존: `destination_country IN country_codes`
- 변경: `(destination_country, destination_city)` 쌍이 `service_areas`에 포함되는지 체크

## 검색 드롭다운 동작
- 국가 선택 후 도시 input 포커스
- 타이핑 시 해당 국가의 도시 목록에서 필터링 (프론트 필터, API 재호출 불필요)
- 매칭되는 도시를 드롭다운으로 표시
- 클릭/엔터로 선택

## 데이터 마이그레이션
- 기존 `country_codes: ['JP']` → 해당 국가의 모든 도시를 service_areas에 추가
- 예: JP → `[{ country: 'JP', city: '도쿄' }, { country: 'JP', city: '오사카' }, ...]`
- country_codes 컬럼은 유지 (하위 호환), service_areas가 있으면 우선 참조

## 초기 도시 데이터

### 일본 (JP)
도쿄, 오사카, 교토, 후쿠오카, 삿포로, 나고야, 오키나와, 나라, 고베, 히로시마

### 베트남 (VN)
하노이, 호치민, 다낭, 나트랑, 푸꾸옥, 하롱베이, 달랏, 사파

### 중국 (CN)
베이징, 상하이, 광저우, 선전, 청두, 시안, 항저우, 칭다오

### 프랑스 (FR)
파리, 니스, 리옹, 마르세유, 보르도, 스트라스부르
