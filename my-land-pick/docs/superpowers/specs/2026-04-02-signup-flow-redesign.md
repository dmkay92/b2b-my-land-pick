# 회원가입 플로우 재설계 스펙

## 개요

현재의 단순 폼(역할 선택 + 회사명 + 이메일 + 비밀번호)을 5단계 multi-step wizard로 교체한다.
서류 업로드 → AI OCR 자동 채움 → 국세청 사업자 검증 → 승인 대기 페이지 개선을 포함한다.

---

## 아키텍처

### 컴포넌트 구조

- `src/app/(auth)/signup/page.tsx` — 기존 단순 폼 → `SignupWizard` 컴포넌트 렌더링
- `src/app/(auth)/signup/SignupWizard.tsx` — wizard state 관리, sessionStorage 백업
- `src/app/(auth)/signup/steps/Step1Role.tsx` — 회사 유형 선택
- `src/app/(auth)/signup/steps/Step2Documents.tsx` — 서류 업로드 + OCR 처리
- `src/app/(auth)/signup/steps/Step3BasicInfo.tsx` — 기본 정보 확인 + 이메일/연락처 수동 입력
- `src/app/(auth)/signup/steps/Step4BankInfo.tsx` — 계좌 정보 확인
- `src/app/(auth)/signup/steps/Step5Countries.tsx` — 담당 국가 (랜드사만)
- `src/app/pending/page.tsx` — 승인 대기 페이지 개선

### API Routes (신규)

- `POST /api/signup/ocr` — 업로드된 파일(사업자등록증 or 통장사본)을 Claude Vision으로 OCR 처리 후 필드 추출 반환
- `POST /api/signup/validate-brn` — 사업자등록번호 국세청 Open API 검증

### Supabase

**Storage bucket:** `signup-documents` (public: false)
- 경로: `{userId}/biz-registration.{ext}` (사업자등록증)
- 경로: `{userId}/bank-statement.{ext}` (통장사본)
- admin이 파트너 목록에서 서명된 URL로 다운로드 가능하도록 영구 보관

**profiles 테이블 신규 컬럼:**
```sql
business_registration_number TEXT,
representative_name           TEXT,
phone_landline                TEXT,       -- 옵셔널
phone_mobile                  TEXT,
bank_name                     TEXT,
bank_account                  TEXT,
bank_holder                   TEXT,
document_biz_url              TEXT,       -- Storage 경로
document_bank_url             TEXT,       -- Storage 경로
assigned_countries            JSONB       -- 랜드사만, [{name: string}]
```

---

## Wizard 단계 상세

### Step 1 — 회사 유형 선택

- 라디오 버튼 대신 큰 카드 2개 (여행사 / 랜드사)
- 카드 클릭 시 즉시 Step 2로 이동 (별도 "다음" 버튼 없음)
- 상단 메시지: *"어떤 유형으로 가입하시나요?"*

### Step 2 — 서류 업로드

수집: 사업자등록증, 통장사본

- 각각 드래그앤드롭 영역 (클릭으로도 파일 선택 가능)
- 지원 형식: PDF, JPG, PNG
- 두 파일 모두 업로드 완료 시 "AI가 서류를 읽고 있어요..." 로딩 상태 표시
- `/api/signup/ocr` 호출 (두 파일 병렬 처리, `multipart/form-data`로 파일 전송)
- OCR 완료 후 자동으로 Step 3으로 이동
- **파일 객체는 클라이언트 메모리에 유지** — Storage 업로드는 최종 제출 시 (userId 획득 후) 수행
- 상단 메시지: *"서류를 올리면 나머지는 자동으로 채워드릴게요"*

**OCR 추출 필드:**
- 사업자등록증 → `business_registration_number`, `company_name`, `representative_name`
- 통장사본 → `bank_name`, `bank_account`, `bank_holder`

### Step 3 — 기본 정보 확인

두 개의 시각적 섹션으로 구분:

**섹션 A — "AI가 채워드렸어요"** (연한 녹색 배경, 체크 아이콘)
- 사업자등록번호 (입력과 동시에 국세청 API 실시간 검증 → 유효/무효 뱃지)
- 사업자명
- 대표자명
- 모두 수정 가능

**섹션 B — "직접 입력해주세요"** (구분선 + 별도 레이블)
- 안내 텍스트: *"아래 항목은 로그인 및 연락에 사용되니 직접 입력해주세요"*
- 대표 이메일 (필수, 로그인 계정)
- 대표 무선 연락처 (필수)
- 대표 유선 연락처 (옵셔널)

상단 메시지: *"AI가 채워드렸어요. 내용을 확인하고 연락처를 입력해주세요"*

### Step 4 — 계좌 정보 확인

- 은행명, 계좌번호, 예금주명 (통장사본 OCR로 자동 채움, 수정 가능)
- 상단 메시지: *"거의 다 왔어요! 정산 계좌를 확인해주세요"*

### Step 5 — 담당 국가 (랜드사만)

- 텍스트 입력 → 하드코딩된 국가 목록 자동완성 드롭다운 표시
- `+` 버튼으로 국가 row 추가, `×`로 제거
- 최소 1개 필수
- 상단 메시지: *"마지막이에요! 담당 국가를 선택해주세요"*

### 최종 제출

1. `supabase.auth.signUp({ email, password, options: { data: { role, company_name } } })`
2. 사업자등록증 → Storage `{userId}/biz-registration.{ext}` 업로드
3. 통장사본 → Storage `{userId}/bank-statement.{ext}` 업로드
4. `profiles` 테이블에 모든 수집 정보 upsert (Storage 경로 포함)
5. `/pending`으로 redirect

---

## 진행 표시 (Progress Indicator)

- 각 단계 상단에 현재 단계를 나타내는 진행 바 (예: 채워지는 바 형태)
- **총 단계 수는 표시하지 않음** — 현재 어디까지 왔는지만 시각화
- 이전 단계로 돌아가는 "← 이전" 버튼 제공 (Step 1 제외)

---

## sessionStorage 백업

- key: `signup_draft`
- 저장 시점: 각 단계 "다음" 클릭 시
- 복원 시점: 컴포넌트 마운트 시 (`useEffect`)
- 저장 내용: `{ role, step, ocr: { biz, bank }, basicInfo, bankInfo, countries }` — **파일 자체는 저장하지 않음** (File 객체는 직렬화 불가), 파일 손실 시 Step 2부터 재업로드
- 가입 완료 또는 페이지 벗어날 때 삭제

---

## Pending 페이지 개선

**헤더:** *"OO여행사님의 가입 신청이 접수되었어요"* (profiles에서 company_name 읽기)

**진행 상태 시각화:** 3단계 스텝퍼
1. 신청 완료 ✓ (완료 상태)
2. 서류 검토 중 (현재 상태 — 강조)
3. 승인 완료 (미완료)

**안내 텍스트:** *"영업일 기준 1–2일 내에 검토 후 가입 승인 이메일을 보내드려요"*

**문의:** 승인 관련 문의 이메일 표시 (환경변수 `NEXT_PUBLIC_SUPPORT_EMAIL`로 관리)

**로그아웃 버튼:** 현재 로고 클릭 로그아웃 → 명시적 "로그아웃" 버튼으로 변경

---

## 국세청 사업자등록번호 검증

- 공공데이터포털 국세청 사업자등록정보 진위확인 API 사용
- API key: 환경변수 `NTS_API_KEY`
- `POST /api/signup/validate-brn` — 서버사이드에서 호출 (키 노출 방지)
- 응답: `{ valid: boolean, companyName?: string }` — 유효 시 사업자명도 반환해 필드 채움

---

## Admin 서류 다운로드

- 기존 admin 파트너 목록 페이지(`/admin/agencies`, `/admin/landcos`)에 서류 다운로드 버튼 추가
- `supabase.storage.from('signup-documents').createSignedUrl(path, 3600)`으로 서명된 URL 생성 후 다운로드
