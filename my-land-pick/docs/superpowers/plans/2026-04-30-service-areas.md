# 랜드사 담당 지역 세분화 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜드사 담당 지역을 국가+도시 단위로 관리하고, 견적 요청 시 도시를 DB 기반 드롭다운에서 선택하게 한다.

**Architecture:** cities 마스터 테이블 + profiles.service_areas jsonb 컬럼. 여행사 견적 요청과 랜드사 가입 양쪽에서 cities 테이블 기반 검색 드롭다운 사용. 랜드사 대시보드는 service_areas 기반으로 필터링.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL), TypeScript, Tailwind CSS

---

### Task 1: DB 스키마 + 초기 데이터 + 타입

**Files:**
- Create: `supabase/migrations/20260430000001_cities_and_service_areas.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: 마이그레이션 SQL 작성 + Supabase에서 실행**

```sql
-- cities 마스터 테이블
CREATE TABLE cities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code text NOT NULL,
  city_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(country_code, city_name)
);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
GRANT ALL ON cities TO service_role;
GRANT ALL ON cities TO authenticated;

-- profiles에 service_areas 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS service_areas jsonb DEFAULT '[]';

-- 초기 도시 데이터
INSERT INTO cities (country_code, city_name, sort_order) VALUES
  ('JP', '도쿄', 1), ('JP', '오사카', 2), ('JP', '교토', 3), ('JP', '후쿠오카', 4),
  ('JP', '삿포로', 5), ('JP', '나고야', 6), ('JP', '오키나와', 7), ('JP', '나라', 8),
  ('JP', '고베', 9), ('JP', '히로시마', 10),
  ('VN', '하노이', 1), ('VN', '호치민', 2), ('VN', '다낭', 3), ('VN', '나트랑', 4),
  ('VN', '푸꾸옥', 5), ('VN', '하롱베이', 6), ('VN', '달랏', 7), ('VN', '사파', 8),
  ('CN', '베이징', 1), ('CN', '상하이', 2), ('CN', '광저우', 3), ('CN', '선전', 4),
  ('CN', '청두', 5), ('CN', '시안', 6), ('CN', '항저우', 7), ('CN', '칭다오', 8),
  ('FR', '파리', 1), ('FR', '니스', 2), ('FR', '리옹', 3), ('FR', '마르세유', 4),
  ('FR', '보르도', 5), ('FR', '스트라스부르', 6)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: 타입 정의**

`src/lib/supabase/types.ts`에 추가:

```typescript
export interface City {
  id: string
  country_code: string
  city_name: string
  sort_order: number
}

export interface ServiceArea {
  country: string
  city: string
}
```

---

### Task 2: Cities API (조회 + admin CRUD)

**Files:**
- Create: `src/app/api/cities/route.ts`
- Create: `src/app/api/admin/cities/route.ts`
- Create: `src/app/api/admin/cities/[id]/route.ts`

- [ ] **Step 1: 공용 조회 API**

`src/app/api/cities/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const country = request.nextUrl.searchParams.get('country')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let query = admin.from('cities').select('*').order('sort_order', { ascending: true })
  if (country) query = query.eq('country_code', country)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ cities: data ?? [] })
}
```

- [ ] **Step 2: Admin CRUD API**

`src/app/api/admin/cities/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST — 도시 추가
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { countryCode, cityName } = await request.json()
  if (!countryCode || !cityName) return NextResponse.json({ error: 'countryCode, cityName 필요' }, { status: 400 })

  const admin = getAdmin()
  const { data: maxOrder } = await admin.from('cities').select('sort_order').eq('country_code', countryCode).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = (maxOrder?.[0]?.sort_order ?? 0) + 1

  const { data, error } = await admin.from('cities').insert({ country_code: countryCode, city_name: cityName, sort_order: nextOrder }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ city: data }, { status: 201 })
}

// PATCH — 순서 변경
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { updates } = await request.json() as { updates: { id: string; sort_order: number }[] }
  const admin = getAdmin()
  for (const u of updates) {
    await admin.from('cities').update({ sort_order: u.sort_order }).eq('id', u.id)
  }
  return NextResponse.json({ success: true })
}
```

`src/app/api/admin/cities/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  await admin.from('cities').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
```

---

### Task 3: 검색 드롭다운 공통 컴포넌트

**Files:**
- Create: `src/components/CitySearchSelect.tsx`

- [ ] **Step 1: 컴포넌트 생성**

국가 선택 후 도시를 검색 드롭다운으로 선택하는 공통 컴포넌트. 단일 선택과 복수 선택 모두 지원.

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { City } from '@/lib/supabase/types'

interface Props {
  countryCode: string
  selected: string | string[]  // 단일: string, 복수: string[]
  onChange: (value: string | string[]) => void
  multiple?: boolean
  placeholder?: string
}

export default function CitySearchSelect({ countryCode, selected, onChange, multiple = false, placeholder = '도시 검색' }: Props) {
  const [cities, setCities] = useState<City[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!countryCode) { setCities([]); return }
    fetch(`/api/cities?country=${countryCode}`)
      .then(r => r.json())
      .then(d => setCities(d.cities ?? []))
  }, [countryCode])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = cities.filter(c => c.city_name.includes(query))
  const selectedArray = Array.isArray(selected) ? selected : (selected ? [selected] : [])

  function handleSelect(cityName: string) {
    if (multiple) {
      const arr = selectedArray.includes(cityName)
        ? selectedArray.filter(c => c !== cityName)
        : [...selectedArray, cityName]
      onChange(arr)
    } else {
      onChange(cityName)
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* 선택된 도시 태그 (복수 선택 시) */}
      {multiple && selectedArray.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selectedArray.map(city => (
            <span key={city} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {city}
              <button onClick={() => handleSelect(city)} className="text-blue-400 hover:text-blue-600">&times;</button>
            </span>
          ))}
        </div>
      )}

      <input
        value={multiple ? query : (open ? query : (selected as string) || '')}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {open && countryCode && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">검색 결과가 없습니다</p>
          ) : (
            filtered.map(city => (
              <button
                key={city.id}
                onClick={() => handleSelect(city.city_name)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                  selectedArray.includes(city.city_name) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                {city.city_name}
                {selectedArray.includes(city.city_name) && <span className="float-right text-blue-500">✓</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

---

### Task 4: 여행사 견적 요청 — 도시 검색 드롭다운

**Files:**
- Modify: `src/app/(dashboard)/agency/requests/new/page.tsx`

- [ ] **Step 1: 도시 자유입력을 CitySearchSelect로 교체**

import 추가:
```typescript
import CitySearchSelect from '@/components/CitySearchSelect'
```

기존 도시 input (약 301-311번 줄)을 교체:
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700">목적지 도시 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
  <div className="mt-1">
    <CitySearchSelect
      countryCode={form.destination_country}
      selected={form.destination_city}
      onChange={v => handleChange('destination_city', v as string)}
      placeholder="도시를 검색하세요"
    />
  </div>
  <FieldError msg={fieldErrors.destination_city} />
</div>
```

---

### Task 5: 랜드사 가입 Step5 — 국가+도시 선택

**Files:**
- Modify: `src/app/(auth)/signup/steps/Step5Countries.tsx`
- Modify: `src/app/(auth)/signup/SignupWizard.tsx`

- [ ] **Step 1: Step5를 국가+도시 복수 선택으로 변경**

Step5Countries를 전체 재작성. 국가 선택 → 해당 국가 도시 검색 드롭다운 (복수 선택) → 선택된 지역 태그 표시.

`onNext` callback이 `ServiceArea[]` (= `{ country: string; city: string }[]`)를 반환하도록 변경.

- [ ] **Step 2: SignupWizard 수정**

`handleFinalSubmit`에서 `country_codes` 대신 `service_areas`를 저장:
```typescript
...(draft.role === 'landco' ? { service_areas: countries } : {}),
```

(기존 country_codes도 호환을 위해 함께 저장하거나, service_areas에서 unique country만 추출하여 저장)

---

### Task 6: Admin — 도시 관리 페이지

**Files:**
- Create: `src/app/(dashboard)/admin/cities/page.tsx`
- Modify: `src/components/layout/AgencySidebar.tsx`

- [ ] **Step 1: 사이드바에 메뉴 추가**

```typescript
{ label: '도시 관리', href: '/admin/cities', icon: '🏙️' },
```

- [ ] **Step 2: 도시 관리 페이지 생성**

국가별 탭 → 해당 국가 도시 목록 → 추가/삭제/순서변경

---

### Task 7: Admin — 랜드사 담당 지역 (국가+도시)

**Files:**
- Modify: `src/app/(dashboard)/admin/landcos/page.tsx`
- Create: `src/app/api/admin/assign-service-areas/route.ts`

- [ ] **Step 1: assign-service-areas API 생성**

```typescript
// POST body: { landcoId, serviceAreas: [{ country, city }] }
// profiles.service_areas 업데이트 + country_codes도 동기화 + 로그
```

- [ ] **Step 2: 랜드사 모달의 "담당 국가" → "담당 지역"으로 변경**

기존 국가 토글 버튼 → 국가 선택 + CitySearchSelect (복수) 조합으로 교체.

---

### Task 8: 랜드사 대시보드 필터링 변경

**Files:**
- Modify: `src/app/(dashboard)/landco/page.tsx`

- [ ] **Step 1: country_codes → service_areas 기반 필터링**

기존:
```typescript
.in('destination_country', countryCodes)
```

변경: service_areas가 있으면 (country, city) 쌍으로 필터링.

```typescript
const serviceAreas = (profile?.service_areas ?? []) as { country: string; city: string }[]
const countryCodes = (profile?.country_codes ?? []) as string[]

// service_areas가 있으면 도시 단위 필터, 없으면 기존 국가 단위 호환
let openQuery = supabase.from('quote_requests').select('*').in('status', ['open', 'in_progress']).order('deadline', { ascending: true })

if (serviceAreas.length > 0) {
  // Supabase에서 복합 조건 OR 필터
  const conditions = serviceAreas.map(a => `and(destination_country.eq.${a.country},destination_city.eq.${a.city})`).join(',')
  openQuery = openQuery.or(conditions)
} else if (countryCodes.length > 0) {
  openQuery = openQuery.in('destination_country', countryCodes)
} else {
  openQuery = openQuery.in('destination_country', ['__none__'])
}
```

---

### Task 9: 기존 데이터 마이그레이션

- [ ] **Step 1: 기존 랜드사의 country_codes → service_areas 변환**

Supabase SQL Editor에서 실행. 기존 country_codes의 각 국가에 대해 cities 테이블의 모든 도시를 service_areas에 추가:

```sql
-- 기존 랜드사들의 country_codes를 service_areas로 변환
-- (수동 실행, 한 번만)
```

Node 스크립트로 처리:
```javascript
// 각 랜드사의 country_codes를 순회
// 각 country_code에 대해 cities 테이블에서 해당 국가 도시 조회
// service_areas에 [{ country, city }] 배열로 저장
```
