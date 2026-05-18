# 회원가입 플로우 재설계 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단순 회원가입 폼을 5단계 multi-step wizard로 교체 — 서류 업로드 → Claude Vision OCR 자동 채움 → 국세청 사업자번호 검증 → 계좌 확인 → 담당 국가(랜드사 전용) → 승인 대기 페이지 개선

**Architecture:** sessionStorage로 단계별 state를 백업하는 React wizard 컴포넌트. Claude Vision으로 서류 OCR, 국세청 Open API로 사업자번호 검증. 최종 제출 시 auth.signUp → Supabase Storage 파일 업로드 → profiles upsert 순서로 처리.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + Storage + Auth), @anthropic-ai/sdk (Claude Vision), Tailwind CSS v4, TypeScript

---

## File Structure

**신규 파일:**
- `supabase/migrations/20260402000001_signup_fields.sql` — profiles 신규 컬럼 + signup-documents 버킷 + RLS
- `src/app/api/signup/ocr/route.ts` — Claude Vision OCR API (비인증 공개 route)
- `src/app/api/signup/validate-brn/route.ts` — 국세청 사업자번호 검증 API (비인증 공개 route)
- `src/app/(auth)/signup/SignupWizard.tsx` — wizard state 관리 + sessionStorage 백업 + 최종 제출
- `src/app/(auth)/signup/steps/Step1Role.tsx` — 회사 유형 카드 선택
- `src/app/(auth)/signup/steps/Step2Documents.tsx` — 서류 드래그앤드롭 + OCR 트리거
- `src/app/(auth)/signup/steps/Step3BasicInfo.tsx` — AI 채움 확인 + 이메일/연락처 수동 입력
- `src/app/(auth)/signup/steps/Step4BankInfo.tsx` — 계좌 정보 확인 (통장사본 OCR 자동 채움)
- `src/app/(auth)/signup/steps/Step5Countries.tsx` — 담당 국가 선택 (랜드사 전용)

**수정 파일:**
- `src/lib/supabase/types.ts` — Profile 타입 신규 필드 + SignupDraft 타입 추가
- `src/app/(auth)/signup/page.tsx` — SignupWizard 렌더링으로 교체
- `src/app/pending/page.tsx` — 개선된 승인 대기 페이지 (단계 표시 + 회사명 표시)
- `src/app/(dashboard)/admin/agencies/page.tsx` — 서류 다운로드 버튼 추가
- `src/app/(dashboard)/admin/landcos/page.tsx` — 서류 다운로드 버튼 추가

---

### Task 1: DB Migration — profiles 신규 컬럼 + Storage 버킷

**Files:**
- Create: `supabase/migrations/20260402000001_signup_fields.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260402000001_signup_fields.sql

-- profiles 신규 컬럼
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS representative_name TEXT,
  ADD COLUMN IF NOT EXISTS phone_landline TEXT,
  ADD COLUMN IF NOT EXISTS phone_mobile TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_holder TEXT,
  ADD COLUMN IF NOT EXISTS document_biz_url TEXT,
  ADD COLUMN IF NOT EXISTS document_bank_url TEXT;

-- signup-documents Storage 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('signup-documents', 'signup-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 본인 폴더에만 업로드 가능
CREATE POLICY "Users upload own signup docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signup-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: 본인 파일 읽기 + admin 전체 읽기
CREATE POLICY "Users read own signup docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'signup-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );
```

- [ ] **Step 2: Supabase 대시보드 SQL Editor에서 위 SQL 실행**

  Supabase 대시보드 → SQL Editor에 위 내용 붙여넣고 실행. 오류 없이 완료 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260402000001_signup_fields.sql
git commit -m "feat: add signup fields migration and signup-documents storage bucket"
```

---

### Task 2: Anthropic SDK 설치 + 환경변수 추가

**Files:**
- Modify: `package.json` (npm install로 자동 수정)
- Modify: `.env.local`

- [ ] **Step 1: Anthropic SDK 설치**

```bash
cd /path/to/project
npm install @anthropic-ai/sdk
```

Expected: `added X packages` 메시지. `package.json` dependencies에 `"@anthropic-ai/sdk"` 추가됨 확인.

- [ ] **Step 2: .env.local에 환경변수 추가**

`.env.local` 파일에 아래 두 줄 추가:

```
ANTHROPIC_API_KEY=sk-ant-...  # Anthropic 콘솔에서 발급
NTS_SERVICE_KEY=...           # data.go.kr에서 발급한 국세청 API 서비스키
NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com  # 문의 이메일
```

> 참고: 국세청 API key가 없으면 Task 5의 validate-brn route에서 mock 응답을 반환하도록 fallback 처리됨.

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "feat: install @anthropic-ai/sdk for OCR"
```

---

### Task 3: 타입 업데이트 — Profile 확장 + SignupDraft 추가

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Profile 인터페이스에 신규 필드 추가**

`src/lib/supabase/types.ts`의 `Profile` 인터페이스를:

```ts
export interface Profile {
  id: string
  email: string
  role: UserRole
  company_name: string
  status: UserStatus
  country_codes: string[]
  created_at: string
  approved_at: string | null
}
```

아래로 교체:

```ts
export interface Profile {
  id: string
  email: string
  role: UserRole
  company_name: string
  status: UserStatus
  country_codes: string[]
  created_at: string
  approved_at: string | null
  // 회원가입 wizard 신규 필드
  business_registration_number: string | null
  representative_name: string | null
  phone_landline: string | null
  phone_mobile: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  document_biz_url: string | null
  document_bank_url: string | null
}
```

- [ ] **Step 2: SignupDraft 타입 추가**

`types.ts` 파일 끝에 추가:

```ts
export interface SignupOcrResult {
  business_registration_number: string
  company_name: string
  representative_name: string
}

export interface BankOcrResult {
  bank_name: string
  bank_account: string
  bank_holder: string
}

export interface SignupDraft {
  role: UserRole | null
  step: number
  ocr: {
    biz: SignupOcrResult | null
    bank: BankOcrResult | null
  }
  basicInfo: {
    business_registration_number: string
    company_name: string
    representative_name: string
    email: string
    password: string
    phone_mobile: string
    phone_landline: string
  } | null
  bankInfo: {
    bank_name: string
    bank_account: string
    bank_holder: string
  } | null
  countries: string[]
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: extend Profile type and add SignupDraft types"
```

---

### Task 4: OCR API Route

**Files:**
- Create: `src/app/api/signup/ocr/route.ts`

이 route는 `multipart/form-data`로 파일을 받아 Claude Vision으로 텍스트를 추출한다.
`type` 파라미터로 `biz`(사업자등록증) 또는 `bank`(통장사본)를 구분한다.
인증 없이 호출 가능 (회원가입 전 단계이므로).

- [ ] **Step 1: route 파일 작성**

```ts
// src/app/api/signup/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BIZ_PROMPT = `이 이미지는 한국 사업자등록증입니다. 다음 정보를 JSON으로 추출해주세요:
{
  "business_registration_number": "사업자등록번호 (숫자 10자리, 하이픈 없이)",
  "company_name": "상호(법인명)",
  "representative_name": "대표자 성명"
}
찾을 수 없는 필드는 빈 문자열("")로 반환하세요. JSON만 반환하고 다른 텍스트는 포함하지 마세요.`

const BANK_PROMPT = `이 이미지는 한국 통장 사본입니다. 다음 정보를 JSON으로 추출해주세요:
{
  "bank_name": "은행명 (예: 국민은행, 신한은행)",
  "bank_account": "계좌번호 (숫자와 하이픈만)",
  "bank_holder": "예금주명"
}
찾을 수 없는 필드는 빈 문자열("")로 반환하세요. JSON만 반환하고 다른 텍스트는 포함하지 마세요.`

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as 'biz' | 'bank' | null

  if (!file || !type) {
    return NextResponse.json({ error: 'file and type required' }, { status: 400 })
  }
  if (!['biz', 'bank'].includes(type)) {
    return NextResponse.json({ error: 'type must be biz or bank' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'application/pdf'

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType === 'application/pdf' ? 'image/jpeg' : mediaType, data: base64 },
            },
            { type: 'text', text: type === 'biz' ? BIZ_PROMPT : BANK_PROMPT },
          ],
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'OCR 결과를 파싱할 수 없습니다.' }, { status: 422 })
    }
    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json({ result })
  } catch (err) {
    console.error('OCR error:', err)
    return NextResponse.json({ error: 'OCR 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
```

> 참고: PDF 파일의 경우 Claude Vision은 PDF를 직접 처리하지 못한다. 실제 운영 시 PDF→이미지 변환이 필요하지만, MVP에서는 JPG/PNG를 권장하도록 UI에서 안내한다. `media_type`을 `image/jpeg`로 fallback 처리.

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/signup/ocr/route.ts
git commit -m "feat: add OCR API route using Claude Vision"
```

---

### Task 5: 사업자번호 검증 API Route

**Files:**
- Create: `src/app/api/signup/validate-brn/route.ts`

국세청 공공데이터포털 API로 사업자등록번호 유효성을 확인한다.
`NTS_SERVICE_KEY`가 없으면 mock 응답을 반환한다.

- [ ] **Step 1: route 파일 작성**

```ts
// src/app/api/signup/validate-brn/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { brn } = await request.json()

  if (!brn || typeof brn !== 'string') {
    return NextResponse.json({ error: 'brn required' }, { status: 400 })
  }

  const clean = brn.replace(/[^0-9]/g, '')
  if (clean.length !== 10) {
    return NextResponse.json({ valid: false, message: '사업자등록번호는 10자리입니다.' })
  }

  const serviceKey = process.env.NTS_SERVICE_KEY
  if (!serviceKey) {
    // NTS API key 없을 때 mock: 10자리이면 유효로 처리
    return NextResponse.json({ valid: true, message: '(검증 생략: API 키 미설정)' })
  }

  try {
    const res = await fetch(
      `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(serviceKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ b_no: [clean] }),
      }
    )
    const data = await res.json()
    const item = data?.data?.[0]
    if (!item) {
      return NextResponse.json({ valid: false, message: '사업자 정보를 조회할 수 없습니다.' })
    }
    // b_stt_cd: '01' = 계속사업자, '02' = 휴업, '03' = 폐업
    const valid = item.b_stt_cd === '01'
    return NextResponse.json({
      valid,
      message: valid ? '정상 사업자입니다.' : `사업자 상태: ${item.b_stt ?? '확인 불가'}`,
      company_name: item.tax_type !== '국세청에 등록되지 않은 사업자입니다.' ? undefined : undefined,
    })
  } catch (err) {
    console.error('BRN validation error:', err)
    return NextResponse.json({ valid: false, message: '사업자번호 검증 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/signup/validate-brn/route.ts
git commit -m "feat: add business registration number validation API route"
```

---

### Task 6: Step1Role 컴포넌트

**Files:**
- Create: `src/app/(auth)/signup/steps/Step1Role.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(auth)/signup/steps/Step1Role.tsx
import type { UserRole } from '@/lib/supabase/types'

interface Props {
  onSelect: (role: UserRole) => void
}

export function Step1Role({ onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">어떤 유형으로 가입하시나요?</h2>
        <p className="mt-1 text-sm text-gray-500">가입 유형은 이후 변경이 어려우니 신중하게 선택해주세요.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onSelect('agency')}
          className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-center hover:border-blue-500 hover:bg-blue-50 transition-all"
        >
          <span className="text-4xl">✈️</span>
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-blue-700">여행사</p>
            <p className="mt-1 text-xs text-gray-400">인센티브 여행 견적을 요청하는 업체</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onSelect('landco')}
          className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-center hover:border-blue-500 hover:bg-blue-50 transition-all"
        >
          <span className="text-4xl">🌍</span>
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-blue-700">랜드사</p>
            <p className="mt-1 text-xs text-gray-400">현지 여행 서비스를 제공하는 업체</p>
          </div>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(auth)/signup/steps/Step1Role.tsx
git commit -m "feat: add Step1Role wizard component"
```

---

### Task 7: Step2Documents 컴포넌트

**Files:**
- Create: `src/app/(auth)/signup/steps/Step2Documents.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(auth)/signup/steps/Step2Documents.tsx
'use client'

import { useState, useRef } from 'react'
import type { SignupOcrResult, BankOcrResult } from '@/lib/supabase/types'

interface Props {
  onComplete: (bizFile: File, bankFile: File, biz: SignupOcrResult, bank: BankOcrResult) => void
  onBack: () => void
}

function DropZone({
  label,
  hint,
  file,
  onFile,
}: {
  label: string
  hint: string
  file: File | null
  onFile: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
        file ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]) }}
      />
      {file ? (
        <>
          <span className="text-2xl">✅</span>
          <p className="text-sm font-medium text-green-700">{file.name}</p>
          <p className="text-xs text-green-500">클릭하여 파일 변경</p>
        </>
      ) : (
        <>
          <span className="text-2xl">📄</span>
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">{hint}</p>
          <p className="text-xs text-gray-300">JPG, PNG, PDF</p>
        </>
      )}
    </div>
  )
}

async function runOcr(file: File, type: 'biz' | 'bank') {
  const form = new FormData()
  form.append('file', file)
  form.append('type', type)
  const res = await fetch('/api/signup/ocr', { method: 'POST', body: form })
  if (!res.ok) throw new Error('OCR 처리 실패')
  const { result } = await res.json()
  return result
}

export function Step2Documents({ onComplete, onBack }: Props) {
  const [bizFile, setBizFile] = useState<File | null>(null)
  const [bankFile, setBankFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canProceed = bizFile && bankFile

  async function handleNext() {
    if (!bizFile || !bankFile) return
    setLoading(true)
    setError(null)
    try {
      const [biz, bank] = await Promise.all([
        runOcr(bizFile, 'biz'),
        runOcr(bankFile, 'bank'),
      ])
      onComplete(bizFile, bankFile, biz, bank)
    } catch {
      setError('서류 읽기에 실패했습니다. 이미지가 선명한지 확인 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">서류를 올리면 나머지는 자동으로 채워드릴게요</h2>
        <p className="mt-1 text-sm text-gray-500">선명한 이미지나 PDF를 올려주세요. AI가 내용을 읽어 자동으로 입력해드려요.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DropZone
          label="사업자등록증"
          hint="사업자 정보 자동 입력에 사용"
          file={bizFile}
          onFile={setBizFile}
        />
        <DropZone
          label="통장 사본"
          hint="계좌 정보 자동 입력에 사용"
          file={bankFile}
          onFile={setBankFile}
        />
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500">AI가 서류를 읽고 있어요...</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ← 이전
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed || loading}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {loading ? '읽는 중...' : '다음'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(auth)/signup/steps/Step2Documents.tsx
git commit -m "feat: add Step2Documents wizard component with drag-and-drop and OCR"
```

---

### Task 8: Step3BasicInfo 컴포넌트

**Files:**
- Create: `src/app/(auth)/signup/steps/Step3BasicInfo.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(auth)/signup/steps/Step3BasicInfo.tsx
'use client'

import { useState, useEffect } from 'react'
import type { SignupOcrResult } from '@/lib/supabase/types'

interface BasicInfoValues {
  business_registration_number: string
  company_name: string
  representative_name: string
  email: string
  password: string
  phone_mobile: string
  phone_landline: string
}

interface Props {
  ocr: SignupOcrResult | null
  initial: BasicInfoValues | null
  onNext: (values: BasicInfoValues) => void
  onBack: () => void
}

type BrnStatus = 'idle' | 'loading' | 'valid' | 'invalid'

export function Step3BasicInfo({ ocr, initial, onNext, onBack }: Props) {
  const [values, setValues] = useState<BasicInfoValues>({
    business_registration_number: initial?.business_registration_number ?? ocr?.business_registration_number ?? '',
    company_name: initial?.company_name ?? ocr?.company_name ?? '',
    representative_name: initial?.representative_name ?? ocr?.representative_name ?? '',
    email: initial?.email ?? '',
    password: initial?.password ?? '',
    phone_mobile: initial?.phone_mobile ?? '',
    phone_landline: initial?.phone_landline ?? '',
  })
  const [brnStatus, setBrnStatus] = useState<BrnStatus>('idle')
  const [brnMessage, setBrnMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function set(key: keyof BasicInfoValues, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
    if (key === 'business_registration_number') {
      setBrnStatus('idle')
      setBrnMessage('')
    }
  }

  async function validateBrn() {
    const brn = values.business_registration_number.replace(/[^0-9]/g, '')
    if (brn.length !== 10) {
      setBrnStatus('invalid')
      setBrnMessage('사업자등록번호는 10자리입니다.')
      return
    }
    setBrnStatus('loading')
    const res = await fetch('/api/signup/validate-brn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brn }),
    })
    const data = await res.json()
    setBrnStatus(data.valid ? 'valid' : 'invalid')
    setBrnMessage(data.message ?? '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (brnStatus !== 'valid') {
      setBrnMessage('사업자등록번호를 먼저 검증해주세요.')
      return
    }
    if (values.password.length < 8) return
    onNext(values)
  }

  const isOcrField = (key: keyof BasicInfoValues) =>
    ['business_registration_number', 'company_name', 'representative_name'].includes(key)

  const ocrFields: { key: keyof BasicInfoValues; label: string }[] = [
    { key: 'business_registration_number', label: '사업자등록번호' },
    { key: 'company_name', label: '사업자명(상호)' },
    { key: 'representative_name', label: '대표자명' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">AI가 채워드렸어요</h2>
        <p className="mt-1 text-sm text-gray-500">내용을 확인하고 연락처를 입력해주세요.</p>
      </div>

      {/* AI 채움 섹션 */}
      <div className="rounded-xl bg-green-50 border border-green-100 p-4 space-y-3">
        <p className="text-xs font-medium text-green-700 flex items-center gap-1">
          <span>✅</span> AI가 채워드렸어요 — 수정이 필요하면 변경해주세요
        </p>
        {ocrFields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={values[key]}
                onChange={e => set(key, e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {key === 'business_registration_number' && (
                <button
                  type="button"
                  onClick={validateBrn}
                  disabled={brnStatus === 'loading'}
                  className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {brnStatus === 'loading' ? '확인 중' : '검증'}
                </button>
              )}
            </div>
            {key === 'business_registration_number' && brnMessage && (
              <p className={`mt-1 text-xs ${brnStatus === 'valid' ? 'text-green-600' : 'text-red-500'}`}>
                {brnStatus === 'valid' ? '✓ ' : '✗ '}{brnMessage}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 수동 입력 섹션 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 border-t border-gray-200" />
          <p className="text-xs font-medium text-gray-400 whitespace-nowrap">직접 입력해주세요</p>
          <div className="flex-1 border-t border-gray-200" />
        </div>
        <p className="text-xs text-gray-400">아래 항목은 로그인 및 연락에 사용되니 직접 입력해주세요.</p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">대표 이메일 <span className="text-red-400">*</span></label>
          <input
            type="email"
            required
            value={values.email}
            onChange={e => set('email', e.target.value)}
            placeholder="로그인 계정으로 사용됩니다"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호 <span className="text-red-400">*</span></label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={values.password}
              onChange={e => set('password', e.target.value)}
              placeholder="8자 이상"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
            >
              {showPassword ? '숨기기' : '보기'}
            </button>
          </div>
          {values.password.length > 0 && values.password.length < 8 && (
            <p className="mt-1 text-xs text-red-500">8자 이상 입력해주세요.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">대표 무선 연락처 <span className="text-red-400">*</span></label>
          <input
            type="tel"
            required
            value={values.phone_mobile}
            onChange={e => set('phone_mobile', e.target.value)}
            placeholder="010-0000-0000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            대표 유선 연락처 <span className="text-gray-400 font-normal">(선택)</span>
          </label>
          <input
            type="tel"
            value={values.phone_landline}
            onChange={e => set('phone_landline', e.target.value)}
            placeholder="02-0000-0000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ← 이전
        </button>
        <button
          type="submit"
          disabled={brnStatus !== 'valid'}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          다음
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(auth)/signup/steps/Step3BasicInfo.tsx
git commit -m "feat: add Step3BasicInfo with OCR auto-fill and BRN validation"
```

---

### Task 9: Step4BankInfo 컴포넌트

**Files:**
- Create: `src/app/(auth)/signup/steps/Step4BankInfo.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(auth)/signup/steps/Step4BankInfo.tsx
'use client'

import { useState } from 'react'
import type { BankOcrResult } from '@/lib/supabase/types'

const BANK_OPTIONS = [
  '국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행',
  'IBK기업은행', '카카오뱅크', '토스뱅크', 'SC제일은행', '씨티은행',
  '케이뱅크', '수협은행', '대구은행', '부산은행', '경남은행',
  '광주은행', '전북은행', '제주은행', '산업은행', '우체국',
]

interface Props {
  ocr: BankOcrResult | null
  initial: BankOcrResult | null
  onNext: (values: BankOcrResult) => void
  onBack: () => void
}

export function Step4BankInfo({ ocr, initial, onNext, onBack }: Props) {
  const [values, setValues] = useState<BankOcrResult>({
    bank_name: initial?.bank_name ?? ocr?.bank_name ?? '',
    bank_account: initial?.bank_account ?? ocr?.bank_account ?? '',
    bank_holder: initial?.bank_holder ?? ocr?.bank_holder ?? '',
  })

  function set(key: keyof BankOcrResult, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.bank_name || !values.bank_account || !values.bank_holder) return
    onNext(values)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">거의 다 왔어요!</h2>
        <p className="mt-1 text-sm text-gray-500">정산 계좌를 확인해주세요. 통장 사본에서 자동으로 채워드렸어요.</p>
      </div>

      <div className="rounded-xl bg-green-50 border border-green-100 p-4 space-y-3">
        <p className="text-xs font-medium text-green-700 flex items-center gap-1">
          <span>✅</span> AI가 채워드렸어요 — 수정이 필요하면 변경해주세요
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">은행명 <span className="text-red-400">*</span></label>
          <select
            required
            value={values.bank_name}
            onChange={e => set('bank_name', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">은행을 선택해주세요</option>
            {BANK_OPTIONS.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">계좌번호 <span className="text-red-400">*</span></label>
          <input
            type="text"
            required
            value={values.bank_account}
            onChange={e => set('bank_account', e.target.value)}
            placeholder="계좌번호를 입력해주세요"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">예금주명 <span className="text-red-400">*</span></label>
          <input
            type="text"
            required
            value={values.bank_holder}
            onChange={e => set('bank_holder', e.target.value)}
            placeholder="예금주명을 입력해주세요"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ← 이전
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          다음
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(auth)/signup/steps/Step4BankInfo.tsx
git commit -m "feat: add Step4BankInfo component"
```

---

### Task 10: Step5Countries 컴포넌트 (랜드사 전용)

**Files:**
- Create: `src/app/(auth)/signup/steps/Step5Countries.tsx`

`src/lib/utils.ts`의 `COUNTRY_NAMES` 키 목록을 옵션으로 사용한다.
(JP, CN, TH, VN, PH, SG, MY, ID, HK, TW, US, CA, GB, FR, DE, IT, ES, CH, AT, NL, AU, NZ, AE, TR, GR, PT, CZ, HU, PL, HR, MX, IN, KH, LA, MM, NP, MV, FJ, MO)

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/app/(auth)/signup/steps/Step5Countries.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { getCountryName } from '@/lib/utils'

const ALL_COUNTRY_CODES = [
  'JP', 'CN', 'TH', 'VN', 'PH', 'SG', 'MY', 'ID', 'HK', 'TW',
  'US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'CH', 'AT', 'NL',
  'AU', 'NZ', 'AE', 'TR', 'GR', 'PT', 'CZ', 'HU', 'PL', 'HR',
  'MX', 'IN', 'KH', 'LA', 'MM', 'NP', 'MV', 'FJ', 'MO',
]

interface Props {
  initial: string[]
  onNext: (countries: string[]) => void
  onBack: () => void
}

export function Step5Countries({ initial, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>(initial.length > 0 ? initial : [''])
  const [query, setQuery] = useState<string[]>(initial.map(() => ''))
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIdx(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function addRow() {
    setSelected(prev => [...prev, ''])
    setQuery(prev => [...prev, ''])
  }

  function removeRow(i: number) {
    setSelected(prev => prev.filter((_, idx) => idx !== i))
    setQuery(prev => prev.filter((_, idx) => idx !== i))
    if (openIdx === i) setOpenIdx(null)
  }

  function selectCountry(i: number, code: string) {
    setSelected(prev => prev.map((c, idx) => idx === i ? code : c))
    setQuery(prev => prev.map((q, idx) => idx === i ? getCountryName(code) : q))
    setOpenIdx(null)
  }

  function handleQueryChange(i: number, val: string) {
    setQuery(prev => prev.map((q, idx) => idx === i ? val : q))
    setSelected(prev => prev.map((c, idx) => idx === i ? '' : c))
    setOpenIdx(i)
  }

  function filteredOptions(i: number) {
    const q = query[i].toLowerCase()
    const alreadySelected = new Set(selected.filter((_, idx) => idx !== i))
    return ALL_COUNTRY_CODES
      .filter(code => !alreadySelected.has(code))
      .filter(code => !q || getCountryName(code).toLowerCase().includes(q) || code.toLowerCase().includes(q))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = selected.filter(c => c !== '')
    if (valid.length === 0) return
    onNext(valid)
  }

  const allFilled = selected.every(c => c !== '')

  return (
    <form onSubmit={handleSubmit} className="space-y-6" ref={containerRef}>
      <div>
        <h2 className="text-xl font-bold text-gray-900">마지막이에요!</h2>
        <p className="mt-1 text-sm text-gray-500">담당하는 국가를 선택해주세요. 나중에 추가/변경도 가능해요.</p>
      </div>

      <div className="space-y-2">
        {selected.map((code, i) => (
          <div key={i} className="relative flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query[i]}
                onChange={e => handleQueryChange(i, e.target.value)}
                onFocus={() => setOpenIdx(i)}
                placeholder="국가명을 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {openIdx === i && filteredOptions(i).length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-md">
                  {filteredOptions(i).slice(0, 20).map(optCode => (
                    <li
                      key={optCode}
                      onMouseDown={() => selectCountry(i, optCode)}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                    >
                      {getCountryName(optCode)} <span className="text-gray-400 text-xs">{optCode}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selected.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-red-400 hover:border-red-200"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          disabled={!allFilled}
          className="flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 py-2 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
        >
          + 국가 추가
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ← 이전
        </button>
        <button
          type="submit"
          disabled={!allFilled || selected.filter(c => c !== '').length === 0}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          가입 신청
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(auth)/signup/steps/Step5Countries.tsx
git commit -m "feat: add Step5Countries component for landco signup"
```

---

### Task 11: SignupWizard + signup page 교체

**Files:**
- Create: `src/app/(auth)/signup/SignupWizard.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`

SignupWizard는 state 관리, sessionStorage 백업, 최종 제출(auth.signUp + Storage upload + profiles upsert)을 담당한다.

- [ ] **Step 1: SignupWizard 작성**

```tsx
// src/app/(auth)/signup/SignupWizard.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SignupDraft, UserRole } from '@/lib/supabase/types'
import { Step1Role } from './steps/Step1Role'
import { Step2Documents } from './steps/Step2Documents'
import { Step3BasicInfo } from './steps/Step3BasicInfo'
import { Step4BankInfo } from './steps/Step4BankInfo'
import { Step5Countries } from './steps/Step5Countries'

const DRAFT_KEY = 'signup_draft'

function getInitialDraft(): SignupDraft {
  if (typeof window === 'undefined') return { role: null, step: 1, ocr: { biz: null, bank: null }, basicInfo: null, bankInfo: null, countries: [] }
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { role: null, step: 1, ocr: { biz: null, bank: null }, basicInfo: null, bankInfo: null, countries: [] }
}

function ProgressBar({ step, role }: { step: number; role: UserRole | null }) {
  const total = role === 'landco' ? 5 : 4
  const pct = Math.round(((step - 1) / total) * 100)
  return (
    <div className="mb-8">
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function SignupWizard() {
  const router = useRouter()
  const [draft, setDraft] = useState<SignupDraft>(getInitialDraft)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const bizFileRef = useRef<File | null>(null)
  const bankFileRef = useRef<File | null>(null)

  function updateDraft(patch: Partial<SignupDraft>) {
    setDraft(prev => {
      const next = { ...prev, ...patch }
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  async function handleFinalSubmit(countries: string[]) {
    if (!draft.basicInfo || !draft.bankInfo) return
    setSubmitting(true)
    setSubmitError(null)

    const supabase = createClient()

    // 1. auth.signUp
    const { data, error: signupError } = await supabase.auth.signUp({
      email: draft.basicInfo.email,
      password: draft.basicInfo.password,
      options: {
        data: {
          role: draft.role,
          company_name: draft.basicInfo.company_name,
        },
      },
    })

    if (signupError || !data.user) {
      setSubmitError(signupError?.message ?? '가입에 실패했습니다.')
      setSubmitting(false)
      return
    }

    const userId = data.user.id

    // 2. Storage 파일 업로드
    let bizUrl: string | null = null
    let bankUrl: string | null = null

    if (bizFileRef.current) {
      const ext = bizFileRef.current.name.split('.').pop() ?? 'jpg'
      const { data: bizData } = await supabase.storage
        .from('signup-documents')
        .upload(`${userId}/biz-registration.${ext}`, bizFileRef.current, { upsert: true })
      bizUrl = bizData?.path ?? null
    }

    if (bankFileRef.current) {
      const ext = bankFileRef.current.name.split('.').pop() ?? 'jpg'
      const { data: bankData } = await supabase.storage
        .from('signup-documents')
        .upload(`${userId}/bank-statement.${ext}`, bankFileRef.current, { upsert: true })
      bankUrl = bankData?.path ?? null
    }

    // 3. profiles upsert (trigger가 기본 필드 생성, 여기서 추가 정보 업데이트)
    await supabase.from('profiles').update({
      business_registration_number: draft.basicInfo.business_registration_number,
      representative_name: draft.basicInfo.representative_name,
      phone_mobile: draft.basicInfo.phone_mobile,
      phone_landline: draft.basicInfo.phone_landline || null,
      bank_name: draft.bankInfo.bank_name,
      bank_account: draft.bankInfo.bank_account,
      bank_holder: draft.bankInfo.bank_holder,
      document_biz_url: bizUrl,
      document_bank_url: bankUrl,
      ...(draft.role === 'landco' ? { country_codes: countries } : {}),
    }).eq('id', userId)

    // 4. sessionStorage 정리
    try { sessionStorage.removeItem(DRAFT_KEY) } catch {}

    router.push('/pending')
  }

  const { step, role } = draft

  // agency는 4단계, landco는 5단계
  // step 5는 랜드사만 존재

  if (step === 1) {
    return (
      <div>
        <Step1Role
          onSelect={selectedRole => updateDraft({ role: selectedRole, step: 2 })}
        />
      </div>
    )
  }

  if (step === 2) {
    return (
      <div>
        <ProgressBar step={2} role={role} />
        <Step2Documents
          onComplete={(bizFile, bankFile, biz, bank) => {
            bizFileRef.current = bizFile
            bankFileRef.current = bankFile
            updateDraft({ ocr: { biz, bank }, step: 3 })
          }}
          onBack={() => updateDraft({ step: 1 })}
        />
      </div>
    )
  }

  if (step === 3) {
    return (
      <div>
        <ProgressBar step={3} role={role} />
        <Step3BasicInfo
          ocr={draft.ocr.biz}
          initial={draft.basicInfo}
          onNext={basicInfo => updateDraft({ basicInfo, step: 4 })}
          onBack={() => updateDraft({ step: 2 })}
        />
      </div>
    )
  }

  if (step === 4) {
    const isLastStep = role !== 'landco'
    return (
      <div>
        <ProgressBar step={4} role={role} />
        <Step4BankInfo
          ocr={draft.ocr.bank}
          initial={draft.bankInfo}
          onNext={bankInfo => {
            updateDraft({ bankInfo })
            if (isLastStep) {
              // agency: 바로 제출
              updateDraft({ bankInfo, step: 99 })
              // handleFinalSubmit 호출을 위해 step 99 → 실제 submit
            } else {
              updateDraft({ bankInfo, step: 5 })
            }
          }}
          onBack={() => updateDraft({ step: 3 })}
        />
      </div>
    )
  }

  if (step === 5 && role === 'landco') {
    return (
      <div>
        <ProgressBar step={5} role={role} />
        <Step5Countries
          initial={draft.countries}
          onNext={countries => {
            updateDraft({ countries })
            handleFinalSubmit(countries)
          }}
          onBack={() => updateDraft({ step: 4 })}
        />
        {submitError && <p className="mt-3 text-sm text-red-500">{submitError}</p>}
        {submitting && <p className="mt-3 text-sm text-gray-400 text-center">가입 처리 중...</p>}
      </div>
    )
  }

  // step 99: agency 최종 제출 (Step4BankInfo에서 agency onNext 시 진입)
  if (step === 99) {
    // agency는 countries 없이 제출
    if (!submitting && !submitError) {
      handleFinalSubmit([])
    }
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm text-gray-500">가입 처리 중...</p>
        {submitError && <p className="text-sm text-red-500">{submitError}</p>}
      </div>
    )
  }

  return null
}
```

> 주의: step 99 처리에서 `handleFinalSubmit`이 리렌더링마다 반복 호출되는 것을 방지하기 위해 `submitting` flag로 guard한다.

- [ ] **Step 2: signup page.tsx 교체**

`src/app/(auth)/signup/page.tsx` 전체를 아래로 교체:

```tsx
// src/app/(auth)/signup/page.tsx
import { Logo } from '@/components/Logo'
import { SignupWizard } from './SignupWizard'
import Link from 'next/link'

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <Logo />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <SignupWizard />
        <p className="mt-6 text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/(auth)/signup/SignupWizard.tsx src/app/(auth)/signup/page.tsx
git commit -m "feat: add SignupWizard and replace signup page"
```

---

### Task 12: Pending 페이지 개선

**Files:**
- Modify: `src/app/pending/page.tsx`

회사명과 역할을 profiles에서 읽어서 표시한다. 3단계 진행 상태를 시각화한다.

- [ ] **Step 1: pending page 전체 교체**

```tsx
// src/app/pending/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function PendingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('company_name, role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCompanyName(data.company_name)
            setRole(data.role)
          }
        })
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel = role === 'agency' ? '여행사' : role === 'landco' ? '랜드사' : ''

  const steps = [
    { label: '신청 완료', done: true, current: false },
    { label: '서류 검토 중', done: false, current: true },
    { label: '승인 완료', done: false, current: false },
  ]

  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@myrealtrip.com'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-gray-900 font-bold text-lg">마이랜드견적</span>
          <span className="text-gray-400 text-xs">by</span>
          <Image src="/myrealtrip-logo.png" alt="Myrealtrip" width={80} height={20} style={{ objectFit: 'contain' }} />
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          로그아웃
        </button>
      </div>

      {/* 본문 */}
      <div className="flex flex-1 items-center justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-md p-8 text-center">
          {/* 타이틀 */}
          <div className="mb-6">
            <div className="text-4xl mb-3">📋</div>
            <h1 className="text-xl font-bold text-gray-900">
              {companyName ? (
                <>{companyName}<span className="text-gray-400 font-normal">({roleLabel})</span>님의<br />가입 신청이 접수되었어요</>
              ) : (
                '가입 신청이 접수되었어요'
              )}
            </h1>
          </div>

          {/* 진행 단계 */}
          <div className="flex items-center justify-center gap-0 mb-8">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      s.done
                        ? 'bg-blue-600 text-white'
                        : s.current
                        ? 'bg-blue-100 text-blue-600 border-2 border-blue-400'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {s.done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs whitespace-nowrap ${s.current ? 'text-blue-600 font-medium' : s.done ? 'text-gray-500' : 'text-gray-300'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-1 mb-5 ${s.done ? 'bg-blue-600' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

          {/* 안내 */}
          <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-blue-800 font-medium mb-1">검토 예상 기간</p>
            <p className="text-sm text-blue-700">영업일 기준 1–2일 내에 검토 후<br />가입 승인 이메일을 보내드려요.</p>
          </div>

          <p className="text-xs text-gray-400">
            승인 관련 문의:{' '}
            <a href={`mailto:${supportEmail}`} className="text-blue-500 hover:underline">
              {supportEmail}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/pending/page.tsx
git commit -m "feat: redesign pending page with company name and step indicator"
```

---

### Task 13: Admin 페이지 — 서류 다운로드 버튼 추가

**Files:**
- Modify: `src/app/(dashboard)/admin/agencies/page.tsx`
- Modify: `src/app/(dashboard)/admin/landcos/page.tsx`

상세 팝업 모달에 서류 다운로드 버튼 2개를 추가한다.
서명된 URL(1시간 유효)을 생성해서 새 탭으로 열어준다.

- [ ] **Step 1: agencies/page.tsx 모달에 서류 다운로드 섹션 추가**

`AgenciesPage` 함수 안에서 `Profile` 타입을 쓰고 있는 상세 팝업 부분을 찾는다.
`selected.document_biz_url` 또는 `selected.document_bank_url`이 있을 때만 버튼을 노출한다.

`/* 액션 로그 */` 섹션 위에 아래 코드를 삽입:

```tsx
{/* 서류 다운로드 */}
{(selected.document_biz_url || selected.document_bank_url) && (
  <div className="mb-5">
    <p className="text-sm font-medium text-gray-700 mb-2">서류 다운로드</p>
    <div className="flex gap-2">
      {selected.document_biz_url && (
        <button
          onClick={async () => {
            const supabase = createClient()
            const { data } = await supabase.storage
              .from('signup-documents')
              .createSignedUrl(selected.document_biz_url!, 3600)
            if (data?.signedUrl) window.open(data.signedUrl, '_blank')
          }}
          className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          📄 사업자등록증
        </button>
      )}
      {selected.document_bank_url && (
        <button
          onClick={async () => {
            const supabase = createClient()
            const { data } = await supabase.storage
              .from('signup-documents')
              .createSignedUrl(selected.document_bank_url!, 3600)
            if (data?.signedUrl) window.open(data.signedUrl, '_blank')
          }}
          className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          🏦 통장사본
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 2: landcos/page.tsx도 동일하게 적용**

agencies/page.tsx와 동일한 위치(`/* 액션 로그 */` 위)에 동일한 코드 삽입.

- [ ] **Step 3: 커밋**

```bash
git add src/app/(dashboard)/admin/agencies/page.tsx src/app/(dashboard)/admin/landcos/page.tsx
git commit -m "feat: add document download buttons in admin partner detail modal"
```

---

## 자가 검토 (Self-Review)

**스펙 커버리지 체크:**
- ✅ 5단계 wizard (역할→서류→기본정보→계좌→국가)
- ✅ sessionStorage 백업
- ✅ Claude Vision OCR (사업자등록증 → biz 필드, 통장사본 → bank 필드)
- ✅ 국세청 API 검증 (NTS_SERVICE_KEY 없으면 mock)
- ✅ 파일은 최종 제출 시 Storage 업로드 (userId 획득 후)
- ✅ AI 채움 섹션 / 수동 입력 섹션 시각적 분리 (Step3)
- ✅ 계좌정보 OCR 자동 채움 (Step4)
- ✅ 담당 국가 자동완성 + row 추가/제거 (Step5, 랜드사만)
- ✅ 총 단계 수 미노출 진행 바
- ✅ Pending 페이지 — 회사명, 3단계 스텝퍼, 예상 기간, 문의 이메일, 로그아웃 버튼
- ✅ Admin 서류 다운로드 버튼

**타입 일관성:**
- `SignupOcrResult` (biz OCR 결과) — Step2 → SignupWizard → Step3BasicInfo
- `BankOcrResult` (bank OCR 결과) — Step2 → SignupWizard → Step4BankInfo
- `SignupDraft.basicInfo.password` — SignupWizard에서 signUp 호출 시 사용
- `draft.basicInfo.company_name` — trigger에서 `raw_user_meta_data->>'company_name'`으로 profiles 생성됨 → update 불필요 (이미 생성됨)

**엣지 케이스:**
- agency는 step 4 완료 후 step 99로 이동해 자동 제출됨
- landco는 step 5 완료 후 제출됨
- OCR 실패 시 사용자에게 에러 메시지 표시, 재시도 가능
- NTS API 키 없으면 10자리 숫자이면 유효로 처리 (개발 환경 fallback)
