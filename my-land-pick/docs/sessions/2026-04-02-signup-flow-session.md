# 2026-04-02 작업 세션 요약 — 회원가입 플로우 개선

## 완료된 작업

### 인프라 / API
| 항목 | 파일 |
|------|------|
| DB 마이그레이션 (profiles 9개 신규 컬럼 + signup-documents 버킷) | `supabase/migrations/20260402000001_signup_fields.sql` |
| OCR API (Google Gemini Vision) | `src/app/api/signup/ocr/route.ts` |
| 사업자등록번호 국세청 검증 API | `src/app/api/signup/validate-brn/route.ts` |
| 이메일 인증 코드 발송 API (Resend) | `src/app/api/signup/send-email-code/route.ts` |
| 이메일 인증 코드 확인 API (HMAC) | `src/app/api/signup/verify-email-code/route.ts` |

### 회원가입 Wizard (5단계)
| 단계 | 파일 |
|------|------|
| 공통 Wizard 상태 관리 + sessionStorage 백업 | `src/app/(auth)/signup/SignupWizard.tsx` |
| Step 1 — 회사 유형 선택 (여행사/랜드사) | `steps/Step1Role.tsx` |
| Step 2 — 서류 업로드 (드래그앤드롭 + OCR) | `steps/Step2Documents.tsx` |
| Step 3 — 기본 정보 확인 + 이메일/연락처 입력 | `steps/Step3BasicInfo.tsx` |
| Step 4 — 계좌 정보 확인 | `steps/Step4BankInfo.tsx` |
| Step 5 — 담당 국가 선택 (랜드사 전용) | `steps/Step5Countries.tsx` |
| 승인 대기 페이지 개선 | `src/app/pending/page.tsx` |
| Admin 서류 다운로드 버튼 | `admin/agencies/page.tsx`, `admin/landcos/page.tsx` |

---

## 미완료 / 추후 작업

### Supabase 마이그레이션 수동 실행 필요
Supabase 대시보드 → SQL Editor에서 아래 파일 실행:
```
supabase/migrations/20260402000001_signup_fields.sql
```

### 환경변수 설정 필요
```env
GEMINI_API_KEY=...           # Google AI Studio에서 발급
NTS_SERVICE_KEY=...          # 공공데이터포털 국세청 API (없으면 10자리 자릿수 체크로 fallback)
RESEND_FROM_EMAIL=...        # Resend 인증 도메인의 발신 이메일
NEXT_PUBLIC_SUPPORT_EMAIL=...  # 승인 문의 이메일 (pending 페이지 표시용)
```

### 이메일 인증 (Resend 도메인 설정 필요)
- `RESEND_FROM_EMAIL` 설정 + Resend 대시보드에서 도메인 인증 완료 후 실제 발송 가능
- 현재는 API 라우트까지 완성, 발송만 미동작

---

## 주요 기술 결정

- **OCR 모델**: `gemini-2.5-flash` (v1beta API, `@google/generative-ai` v0.24.1)
- **이메일 인증**: HMAC-SHA256 서명 토큰 방식 (서버리스 환경, DB 불필요), 유효시간 10분
- **비밀번호 강도**: 대문자·소문자·숫자·특수문자·8자 이상 5개 조건 실시간 체크
- **전화번호 포맷**: 핸드폰 `010-0000-0000`, 유선 `02/0XX` 지역번호 자동 감지
- **국가코드**: 취급 국가 39개, 한국(+82) 기본값, 가나다순 정렬
- **Hydration 이슈 해결**: sessionStorage 복원을 `useEffect`로 마운트 후 실행

---

## 커밋 범위
`64c1350` (spec 작성) → `51a009f` (admin 서류 다운로드) + 세션 중 미커밋 변경사항 포함
