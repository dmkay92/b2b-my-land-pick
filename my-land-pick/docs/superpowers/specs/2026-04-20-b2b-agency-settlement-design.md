# B2B 대리점(Agency) 정산 모델 및 견적 흐름 변경

## 배경

여행 대리점 인터뷰 결과, 정률 수수료 방식은 업계에서 사용하는 곳이 없음. 대리점이 자유롭게 마크업을 설정하고, 플랫폼이 대행 발행하는 구조로 전환.

## 가격 구조 (3단계)

| 단계 | 주체 | 시스템 역할 | 예시 |
|------|------|------------|------|
| 랜드사 원가 | 랜드사 | `landco` | 95만원 |
| 플랫폼 마진 | 플랫폼 | `admin` | +5만원 = 100만원 |
| 대리점 마크업 | 대리점 | `agency` | +11만원 = 111만원 |

- 최종 가격 결정권은 대리점에 있음
- 겉으로는 플랫폼이 최종 인보이스를 발행하는 형태

---

## 1. 견적 웹 UI 전환

### 현재 구조
```
랜드사 견적 제출 → 엑셀 파일 Storage 저장 → 다운로드/미리보기(엑셀→HTML 변환)
```

### 변경 구조
```
랜드사 견적 제출 → JSON 데이터(QuoteDraft) 저장 (기존과 동일)
                → 웹 UI에서 직접 렌더링
                → 다운로드 시에만 엑셀 동적 생성
```

### 미리보기 버튼 동작 변경
- **현재**: 모달에서 엑셀→HTML 변환 결과 표시
- **변경**: 별도 웹 페이지로 이동 → JSON 데이터를 React 컴포넌트로 렌더링

### 다운로드 버튼 동작 변경
- **현재**: Storage의 엑셀 파일 직접 다운로드
- **변경**: 웹 UI에 표시된 내용을 엑셀로 동적 생성하여 다운로드 (마크업 반영)

---

## 2. 견적서 노출 규칙 (Agency 기준)

### 선택 전
- **웹 UI**: 일정표 + 총액/1인당 금액 표시 (견적서 breakdown 탭 숨김)
- **엑셀 다운로드**: 일정표 시트 + 총액/1인당 금액 포함 (견적서 시트 없음)
- 총액/1인당 금액은 플랫폼 마진이 적용된 금액
- 여행사 수익설정이 입력된 경우, 해당 마크업이 총액/1인당에 반영됨

### 선택 후 (마크업 확정)
- **웹 UI**: 일정표 탭 + 견적서(breakdown) 탭 모두 노출 (마크업 녹아든 버전)
- **엑셀 다운로드**: 일정표 시트 + 견적서 시트 (마크업 반영)

---

## 3. 플랫폼 마진 자동 적용

### 현재 상태
랜드사 견적 금액이 대리점에게 그대로 노출됨.

### 변경
- 대리점에게 보이는 총액/1인당 금액에 플랫폼 마진(예: 5%) 자동 적용
- 견적서 breakdown 항목에도 마진이 녹아서 표시
- 플랫폼 마진율은 admin 설정으로 관리 (초기값 5%)
- 내부적으로 원가와 마진 적용가를 분리 기록

### 적용 범위
- 대리점(agency)에게 노출되는 모든 금액에 적용
- 랜드사(landco)와 admin에게는 원가 그대로 표시

---

## 4. 여행사 수익설정 (Agency 마크업 입력)

### UI 위치
각 랜드사 견적 섹션 내 "여행사 수익설정" 필드

### 입력 방식
- **1인당 금액** 필드: 입력 시 → 총액 자동계산 (× 총 인원수)
- **총액** 필드: 입력 시 → 1인당 자동계산 (÷ 총 인원수)
- 양방향 연동 (마지막 입력 필드 기준으로 계산)
- 견적마다 다르게 설정 가능

### 임시 마크업 동작
- 여행사 수익설정 입력 → 해당 견적의 총액/1인당 금액에 실시간 반영
- 웹 UI 미리보기: 마크업 반영된 일정표 + 총액/1인당 표시 (견적서 breakdown은 여전히 숨김)
- 엑셀 다운로드: 마크업이 녹아든 일정표 시트 + 총액/1인당 포함

### 임시 마크업 저장
- `agency_markups` 테이블에 quote_id별로 저장
- 페이지 재진입 시 기존 입력값 복원

---

## 5. 견적 최종 선택 플로우

### 현재
견적 확인 버튼 → 단순 확인 모달 → `/api/quotes/confirm` 호출

### 변경
견적 확인 버튼 클릭 시 2단계 팝업:

**팝업 1: 여행사 수익 입력**
- 1인당 금액 / 총액 입력 필드 (임시 마크업 값 프리필)
- 양방향 자동계산 (임시 마크업과 동일 UX)

**팝업 2: 최종 금액 확인**
- 요약 표시:
  - 랜드사 견적가 (플랫폼 마진 포함): 100만원
  - 여행사 수익: 11만원
  - 최종 고객가: 111만원
  - 1인당 금액: XX만원
- "확정" 버튼 → 정산 데이터 생성 + 견적 확정

---

## 6. 마크업 비례 배분 로직

대리점 마크업을 견적서 breakdown에 녹일 때, **식사 항목을 제외한** 나머지 항목의 원가 비중으로 비례 배분.

### 공식
```
배분 대상 원가 합계 = 전체 원가 - 식사 원가
항목별 마크업 배분 = 마크업 총액 × (해당 항목 원가 / 배분 대상 원가 합계)
식사 항목 마크업 = 0 (원가 그대로 표시)
```

### 예시
마크업 11만원, 전체 원가 100만원, 배분 대상 원가 85만원 (식사 15만원 제외)

| 항목 | 원가 | 배분 비중 | 마크업 배분 | 최종 표시 |
|------|------|----------|-----------|----------|
| 호텔 | 50만 | 58.8% | +6.47만 | 56.47만 |
| 차량 | 20만 | 23.5% | +2.59만 | 22.59만 |
| 식사 | 15만 | 제외 | 0 | 15만 |
| 입장료 | 5만 | 5.9% | +0.65만 | 5.65만 |
| 가이드비용 | 5만 | 5.9% | +0.65만 | 5.65만 |
| 기타 | 5만 | 5.9% | +0.64만 | 5.64만 |
| **합계** | **100만** | — | **+11만** | **111만** |

### 소수점 처리
마지막 배분 대상 항목에 rounding remainder 몰아주기 → 총합 정확히 일치

### 적용 시점
- 선택 전 엑셀 다운로드: 일정표 시트의 총액/1인당에만 반영 (breakdown 없으므로)
- 선택 후 견적서 웹 UI / 엑셀: breakdown 항목에 비례 배분하여 녹임

---

## 7. DB 설계

### 신규 테이블: `agency_markups`
```sql
CREATE TABLE agency_markups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id uuid REFERENCES quotes(id) NOT NULL,
  agency_id uuid REFERENCES profiles(id) NOT NULL,
  markup_per_person numeric NOT NULL DEFAULT 0,
  markup_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(quote_id, agency_id)
);
```
- 견적 비교 단계에서의 임시 마크업 저장
- upsert로 업데이트

### 신규 테이블: `quote_settlements`
```sql
CREATE TABLE quote_settlements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL UNIQUE,
  quote_id uuid REFERENCES quotes(id) NOT NULL,
  landco_id uuid REFERENCES profiles(id) NOT NULL,
  agency_id uuid REFERENCES profiles(id) NOT NULL,
  landco_amount numeric NOT NULL,        -- 랜드사 원가
  platform_margin numeric NOT NULL,      -- 플랫폼 마진 금액
  platform_margin_rate numeric NOT NULL,  -- 플랫폼 마진율 (예: 0.05)
  agency_markup numeric NOT NULL,        -- 대리점 마크업
  total_amount numeric NOT NULL,         -- 최종 고객가
  landco_settled boolean DEFAULT false,  -- 랜드사 정산 완료
  agency_settled boolean DEFAULT false,  -- 대리점 수수료 지급 완료
  created_at timestamptz DEFAULT now()
);
```
- 견적 최종 선택 시 생성
- 정산 흐름의 핵심 테이블

### 신규 테이블: `platform_settings`
```sql
CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- 초기 데이터
INSERT INTO platform_settings (key, value) VALUES ('margin_rate', '"0.05"');
```

---

## 8. 정산 흐름

```
고객 결제: 111만원 → 플랫폼 계좌로 입금

정산 출금:
  ① 랜드사 정산: 95만원 (기존 프로세스)
  ② 대리점 수수료: 11만원 (세금계산서 역발행 후 지급)
  ③ 플랫폼 수익: 5만원 (잔액)
```

- 랜드사(landco): 기존처럼 정산 지급
- 대리점(agency): 마크업분에 대해 세금계산서 역발행 후 수수료 지급
- 두 정산은 별개 프로세스로 분리

---

## 9. 세무 이슈

- 알선 사업자이므로 현금영수증은 플랫폼 마진분만 발행 가능 (FM 기준)
- 전액 발행은 세무 리스크 → 재무팀 논의 후 결정 필요
- 기본 원칙: 전액 발행 불가, 마진분만 가능

---

## 10. 추가금 처리

- 현지 추가 비용 발생 시 → 새 견적 생성하여 차액 청구
- 랜드사가 고객에게 직접 청구 불가 (플랫폼 경유 필수)

---

## 11. 웹 UI 컴포넌트 구조

### 견적 상세 페이지: `/agency/quotes/[quoteId]`
- URL로 접근하는 별도 페이지 (모달 아님)
- 탭: 일정표 | 견적서 (선택 전에는 견적서 탭 숨김)
- 상단: 총액 + 1인당 금액 (항상 표시)
- 하단: 엑셀 다운로드 버튼

### 일정표 컴포넌트: `ItineraryView`
- `ItineraryDay[]` JSON → React 테이블 렌더링
- 일자별 일정, 식사, 숙박 정보 표시
- 기존 엑셀 일정표와 동일한 레이아웃

### 견적서 컴포넌트: `PricingView`
- `PricingData` JSON → React 테이블 렌더링
- 카테고리별 breakdown (호텔, 차량, 식사, 입장료, 가이드비용, 기타)
- 마크업 반영된 금액 표시 (마크업은 비례 배분, 식사 제외)
- 다중 통화 지원 (환율 적용)

### 엑셀 다운로드 API: `GET /api/quotes/[id]/download`
- 선택 전: 일정표 시트 + 총액/1인당 (마크업 반영)
- 선택 후: 일정표 시트 + 견적서 시트 (마크업 녹아든 breakdown)
- 기존 `generateFilledQuoteTemplate()` 재활용 + 마크업 로직 추가
