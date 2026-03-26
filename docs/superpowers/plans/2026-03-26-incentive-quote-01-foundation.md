# 인센티브투어 견적 플랫폼 — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js + Supabase 기반 프로젝트를 초기화하고, 인증·회원가입·관리자 승인·랜드사 국가 지정까지 동작하는 기반을 만든다.

**Architecture:** Next.js 14 App Router (TypeScript) + Supabase Auth/DB. Route group `(auth)`는 로그인/회원가입, `(dashboard)`는 역할별 대시보드. Supabase RLS로 데이터 접근 제어. Middleware로 미인증 요청 차단.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, @supabase/supabase-js v2, @supabase/ssr, Jest + @testing-library/react

---

## File Map

```
incentive-quote/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (dashboard)/
│   │   │   └── admin/
│   │   │       ├── layout.tsx
│   │   │       └── page.tsx
│   │   ├── pending/page.tsx
│   │   ├── api/admin/
│   │   │   ├── approve/route.ts
│   │   │   └── assign-countries/route.ts
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── types.ts       — DB 타입 정의
│   │   │   ├── client.ts      — 브라우저 클라이언트
│   │   │   ├── server.ts      — 서버 클라이언트 (일반 + service role)
│   │   │   └── middleware.ts  — 세션 갱신 + 라우트 보호 로직
│   │   └── utils.ts           — calculateTotalPeople, formatDate 등
│   └── middleware.ts           — Next.js 미들웨어 엔트리
├── supabase/migrations/
│   └── 20260326000000_initial.sql
├── jest.config.ts
├── jest.setup.ts
└── .env.local
```

---

### Task 1: 프로젝트 초기화

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`
- Create: `jest.config.ts`, `jest.setup.ts`
- Create: `.env.local`

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
cd /Users/youngjun-hwang/Desktop/Claude/incentive-quote
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
```

프롬프트 응답:
- Would you like to use Turbopack? → **No**

- [ ] **Step 2: 의존성 설치**

```bash
npm install @supabase/supabase-js @supabase/ssr exceljs resend
npm install -D jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom @types/jest ts-jest
```

- [ ] **Step 3: Jest 설정 파일 생성**

`jest.config.ts`:
```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
}

export default createJestConfig(config)
```

`jest.setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: 환경 변수 파일 생성**

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_api_key
```

> Supabase 대시보드 → Settings → API 에서 URL과 키 복사

- [ ] **Step 5: 개발 서버 실행 확인**

```bash
npm run dev
```

Expected: `http://localhost:3000` 에서 Next.js 기본 페이지 확인

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: initialize Next.js project with Supabase and testing setup"
```

---

### Task 2: Supabase 타입 & 클라이언트 설정

**Files:**
- Create: `src/lib/supabase/types.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: 타입 정의 작성**

`src/lib/supabase/types.ts`:
```typescript
export type UserRole = 'agency' | 'landco' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'rejected'
export type HotelGrade = 3 | 4 | 5
export type QuoteRequestStatus = 'open' | 'in_progress' | 'closed' | 'finalized'
export type QuoteStatus = 'submitted' | 'selected' | 'finalized' | 'rejected'

export interface Profile {
  id: string
  email: string
  role: UserRole
  company_name: string
  status: UserStatus
  country_codes: string[]
  created_at: string
}

export interface QuoteRequest {
  id: string
  agency_id: string
  event_name: string
  destination_country: string
  destination_city: string
  depart_date: string
  return_date: string
  adults: number
  children: number
  infants: number
  leaders: number
  hotel_grade: HotelGrade
  deadline: string
  notes: string | null
  status: QuoteRequestStatus
  created_at: string
}

export interface Quote {
  id: string
  request_id: string
  landco_id: string
  version: number
  file_url: string
  file_name: string
  status: QuoteStatus
  submitted_at: string
}

export interface QuoteSelection {
  request_id: string
  selected_quote_id: string
  landco_id: string
  selected_at: string
  finalized_at: string | null
}

export interface ChatRoom {
  id: string
  request_id: string
  agency_id: string
  landco_id: string
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  sender_id: string
  content: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}
```

- [ ] **Step 2: 브라우저 클라이언트 생성**

`src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: 서버 클라이언트 생성**

`src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 4: Middleware 유틸 생성**

`src/lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()
  const isAuthPage = url.pathname === '/login' || url.pathname === '/signup'
  const isProtected = url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/agency') ||
    url.pathname.startsWith('/landco')

  if (!user && isProtected) {
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    if (profile?.status === 'pending') {
      url.pathname = '/pending'
      return NextResponse.redirect(url)
    }
    const dest = profile?.role === 'admin' ? '/admin'
      : profile?.role === 'agency' ? '/agency' : '/landco'
    url.pathname = dest
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 5: Root Middleware 생성**

`src/middleware.ts`:
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ src/middleware.ts
git commit -m "feat: add Supabase client utilities and auth middleware"
```

---

### Task 3: 데이터베이스 스키마 생성

**Files:**
- Create: `supabase/migrations/20260326000000_initial.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260326000000_initial.sql`:
```sql
-- Extensions
create extension if not exists "uuid-ossp";

-- Profiles (여행사, 랜드사, 관리자)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text not null check (role in ('agency', 'landco', 'admin')),
  company_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  country_codes text[] default '{}',
  created_at timestamptz default now()
);

-- Quote requests (여행사 견적 요청)
create table public.quote_requests (
  id uuid default uuid_generate_v4() primary key,
  agency_id uuid references public.profiles not null,
  event_name text not null,
  destination_country text not null,
  destination_city text not null,
  depart_date date not null,
  return_date date not null,
  adults int not null default 0,
  children int not null default 0,
  infants int not null default 0,
  leaders int not null default 0,
  hotel_grade int not null check (hotel_grade in (3, 4, 5)),
  deadline date not null,
  notes text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed', 'finalized')),
  created_at timestamptz default now()
);

-- Quotes (랜드사 제출 견적서, 버전 관리)
create table public.quotes (
  id uuid default uuid_generate_v4() primary key,
  request_id uuid references public.quote_requests on delete cascade not null,
  landco_id uuid references public.profiles not null,
  version int not null default 1,
  file_url text not null,
  file_name text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'selected', 'finalized', 'rejected')),
  submitted_at timestamptz default now()
);

-- Quote selections
create table public.quote_selections (
  request_id uuid references public.quote_requests primary key,
  selected_quote_id uuid references public.quotes not null,
  landco_id uuid references public.profiles not null,
  selected_at timestamptz default now(),
  finalized_at timestamptz
);

-- Chat rooms (견적 × 랜드사별 1:1)
create table public.chat_rooms (
  id uuid default uuid_generate_v4() primary key,
  request_id uuid references public.quote_requests on delete cascade not null,
  agency_id uuid references public.profiles not null,
  landco_id uuid references public.profiles not null,
  created_at timestamptz default now(),
  unique(request_id, landco_id)
);

-- Messages
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms on delete cascade not null,
  sender_id uuid references public.profiles not null,
  content text not null,
  created_at timestamptz default now()
);

-- Notifications
create table public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles not null,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_selections enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Storage bucket
insert into storage.buckets (id, name, public) values ('quotes', 'quotes', false);

-- RLS: profiles
create policy "Own profile readable"
  on public.profiles for select using (auth.uid() = id);

create policy "Admin can read all profiles"
  on public.profiles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Admin can update profiles"
  on public.profiles for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Own profile updatable"
  on public.profiles for update using (auth.uid() = id);

-- RLS: quote_requests
create policy "Agency CRUD own requests"
  on public.quote_requests for all using (agency_id = auth.uid());

create policy "Landco reads requests for their countries"
  on public.quote_requests for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'landco'
      and p.status = 'approved'
      and quote_requests.destination_country = any(p.country_codes)
  ));

create policy "Admin reads all requests"
  on public.quote_requests for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- RLS: quotes
create policy "Landco manages own quotes"
  on public.quotes for all using (landco_id = auth.uid());

create policy "Agency reads quotes for own requests"
  on public.quotes for select
  using (exists (
    select 1 from public.quote_requests qr
    where qr.id = request_id and qr.agency_id = auth.uid()
  ));

-- RLS: quote_selections
create policy "Agency manages selections"
  on public.quote_selections for all
  using (exists (
    select 1 from public.quote_requests qr
    where qr.id = request_id and qr.agency_id = auth.uid()
  ));

create policy "Landco reads own selections"
  on public.quote_selections for select
  using (landco_id = auth.uid());

-- RLS: chat_rooms & messages
create policy "Participants access chat rooms"
  on public.chat_rooms for all
  using (agency_id = auth.uid() or landco_id = auth.uid());

create policy "Participants access messages"
  on public.messages for all
  using (exists (
    select 1 from public.chat_rooms cr
    where cr.id = room_id
      and (cr.agency_id = auth.uid() or cr.landco_id = auth.uid())
  ));

-- RLS: notifications
create policy "Own notifications"
  on public.notifications for all using (user_id = auth.uid());

-- Storage RLS
create policy "Auth users can upload"
  on storage.objects for insert
  with check (bucket_id = 'quotes' and auth.role() = 'authenticated');

create policy "Auth users can download"
  on storage.objects for select
  using (bucket_id = 'quotes' and auth.role() = 'authenticated');

-- Trigger: 회원가입 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, company_name, status)
  values (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'role')::text,
    (new.raw_user_meta_data->>'company_name')::text,
    case
      when (new.raw_user_meta_data->>'role') = 'admin' then 'approved'
      else 'pending'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 2: Supabase 대시보드에서 SQL 실행**

Supabase 대시보드 → SQL Editor → 위 SQL 전체 붙여넣기 → Run

- [ ] **Step 3: 테이블 생성 확인**

Supabase 대시보드 → Table Editor에서 확인:
- profiles, quote_requests, quotes, quote_selections, chat_rooms, messages, notifications (총 7개)

- [ ] **Step 4: 관리자 계정 초기 생성**

Supabase 대시보드 → Authentication → Users → "Add user" → 이메일/비밀번호 입력 후:
```sql
-- SQL Editor에서 실행 (admin@yourdomain.com을 실제 이메일로 교체)
update public.profiles
set role = 'admin', status = 'approved'
where email = 'admin@yourdomain.com';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema with RLS policies and triggers"
```

---

### Task 4: 유틸 함수 (TDD)

**Files:**
- Create: `src/lib/utils.ts`
- Test: `src/__tests__/utils.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

`src/__tests__/utils.test.ts`:
```typescript
import { calculateTotalPeople, formatDate, hotelGradeLabel } from '@/lib/utils'

describe('calculateTotalPeople', () => {
  it('성인 + 아동 + 영유아 + 인솔자 합산', () => {
    expect(calculateTotalPeople({ adults: 10, children: 5, infants: 2, leaders: 1 })).toBe(18)
  })

  it('모든 값이 0이면 0 반환', () => {
    expect(calculateTotalPeople({ adults: 0, children: 0, infants: 0, leaders: 0 })).toBe(0)
  })

  it('일부 값만 있어도 올바르게 합산', () => {
    expect(calculateTotalPeople({ adults: 20, children: 0, infants: 0, leaders: 2 })).toBe(22)
  })
})

describe('formatDate', () => {
  it('ISO 날짜 문자열을 한국어 형식으로 변환', () => {
    expect(formatDate('2026-06-15')).toBe('2026년 6월 15일')
  })
})

describe('hotelGradeLabel', () => {
  it('숫자를 성급 레이블로 변환', () => {
    expect(hotelGradeLabel(5)).toBe('5성급')
    expect(hotelGradeLabel(3)).toBe('3성급')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx jest src/__tests__/utils.test.ts
```

Expected: FAIL — `@/lib/utils` not found

- [ ] **Step 3: 유틸 함수 구현**

`src/lib/utils.ts`:
```typescript
export interface PeopleCount {
  adults: number
  children: number
  infants: number
  leaders: number
}

export function calculateTotalPeople(people: PeopleCount): number {
  return people.adults + people.children + people.infants + people.leaders
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function hotelGradeLabel(grade: number): string {
  return `${grade}성급`
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '견적 접수 중',
    in_progress: '협업 진행 중',
    closed: '마감',
    finalized: '최종 확정',
    pending: '승인 대기',
    approved: '승인됨',
    rejected: '거절됨',
    submitted: '제출됨',
    selected: '선택됨',
  }
  return labels[status] ?? status
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx jest src/__tests__/utils.test.ts
```

Expected: PASS (3개 test suite, 7개 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/__tests__/
git commit -m "feat: add utility functions with tests"
```

---

### Task 5: 로그인 & 회원가입 페이지

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/app/pending/page.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Root layout 작성**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '인센티브투어 견적 플랫폼',
  description: '여행사와 랜드사를 위한 견적 협업 플랫폼',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: 루트 페이지 (로그인으로 리다이렉트)**

`src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
}
```

- [ ] **Step 3: 로그인 페이지 작성**

`src/app/(auth)/login/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', data.user.id)
      .single()

    if (profile?.status === 'pending') {
      router.push('/pending')
    } else if (profile?.role === 'admin') {
      router.push('/admin')
    } else if (profile?.role === 'agency') {
      router.push('/agency')
    } else {
      router.push('/landco')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-2">인센티브투어 견적 플랫폼</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">로그인</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">회원가입</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 회원가입 페이지 작성**

`src/app/(auth)/signup/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/supabase/types'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState<UserRole>('agency')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, company_name: companyName } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/pending')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">회원가입</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">회사 유형</label>
            <div className="flex gap-6">
              {(['agency', 'landco'] as UserRole[]).map(r => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                  />
                  <span>{r === 'agency' ? '여행사' : '랜드사'}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">회사명</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">비밀번호 (6자 이상)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '가입 신청'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 승인 대기 페이지 작성**

`src/app/pending/page.tsx`:
```tsx
export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-2">승인 대기 중</h1>
        <p className="text-gray-600">
          가입 신청이 완료되었습니다.<br />
          관리자 승인 후 서비스를 이용하실 수 있습니다.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 수동 테스트**

```bash
npm run dev
```

1. `/signup` → 여행사로 회원가입 → `/pending` 리다이렉트 확인
2. `/login` → 같은 계정으로 로그인 → `/pending` 리다이렉트 확인
3. Supabase 대시보드 → Authentication → Users 에서 신규 유저 확인
4. admin 계정으로 로그인 → `/admin` 리다이렉트 확인

- [ ] **Step 7: Commit**

```bash
git add src/app/
git commit -m "feat: add login, signup, and pending pages"
```

---

### Task 6: 관리자 대시보드

**Files:**
- Create: `src/app/(dashboard)/admin/layout.tsx`
- Create: `src/app/(dashboard)/admin/page.tsx`
- Create: `src/app/api/admin/approve/route.ts`
- Create: `src/app/api/admin/assign-countries/route.ts`

- [ ] **Step 1: 승인 API 작성**

`src/app/api/admin/approve/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: admin } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, status } = await request.json()
  const { error } = await supabase
    .from('profiles').update({ status }).eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: 국가 지정 API 작성**

`src/app/api/admin/assign-countries/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: admin } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { landcoId, countryCodes } = await request.json()
  const { error } = await supabase
    .from('profiles').update({ country_codes: countryCodes }).eq('id', landcoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: 관리자 레이아웃 작성**

`src/app/(dashboard)/admin/layout.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/login')

  return <div className="min-h-screen bg-gray-50">{children}</div>
}
```

- [ ] **Step 4: 관리자 대시보드 페이지 작성**

`src/app/(dashboard)/admin/page.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

const COUNTRY_OPTIONS = [
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'TH', name: '태국' },
  { code: 'VN', name: '베트남' },
  { code: 'SG', name: '싱가포르' },
  { code: 'ES', name: '스페인' },
  { code: 'IT', name: '이탈리아' },
  { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' },
  { code: 'US', name: '미국' },
  { code: 'AU', name: '호주' },
  { code: 'AE', name: '두바이/UAE' },
  { code: 'HU', name: '헝가리' },
  { code: 'AT', name: '오스트리아' },
]

export default function AdminPage() {
  const supabase = createClient()
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([])
  const [landcos, setLandcos] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const [{ data: pending }, { data: approved }] = await Promise.all([
        supabase.from('profiles').select('*').eq('status', 'pending').neq('role', 'admin'),
        supabase.from('profiles').select('*').eq('status', 'approved').eq('role', 'landco'),
      ])
      setPendingUsers(pending ?? [])
      setLandcos(approved ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  async function handleApprove(userId: string, status: 'approved' | 'rejected') {
    await fetch('/api/admin/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status }),
    })
    const user = pendingUsers.find(u => u.id === userId)
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
    if (status === 'approved' && user?.role === 'landco') {
      setLandcos(prev => [...prev, { ...user, status: 'approved' }])
    }
  }

  async function handleToggleCountry(landcoId: string, currentCodes: string[], code: string) {
    const newCodes = currentCodes.includes(code)
      ? currentCodes.filter(c => c !== code)
      : [...currentCodes, code]
    await fetch('/api/admin/assign-countries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landcoId, countryCodes: newCodes }),
    })
    setLandcos(prev => prev.map(l => l.id === landcoId ? { ...l, country_codes: newCodes } : l))
  }

  if (loading) return <div className="p-8 text-gray-500">로딩 중...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">관리자 대시보드</h1>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">
          가입 승인 대기 <span className="text-gray-500 font-normal">({pendingUsers.length})</span>
        </h2>
        {pendingUsers.length === 0 ? (
          <p className="text-gray-400">대기 중인 가입 신청이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {pendingUsers.map(user => (
              <div key={user.id} className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-medium">{user.company_name}</p>
                  <p className="text-sm text-gray-500">
                    {user.email} · {user.role === 'agency' ? '여행사' : '랜드사'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(user.id, 'approved')}
                    className="bg-green-500 text-white px-4 py-1.5 rounded text-sm hover:bg-green-600"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleApprove(user.id, 'rejected')}
                    className="bg-red-100 text-red-600 px-4 py-1.5 rounded text-sm hover:bg-red-200"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">랜드사 국가 지정</h2>
        {landcos.length === 0 ? (
          <p className="text-gray-400">승인된 랜드사가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {landcos.map(landco => (
              <div key={landco.id} className="bg-white p-4 rounded-lg shadow-sm">
                <p className="font-medium mb-3">{landco.company_name}</p>
                <div className="flex flex-wrap gap-2">
                  {COUNTRY_OPTIONS.map(country => {
                    const selected = landco.country_codes.includes(country.code)
                    return (
                      <button
                        key={country.code}
                        onClick={() => handleToggleCountry(landco.id, landco.country_codes, country.code)}
                        className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                          selected
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {country.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: 수동 테스트**

```bash
npm run dev
```

1. admin 계정으로 `/login` → `/admin` 진입 확인
2. 여행사 계정 회원가입 → 관리자 화면에서 승인 버튼 클릭 → 목록에서 사라짐 확인
3. 랜드사 계정 승인 후 국가 버튼 클릭 → 색상 변경 확인
4. Supabase 대시보드 → profiles 테이블에서 country_codes 업데이트 확인

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/admin/ src/app/api/admin/
git commit -m "feat: add admin dashboard with approval and country assignment"
```

---

## Plan 1 완료 체크리스트

- [ ] `npm run dev` 정상 실행
- [ ] `/signup` → 회원가입 → `/pending` 리다이렉트
- [ ] admin 로그인 → `/admin` 진입
- [ ] 가입 승인 기능 동작
- [ ] 랜드사 국가 지정 기능 동작
- [ ] `npx jest` 모든 테스트 통과

> **다음**: `2026-03-26-incentive-quote-02-quote-core.md` 로 진행
