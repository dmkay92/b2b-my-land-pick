# Signup Phone UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Step3BasicInfo에서 사업자 검증 버튼 UX 개선, 국가 코드 검색 드롭다운, 국가별 전화번호 자동 포맷 기능을 구현한다.

**Architecture:** `PhoneCountrySelect` 컴포넌트를 분리하고, 전화번호 포맷 로직을 국가별로 처리하는 `formatPhoneByCountry` 함수를 추가한다. `Step3BasicInfo`는 두 컴포넌트를 사용하도록 수정한다.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

### Task 1: formatPhoneByCountry 유틸 함수 작성 및 테스트

**Files:**
- Create: `src/lib/phoneFormat.ts`
- Modify: `src/__tests__/utils.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/__tests__/utils.test.ts` 하단에 추가:

```typescript
import { formatPhoneByCountry } from '@/lib/phoneFormat'

describe('formatPhoneByCountry', () => {
  it('한국 +82 모바일 포맷', () => {
    expect(formatPhoneByCountry('+82', '01012345678')).toBe('010-1234-5678')
  })
  it('한국 +82 앞자리만 있을 때', () => {
    expect(formatPhoneByCountry('+82', '010123')).toBe('010-123')
  })
  it('미국 +1 포맷', () => {
    expect(formatPhoneByCountry('+1', '2125551234')).toBe('(212) 555-1234')
  })
  it('미국 +1 입력 중간', () => {
    expect(formatPhoneByCountry('+1', '21255')).toBe('(212) 55')
  })
  it('싱가포르 +65 포맷', () => {
    expect(formatPhoneByCountry('+65', '91234567')).toBe('9123-4567')
  })
  it('홍콩 +852 포맷', () => {
    expect(formatPhoneByCountry('+852', '91234567')).toBe('9123-4567')
  })
  it('일본 +81 포맷', () => {
    expect(formatPhoneByCountry('+81', '09012345678')).toBe('090-1234-5678')
  })
  it('중국 +86 포맷', () => {
    expect(formatPhoneByCountry('+86', '13812345678')).toBe('138-1234-5678')
  })
  it('태국 +66 포맷', () => {
    expect(formatPhoneByCountry('+66', '0812345678')).toBe('081-234-5678')
  })
  it('베트남 +84 포맷', () => {
    expect(formatPhoneByCountry('+84', '0912345678')).toBe('091-234-5678')
  })
  it('인도네시아 +62 포맷', () => {
    expect(formatPhoneByCountry('+62', '08123456789')).toBe('0812-3456-789')
  })
  it('말레이시아 +60 포맷', () => {
    expect(formatPhoneByCountry('+60', '0123456789')).toBe('012-345-6789')
  })
  it('필리핀 +63 포맷', () => {
    expect(formatPhoneByCountry('+63', '09171234567')).toBe('0917-123-4567')
  })
  it('대만 +886 포맷', () => {
    expect(formatPhoneByCountry('+886', '0912345678')).toBe('091-234-5678')
  })
  it('지원하지 않는 국가는 숫자만', () => {
    expect(formatPhoneByCountry('+49', '01701234567')).toBe('01701234567')
  })
  it('빈 문자열 반환', () => {
    expect(formatPhoneByCountry('+82', '')).toBe('')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/youngjun-hwang/Desktop/Claude/incentive-quote/.worktrees/feature/incentive-quote-mvp
npx jest phoneFormat --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module '@/lib/phoneFormat'`

- [ ] **Step 3: phoneFormat.ts 구현**

`src/lib/phoneFormat.ts` 생성:

```typescript
function digits(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

function fmt(d: string, groups: number[]): string {
  let result = ''
  let pos = 0
  for (let i = 0; i < groups.length; i++) {
    const chunk = d.slice(pos, pos + groups[i])
    if (!chunk) break
    result += (i > 0 ? '-' : '') + chunk
    pos += groups[i]
  }
  return result
}

export function formatPhoneByCountry(countryCode: string, raw: string): string {
  const d = digits(raw)
  if (!d) return ''

  switch (countryCode) {
    case '+82': {
      // 한국: 010-XXXX-XXXX (11자리) 또는 02-XXXX-XXXX
      const max = d.slice(0, 11)
      if (max.startsWith('02')) {
        const local = max.slice(2)
        if (local.length <= 3) return `02-${local}`
        if (local.length <= 6) return `02-${local.slice(0, 3)}-${local.slice(3)}`
        const mid = local.length === 7 ? 3 : 4
        return `02-${local.slice(0, mid)}-${local.slice(mid)}`
      }
      const s = max
      if (s.length <= 3) return s
      if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+81': {
      // 일본: 090-XXXX-XXXX (11자리)
      const s = d.slice(0, 11)
      if (s.length <= 3) return s
      if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+86': {
      // 중국: XXX-XXXX-XXXX (11자리)
      const s = d.slice(0, 11)
      if (s.length <= 3) return s
      if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+1': {
      // 미국·캐나다: (XXX) XXX-XXXX (10자리)
      const s = d.slice(0, 10)
      if (s.length <= 3) return s.length === 0 ? '' : `(${s}`
      if (s.length <= 6) return `(${s.slice(0, 3)}) ${s.slice(3)}`
      return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+66': {
      // 태국: XXX-XXX-XXXX (10자리)
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+84': {
      // 베트남: XXX-XXXX-XXXX (10자리)
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+65':
    case '+852': {
      // 싱가포르·홍콩: XXXX-XXXX (8자리)
      const s = d.slice(0, 8)
      if (s.length <= 4) return s
      return `${s.slice(0, 4)}-${s.slice(4)}`
    }
    case '+886': {
      // 대만: XXX-XXX-XXXX (10자리)
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+62': {
      // 인도네시아: XXXX-XXXX-XXX (11자리)
      const s = d.slice(0, 11)
      if (s.length <= 4) return s
      if (s.length <= 8) return `${s.slice(0, 4)}-${s.slice(4)}`
      return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
    }
    case '+60': {
      // 말레이시아: XXX-XXX-XXXX (10자리)
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+63': {
      // 필리핀: XXXX-XXX-XXXX (11자리)
      const s = d.slice(0, 11)
      if (s.length <= 4) return s
      if (s.length <= 7) return `${s.slice(0, 4)}-${s.slice(4)}`
      return `${s.slice(0, 4)}-${s.slice(4, 7)}-${s.slice(7)}`
    }
    default:
      // 지원하지 않는 국가: 숫자만, 최대 15자리
      return d.slice(0, 15)
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest phoneFormat --no-coverage 2>&1 | tail -20
```

Expected: `Tests: 16 passed`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/phoneFormat.ts src/__tests__/utils.test.ts
git commit -m "feat: add formatPhoneByCountry util with per-country formatting"
```

---

### Task 2: PhoneCountrySelect 컴포넌트 작성

**Files:**
- Create: `src/app/(auth)/signup/steps/PhoneCountrySelect.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/app/(auth)/signup/steps/PhoneCountrySelect.tsx` 생성:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'

interface CountryCode {
  code: string
  label: string
}

interface Props {
  codes: CountryCode[]
  value: string
  onChange: (code: string) => void
}

export function PhoneCountrySelect({ codes, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? codes.filter(c =>
        c.label.includes(query) || c.code.includes(query)
      )
    : codes

  const selected = codes.find(c => c.code === value)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 whitespace-nowrap"
      >
        <span>{selected?.code ?? value}</span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="국가명 또는 코드"
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400">검색 결과 없음</li>
            ) : (
              filtered.map(c => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false) }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      c.code === value ? 'font-medium text-blue-600' : 'text-gray-700'
                    }`}
                  >
                    {c.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/(auth)/signup/steps/PhoneCountrySelect.tsx
git commit -m "feat: add PhoneCountrySelect searchable dropdown component"
```

---

### Task 3: Step3BasicInfo에 변경사항 적용

**Files:**
- Modify: `src/app/(auth)/signup/steps/Step3BasicInfo.tsx`

- [ ] **Step 1: import 추가 및 formatMobile/formatLandline 제거 후 새 함수 import**

파일 상단을 아래와 같이 수정 (기존 `formatMobile`, `formatLandline` 함수 삭제):

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { SignupOcrResult } from '@/lib/supabase/types'
import { formatPhoneByCountry } from '@/lib/phoneFormat'
import { PhoneCountrySelect } from './PhoneCountrySelect'
```

- [ ] **Step 2: 사업자 검증 버튼 → 검증됨 배지로 교체**

`Step3BasicInfo.tsx`에서 검증 버튼 부분을 찾아 교체:

```tsx
{key === 'business_registration_number' && (
  brnStatus === 'valid' ? (
    <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 text-xs font-medium text-green-600 border border-green-200 whitespace-nowrap">
      ✓ 검증됨
    </span>
  ) : (
    <button
      type="button"
      onClick={validateBrn}
      disabled={brnStatus === 'loading'}
      className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
    >
      {brnStatus === 'loading' ? '확인 중' : '검증'}
    </button>
  )
)}
```

- [ ] **Step 3: 국가 코드 변경 시 전화번호 초기화 핸들러 추가**

`mobileCc`, `landlineCc` state 선언 아래에 추가:

```tsx
function handleMobileCcChange(code: string) {
  setMobileCc(code)
  setValues(prev => ({ ...prev, phone_mobile: '' }))
}

function handleLandlineCcChange(code: string) {
  setLandlineCc(code)
  setValues(prev => ({ ...prev, phone_landline: '' }))
}
```

- [ ] **Step 4: 무선 연락처 입력 영역 교체**

기존 무선 연락처 `<div>` 전체를 아래로 교체:

```tsx
<div>
  <label className="block text-xs font-medium text-gray-600 mb-1">대표 무선 연락처 <span className="text-red-400">*</span></label>
  <div className="flex gap-2">
    <PhoneCountrySelect
      codes={COUNTRY_CODES}
      value={mobileCc}
      onChange={handleMobileCcChange}
    />
    <input
      type="tel"
      required
      value={values.phone_mobile}
      onChange={e => set('phone_mobile', formatPhoneByCountry(mobileCc, e.target.value))}
      placeholder={mobileCc === '+82' ? '010-0000-0000' : '번호 입력'}
      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  </div>
</div>
```

- [ ] **Step 5: 유선 연락처 입력 영역 교체**

기존 유선 연락처 `<div>` 전체를 아래로 교체:

```tsx
<div>
  <label className="block text-xs font-medium text-gray-600 mb-1">
    대표 유선 연락처 <span className="text-gray-400 font-normal">(선택)</span>
  </label>
  <div className="flex gap-2">
    <PhoneCountrySelect
      codes={COUNTRY_CODES}
      value={landlineCc}
      onChange={handleLandlineCcChange}
    />
    <input
      type="tel"
      value={values.phone_landline}
      onChange={e => set('phone_landline', formatPhoneByCountry(landlineCc, e.target.value))}
      placeholder={landlineCc === '+82' ? '02-0000-0000' : '번호 입력'}
      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  </div>
</div>
```

- [ ] **Step 6: 브라우저에서 동작 확인**

`http://localhost:3000/signup` 접속 후:
1. 사업자등록번호 OCR 자동 검증 시 버튼 대신 `✓ 검증됨` 배지 확인
2. 국가 코드 드롭다운 클릭 → 검색창 확인 ("한국", "+82" 검색 테스트)
3. 국가 변경 시 번호 입력창 초기화 확인
4. 한국 선택 후 번호 입력 시 010-XXXX-XXXX 포맷 확인
5. 미국 선택 후 번호 입력 시 (XXX) XXX-XXXX 포맷 확인

- [ ] **Step 7: 커밋**

```bash
git add src/app/(auth)/signup/steps/Step3BasicInfo.tsx
git commit -m "feat: improve BRN validation UX, searchable country select, country-aware phone formatting"
```
