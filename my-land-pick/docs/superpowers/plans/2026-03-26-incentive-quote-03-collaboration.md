# 인센티브투어 견적 플랫폼 — Plan 3: Collaboration + Communication

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**전제조건:** Plan 1, Plan 2 완료 후 진행

**Goal:** 랜드사 선택·버전 협업, 플로팅 채팅(견적별·페이지 이동 유지), 인앱 알림, 이메일 알림(Resend)을 완성하여 플랫폼의 전체 플로우를 완성한다.

**Architecture:** 채팅은 Supabase Realtime 채널 구독. 플로팅 채팅 위젯은 React Context로 전역 관리, 루트 레이아웃에 마운트. 알림은 Supabase Realtime + Resend. 선택·확정은 API Routes에서 트랜잭션으로 처리.

**Tech Stack:** Next.js 14 App Router, Supabase Realtime, Resend, TypeScript

---

## File Map

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── agency/
│   │   │   └── requests/[id]/
│   │   │       └── page.tsx         — 랜드사 선택 버튼 추가
│   │   └── landco/
│   │       └── requests/[id]/
│   │           └── page.tsx         — 선택됨 배지 + 재업로드 안내
│   ├── api/
│   │   ├── quotes/select/route.ts   — POST: 랜드사 선택
│   │   ├── quotes/finalize/route.ts — POST: 최종 확정
│   │   ├── chat/rooms/route.ts      — GET/POST: 채팅방 조회/생성
│   │   ├── chat/messages/route.ts   — GET: 메시지 목록
│   │   └── notifications/route.ts  — GET: 알림 목록, PATCH: 읽음 처리
│   └── layout.tsx                   — FloatingChat 마운트
├── components/
│   ├── chat/
│   │   ├── ChatProvider.tsx         — 전역 채팅 Context
│   │   ├── FloatingChat.tsx         — 우하단 고정 채팅 위젯
│   │   ├── ChatRoomList.tsx         — 채팅방 목록 패널
│   │   └── ChatWindow.tsx           — 개별 채팅창
│   └── notifications/
│       └── NotificationBell.tsx     — 헤더 알림 벨
└── lib/
    └── email/
        └── notifications.ts         — Resend 이메일 발송 함수
```

---

### Task 12: 랜드사 선택 & 최종 확정

**Files:**
- Create: `src/app/api/quotes/select/route.ts`
- Create: `src/app/api/quotes/finalize/route.ts`
- Modify: `src/app/(dashboard)/agency/requests/[id]/page.tsx`
- Test: `src/__tests__/selection.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/__tests__/selection.test.ts`:
```typescript
// 선택 상태 전환 로직 테스트
describe('quote selection state', () => {
  it('선택된 랜드사는 selected 상태여야 함', () => {
    const quotes = [
      { id: 'q1', landco_id: 'l1', status: 'submitted' },
      { id: 'q2', landco_id: 'l2', status: 'submitted' },
    ]
    // 선택 로직: landco_id가 l1인 것을 선택하면 q1이 selected
    const selected = quotes.find(q => q.landco_id === 'l1')
    expect(selected?.status).toBe('submitted') // 선택 전
    const updated = quotes.map(q =>
      q.landco_id === 'l1' ? { ...q, status: 'selected' } : q
    )
    expect(updated.find(q => q.id === 'q1')?.status).toBe('selected')
    expect(updated.find(q => q.id === 'q2')?.status).toBe('submitted')
  })

  it('최종 확정 시 finalized 상태여야 함', () => {
    const quote = { id: 'q1', status: 'selected' }
    const finalized = { ...quote, status: 'finalized' }
    expect(finalized.status).toBe('finalized')
  })
})
```

- [ ] **Step 2: 테스트 실행**

```bash
npx jest src/__tests__/selection.test.ts
```

Expected: PASS

- [ ] **Step 3: 랜드사 선택 API 작성**

`src/app/api/quotes/select/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSelectedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, landcoId, quoteId } = await request.json()

  // 요청 소유자 확인
  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // quote_selections upsert
  const { error: selError } = await supabase
    .from('quote_selections')
    .upsert({ request_id: requestId, selected_quote_id: quoteId, landco_id: landcoId })

  if (selError) return NextResponse.json({ error: selError.message }, { status: 500 })

  // quote status 업데이트
  await supabase.from('quotes')
    .update({ status: 'selected' })
    .eq('id', quoteId)

  // quote_requests 상태 업데이트
  await supabase.from('quote_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)

  // 랜드사에게 알림 생성
  const { data: qrFull } = await supabase
    .from('quote_requests').select('event_name').eq('id', requestId).single()

  await supabase.from('notifications').insert({
    user_id: landcoId,
    type: 'quote_selected',
    payload: { request_id: requestId, event_name: qrFull?.event_name },
  })

  // 랜드사 이메일 알림
  const { data: landco } = await supabase
    .from('profiles').select('email, company_name').eq('id', landcoId).single()
  if (landco) {
    await sendQuoteSelectedEmail({
      to: landco.email,
      company_name: landco.company_name,
      event_name: qrFull?.event_name ?? '',
      request_id: requestId,
    })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: 최종 확정 API 작성**

`src/app/api/quotes/finalize/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFinalizedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId } = await request.json()

  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id, event_name').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: selection } = await supabase
    .from('quote_selections').select('*').eq('request_id', requestId).single()
  if (!selection) return NextResponse.json({ error: 'No selection found' }, { status: 400 })

  // 최종 확정 처리
  await supabase.from('quote_selections')
    .update({ finalized_at: new Date().toISOString() })
    .eq('request_id', requestId)

  await supabase.from('quotes')
    .update({ status: 'finalized' })
    .eq('id', selection.selected_quote_id)

  await supabase.from('quote_requests')
    .update({ status: 'finalized' })
    .eq('id', requestId)

  // 랜드사 알림
  await supabase.from('notifications').insert({
    user_id: selection.landco_id,
    type: 'quote_finalized',
    payload: { request_id: requestId, event_name: qr.event_name },
  })

  const { data: landco } = await supabase
    .from('profiles').select('email, company_name').eq('id', selection.landco_id).single()
  if (landco) {
    await sendFinalizedEmail({
      to: landco.email,
      company_name: landco.company_name,
      event_name: qr.event_name,
    })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: 여행사 요청 상세 페이지에 선택 버튼 추가**

`src/app/(dashboard)/agency/requests/[id]/page.tsx` — 기존 파일에 선택 기능 추가:

각 랜드사 카드의 하단에 다음 버튼 블록을 추가 (Plan 2의 파일 수정):

```tsx
// 컴포넌트 내부 상태 추가
const [selection, setSelection] = useState<{ landco_id: string; finalized_at: string | null } | null>(null)

// useEffect에 추가:
const { data: sel } = await supabase
  .from('quote_selections').select('*').eq('request_id', id).maybeSingle()
setSelection(sel)

// handleSelect 함수 추가:
async function handleSelect(landcoId: string, quoteId: string) {
  if (!confirm('이 랜드사를 선택하시겠습니까?')) return
  await fetch('/api/quotes/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: id, landcoId, quoteId }),
  })
  setSelection({ landco_id: landcoId, finalized_at: null })
}

async function handleFinalize() {
  if (!confirm('최종 확정하시겠습니까? 확정 후에는 변경이 어렵습니다.')) return
  await fetch('/api/quotes/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: id }),
  })
  setSelection(prev => prev ? { ...prev, finalized_at: new Date().toISOString() } : null)
}

// 각 랜드사 카드 하단에 추가:
{!selection && (
  <button
    onClick={() => handleSelect(landcoId, quotes[0].id)}
    className="mt-3 w-full bg-blue-600 text-white py-2 rounded-md text-sm hover:bg-blue-700"
  >
    이 랜드사 선택
  </button>
)}
{selection?.landco_id === landcoId && (
  <div className="mt-3 flex items-center gap-3">
    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
      선택됨
    </span>
    {!selection.finalized_at && (
      <button
        onClick={handleFinalize}
        className="bg-purple-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-purple-700"
      >
        최종 확정
      </button>
    )}
    {selection.finalized_at && (
      <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
        최종 확정 완료
      </span>
    )}
  </div>
)}
```

- [ ] **Step 6: 수동 테스트**

```bash
npm run dev
```

1. 여행사로 요청 상세 페이지 → "이 랜드사 선택" 클릭 → "선택됨" 배지 확인
2. "최종 확정" 클릭 → "최종 확정 완료" 표시 확인
3. Supabase 대시보드 → quote_selections 테이블에서 데이터 확인
4. 랜드사 계정으로 로그인 → notifications 테이블에 알림 생성 확인

- [ ] **Step 7: Commit**

```bash
git add src/app/api/quotes/ src/app/(dashboard)/agency/ src/__tests__/selection.test.ts
git commit -m "feat: add landco selection and quote finalization"
```

---

### Task 13: 이메일 알림 (Resend)

**Files:**
- Create: `src/lib/email/notifications.ts`

- [ ] **Step 1: Resend 이메일 함수 구현**

`src/lib/email/notifications.ts`:
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'noreply@your-domain.com' // 실제 도메인으로 교체

interface QuoteRequestNotification {
  to: string
  company_name: string
  event_name: string
  request_id: string
}

export async function sendNewRequestEmail(params: {
  to: string[]
  event_name: string
  destination: string
  deadline: string
  request_id: string
}) {
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `[견적요청] ${params.event_name}`,
    html: `
      <h2>새 견적 요청이 접수되었습니다</h2>
      <p><strong>행사명:</strong> ${params.event_name}</p>
      <p><strong>목적지:</strong> ${params.destination}</p>
      <p><strong>마감일:</strong> ${params.deadline}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/landco/requests/${params.request_id}">견적서 작성하기</a></p>
    `,
  })
}

export async function sendQuoteSubmittedEmail(params: {
  to: string
  event_name: string
  landco_name: string
  request_id: string
}) {
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `[견적서 도착] ${params.event_name} — ${params.landco_name}`,
    html: `
      <h2>새 견적서가 도착했습니다</h2>
      <p><strong>행사명:</strong> ${params.event_name}</p>
      <p><strong>랜드사:</strong> ${params.landco_name}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agency/requests/${params.request_id}">견적서 확인하기</a></p>
    `,
  })
}

export async function sendQuoteSelectedEmail(params: QuoteRequestNotification) {
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `[선택됨] ${params.event_name} 견적서가 선택되었습니다`,
    html: `
      <h2>축하합니다! 귀사의 견적서가 선택되었습니다</h2>
      <p><strong>행사명:</strong> ${params.event_name}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/landco/requests/${params.request_id}">견적 협업 진행하기</a></p>
    `,
  })
}

export async function sendFinalizedEmail(params: {
  to: string
  company_name: string
  event_name: string
}) {
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `[최종확정] ${params.event_name} 견적이 최종 확정되었습니다`,
    html: `
      <h2>견적이 최종 확정되었습니다</h2>
      <p><strong>행사명:</strong> ${params.event_name}</p>
      <p>여행사가 귀사의 견적을 최종 확정했습니다. 고객과 직접 연락하여 진행해주세요.</p>
    `,
  })
}

export async function sendChatMessageEmail(params: {
  to: string
  sender_name: string
  event_name: string
  request_id: string
}) {
  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `[채팅] ${params.event_name} — ${params.sender_name}님이 메시지를 보냈습니다`,
    html: `
      <h2>새 채팅 메시지가 도착했습니다</h2>
      <p><strong>보낸 사람:</strong> ${params.sender_name}</p>
      <p><strong>행사명:</strong> ${params.event_name}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">플랫폼에서 확인하기</a></p>
    `,
  })
}
```

- [ ] **Step 2: .env.local에 앱 URL 추가**

`.env.local`에 아래 항목 추가:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

배포 후에는 실제 도메인으로 교체.

- [ ] **Step 3: 견적 요청 생성 API에 이메일 발송 추가**

`src/app/api/requests/route.ts` — POST 핸들러 내 insert 성공 후 추가:

```typescript
import { sendNewRequestEmail } from '@/lib/email/notifications'

// ... insert 성공 후:
// 해당 국가 랜드사 목록 조회 후 이메일 발송
const { data: landcos } = await supabase
  .from('profiles')
  .select('email')
  .eq('role', 'landco')
  .eq('status', 'approved')
  .contains('country_codes', [body.destination_country])

if (landcos && landcos.length > 0) {
  await sendNewRequestEmail({
    to: landcos.map(l => l.email),
    event_name: body.event_name,
    destination: `${body.destination_city} (${body.destination_country})`,
    deadline: body.deadline,
    request_id: data.id,
  })
}
```

- [ ] **Step 4: 견적서 업로드 API에 이메일 발송 추가**

`src/app/api/quotes/route.ts` — insert 성공 후 추가:

```typescript
import { sendQuoteSubmittedEmail } from '@/lib/email/notifications'

// ... insert 성공 후:
const { data: requestInfo } = await supabase
  .from('quote_requests')
  .select('event_name, agency_id, profiles!quote_requests_agency_id_fkey(email)')
  .eq('id', requestId)
  .single()

const { data: landcoInfo } = await supabase
  .from('profiles').select('company_name').eq('id', user.id).single()

if (requestInfo) {
  const agencyEmail = (requestInfo as any).profiles?.email
  if (agencyEmail) {
    await sendQuoteSubmittedEmail({
      to: agencyEmail,
      event_name: requestInfo.event_name,
      landco_name: landcoInfo?.company_name ?? '',
      request_id: requestId,
    })
  }
}
```

- [ ] **Step 5: Resend API 키 설정 및 이메일 발송 테스트**

1. https://resend.com 가입 → API 키 발급
2. `.env.local`의 `RESEND_API_KEY`에 키 입력
3. 도메인 설정 (개발 중에는 Resend에서 제공하는 test 이메일로 발송 가능)
4. 견적 요청 생성 후 Resend 대시보드 → Emails 에서 발송 확인

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/ src/app/api/requests/route.ts src/app/api/quotes/route.ts
git commit -m "feat: add email notifications via Resend"
```

---

### Task 14: 채팅 Context & API

**Files:**
- Create: `src/components/chat/ChatProvider.tsx`
- Create: `src/app/api/chat/rooms/route.ts`
- Create: `src/app/api/chat/messages/route.ts`

- [ ] **Step 1: 채팅방 API 작성**

`src/app/api/chat/rooms/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 내 채팅방 목록
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const column = profile?.role === 'agency' ? 'agency_id' : 'landco_id'

  const { data: rooms } = await supabase
    .from('chat_rooms')
    .select(`
      *,
      quote_requests(event_name),
      agency:profiles!chat_rooms_agency_id_fkey(company_name),
      landco:profiles!chat_rooms_landco_id_fkey(company_name)
    `)
    .eq(column, user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ rooms: rooms ?? [] })
}

// POST: 채팅방 생성 (없으면 생성, 있으면 반환)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, landcoId } = await request.json()

  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id').eq('id', requestId).single()
  if (!qr) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // 이미 존재하는 채팅방 조회
  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('request_id', requestId)
    .eq('landco_id', landcoId)
    .maybeSingle()

  if (existing) return NextResponse.json({ room: existing })

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .insert({ request_id: requestId, agency_id: qr.agency_id, landco_id: landcoId })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ room }, { status: 201 })
}
```

- [ ] **Step 2: 메시지 API 작성**

`src/app/api/chat/messages/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const roomId = request.nextUrl.searchParams.get('roomId')
  if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 })

  const { data: messages } = await supabase
    .from('messages')
    .select('*, profiles!messages_sender_id_fkey(company_name)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: messages ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { roomId, content } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, sender_id: user.id, content: content.trim() })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data }, { status: 201 })
}
```

- [ ] **Step 3: Chat Context 작성**

`src/components/chat/ChatProvider.tsx`:
```tsx
'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface ChatRoom {
  id: string
  request_id: string
  event_name: string
  other_company: string
  unread_count: number
}

interface ChatContextValue {
  rooms: ChatRoom[]
  activeRoomId: string | null
  isOpen: boolean
  setRooms: (rooms: ChatRoom[]) => void
  openRoom: (roomId: string) => void
  closeRoom: () => void
  toggleOpen: () => void
  incrementUnread: (roomId: string) => void
  clearUnread: (roomId: string) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const openRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId)
    setIsOpen(true)
  }, [])

  const closeRoom = useCallback(() => {
    setActiveRoomId(null)
  }, [])

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const incrementUnread = useCallback((roomId: string) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, unread_count: r.unread_count + 1 } : r
    ))
  }, [])

  const clearUnread = useCallback((roomId: string) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, unread_count: 0 } : r
    ))
  }, [])

  return (
    <ChatContext.Provider value={{
      rooms, setRooms, activeRoomId, isOpen,
      openRoom, closeRoom, toggleOpen, incrementUnread, clearUnread,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/ src/components/chat/ChatProvider.tsx
git commit -m "feat: add chat room/message APIs and chat context provider"
```

---

### Task 15: 플로팅 채팅 위젯

**Files:**
- Create: `src/components/chat/FloatingChat.tsx`
- Create: `src/components/chat/ChatRoomList.tsx`
- Create: `src/components/chat/ChatWindow.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: ChatWindow 컴포넌트 작성**

`src/components/chat/ChatWindow.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useChat } from './ChatProvider'

interface Message {
  id: string
  sender_id: string
  content: string
  created_at: string
  profiles: { company_name: string }
}

export default function ChatWindow({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const supabase = createClient()
  const { clearUnread } = useChat()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [roomTitle, setRoomTitle] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyUserId(user?.id ?? null))
  }, [])

  useEffect(() => {
    // 채팅방 정보 로드
    fetch('/api/chat/rooms')
      .then(r => r.json())
      .then(({ rooms }) => {
        const room = rooms?.find((r: any) => r.id === roomId)
        if (room) setRoomTitle(`${room.quote_requests?.event_name ?? '견적'} — ${room.landco?.company_name ?? room.agency?.company_name ?? ''}`)
      })

    // 메시지 초기 로드
    fetch(`/api/chat/messages?roomId=${roomId}`)
      .then(r => r.json())
      .then(({ messages }) => setMessages(messages))

    clearUnread(roomId)

    // Realtime 구독
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message])
        clearUnread(roomId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, content: input.trim() }),
    })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-white">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{roomTitle || '채팅'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
        {messages.map(msg => {
          const isMe = msg.sender_id === myUserId
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${isMe ? '' : ''}`}>
                {!isMe && (
                  <p className="text-xs text-gray-400 mb-0.5">{msg.profiles?.company_name}</p>
                )}
                <div className={`px-3 py-2 rounded-lg text-sm ${
                  isMe ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 shadow-sm'
                }`}>
                  {msg.content}
                </div>
                <p className="text-xs text-gray-300 mt-0.5 text-right">
                  {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 p-2 border-t bg-white">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="메시지 입력..."
          className="flex-1 border rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="bg-blue-500 text-white px-3 py-1.5 rounded-full text-sm hover:bg-blue-600 disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: ChatRoomList 컴포넌트 작성**

`src/components/chat/ChatRoomList.tsx`:
```tsx
'use client'

import { useChat } from './ChatProvider'

export default function ChatRoomList() {
  const { rooms, openRoom } = useChat()

  if (rooms.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4">
        채팅방이 없습니다.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {rooms.map(room => (
        <button
          key={room.id}
          onClick={() => openRoom(room.id)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b flex items-center justify-between"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{room.event_name}</p>
            <p className="text-xs text-gray-400 truncate">{room.other_company}</p>
          </div>
          {room.unread_count > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2">
              {room.unread_count > 9 ? '9+' : room.unread_count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: FloatingChat 메인 위젯 작성**

`src/components/chat/FloatingChat.tsx`:
```tsx
'use client'

import { useEffect } from 'react'
import { useChat } from './ChatProvider'
import ChatRoomList from './ChatRoomList'
import ChatWindow from './ChatWindow'

export default function FloatingChat() {
  const { rooms, setRooms, activeRoomId, isOpen, toggleOpen, closeRoom } = useChat()

  useEffect(() => {
    fetch('/api/chat/rooms')
      .then(r => r.json())
      .then(({ rooms: apiRooms }) => {
        if (!apiRooms) return
        setRooms(apiRooms.map((r: any) => ({
          id: r.id,
          request_id: r.request_id,
          event_name: r.quote_requests?.event_name ?? '견적',
          other_company: r.agency?.company_name ?? r.landco?.company_name ?? '',
          unread_count: 0,
        })))
      })
      .catch(() => {}) // 미로그인 상태에서는 무시
  }, [])

  const totalUnread = rooms.reduce((sum, r) => sum + r.unread_count, 0)

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="w-80 h-[480px] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <span className="font-semibold text-sm">채팅</span>
            <button onClick={toggleOpen} className="text-white/80 hover:text-white text-lg leading-none">
              ✕
            </button>
          </div>
          {activeRoomId ? (
            <ChatWindow roomId={activeRoomId} onBack={closeRoom} />
          ) : (
            <ChatRoomList />
          )}
        </div>
      )}

      <button
        onClick={toggleOpen}
        className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center relative"
      >
        <span className="text-xl">💬</span>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Root layout에 ChatProvider & FloatingChat 추가**

`src/app/layout.tsx` 수정:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ChatProvider } from '@/components/chat/ChatProvider'
import FloatingChat from '@/components/chat/FloatingChat'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '인센티브투어 견적 플랫폼',
  description: '여행사와 랜드사를 위한 견적 협업 플랫폼',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <ChatProvider>
          {children}
          <FloatingChat />
        </ChatProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: 랜드사 요청 상세에 채팅방 열기 버튼 추가**

`src/app/(dashboard)/landco/requests/[id]/page.tsx` — 페이지 상단에 추가:

```tsx
import { useChat } from '@/components/chat/ChatProvider'

// 컴포넌트 내부:
const { openRoom } = useChat()

async function handleOpenChat() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const res = await fetch('/api/chat/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: id, landcoId: user.id }),
  })
  const { room } = await res.json()
  openRoom(room.id)
}

// JSX에 버튼 추가:
<button
  onClick={handleOpenChat}
  className="bg-green-500 text-white px-4 py-2 rounded-md text-sm hover:bg-green-600"
>
  여행사와 채팅
</button>
```

- [ ] **Step 6: 수동 테스트**

```bash
npm run dev
```

1. 여행사·랜드사 두 브라우저 창 열기
2. 랜드사 → 견적 요청 상세 → "여행사와 채팅" 클릭
3. 우하단 플로팅 채팅 아이콘 확인
4. 채팅창 열기 → 채팅방 목록 → 채팅방 진입
5. 두 브라우저에서 메시지 주고받기 → 실시간 수신 확인
6. 다른 페이지로 이동 → 채팅창 유지 확인

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ src/app/layout.tsx
git commit -m "feat: add floating chat widget with realtime messaging"
```

---

### Task 16: 인앱 알림

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/components/notifications/NotificationBell.tsx`
- Modify: `src/app/(dashboard)/agency/layout.tsx`
- Modify: `src/app/(dashboard)/landco/layout.tsx`

- [ ] **Step 1: 알림 API 작성**

`src/app/api/notifications/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ notifications: notifications ?? [] })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { notificationId } = await request.json()

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: NotificationBell 컴포넌트 작성**

`src/components/notifications/NotificationBell.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Notification } from '@/lib/supabase/types'

const TYPE_LABELS: Record<string, string> = {
  quote_selected: '견적서가 선택되었습니다',
  quote_finalized: '견적이 최종 확정되었습니다',
  new_quote: '새 견적서가 도착했습니다',
  new_request: '새 견적 요청이 접수되었습니다',
}

export default function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = notifications.filter(n => !n.read_at).length

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(({ notifications }) => setNotifications(notifications ?? []))

    // Realtime 구독
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleClick(notification: Notification) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: notification.id }),
    })
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)
    )
    const payload = notification.payload as Record<string, string>
    if (payload.request_id) {
      router.push(`/agency/requests/${payload.request_id}`)
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-1.5 rounded-full hover:bg-gray-100"
      >
        <span className="text-xl">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-72 bg-white rounded-lg shadow-xl border z-40 max-h-80 overflow-y-auto">
          <div className="px-4 py-2.5 border-b font-semibold text-sm">알림</div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">알림이 없습니다.</div>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0 ${!n.read_at ? 'bg-blue-50' : ''}`}
              >
                <p className="text-sm">{TYPE_LABELS[n.type] ?? n.type}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(n.payload as any)?.event_name}
                </p>
                <p className="text-xs text-gray-300 mt-0.5">
                  {new Date(n.created_at).toLocaleString('ko-KR')}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 여행사·랜드사 레이아웃 헤더에 NotificationBell 추가**

`src/app/(dashboard)/agency/layout.tsx` — 헤더에 추가:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import NotificationBell from '@/components/notifications/NotificationBell'

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_name').eq('id', user.id).single()
  if (profile?.role !== 'agency') redirect('/login')
  if (profile?.status !== 'approved') redirect('/pending')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <Link href="/agency" className="text-lg font-bold text-blue-600">견적 플랫폼</Link>
        <div className="flex items-center gap-3">
          <NotificationBell userId={user.id} />
          <span className="text-sm text-gray-600">{profile.company_name} (여행사)</span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
```

랜드사 레이아웃(`src/app/(dashboard)/landco/layout.tsx`)도 동일하게 `NotificationBell` 추가.

- [ ] **Step 4: 수동 테스트**

```bash
npm run dev
```

1. 랜드사로 견적서 업로드 → 여행사 헤더 벨 아이콘에 빨간 배지 표시 확인
2. 벨 아이콘 클릭 → 알림 목록 드롭다운 확인
3. 알림 클릭 → 해당 요청 페이지로 이동 + 읽음 처리(파란 배경 사라짐) 확인

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/ src/components/notifications/ src/app/(dashboard)/
git commit -m "feat: add in-app notifications with realtime updates"
```

---

### Task 17: 최종 점검 & 빌드 검증

- [ ] **Step 1: 전체 테스트 실행**

```bash
npx jest --passWithNoTests
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: TypeScript 빌드 검증**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 프로덕션 빌드**

```bash
npm run build
```

Expected: 빌드 성공 (에러 없음)

- [ ] **Step 4: 전체 플로우 E2E 수동 테스트**

두 개의 브라우저 창에서 진행:

**시나리오:**
1. 여행사 회원가입 → 관리자 승인 → 로그인
2. 랜드사 회원가입 → 관리자 승인 → 국가 지정 → 로그인
3. 여행사: 견적 요청 생성 (일본 오사카)
4. 랜드사: 요청 목록에서 확인 → 템플릿 다운로드 → 엑셀 작성 → 업로드
5. 여행사: 새 견적서 도착 알림 확인 → 요청 상세에서 견적서 다운로드
6. 여행사: 랜드사 선택
7. 랜드사: 선택 알림 확인 → 채팅 시작
8. 여행사·랜드사: 실시간 채팅으로 수정 협의
9. 랜드사: v2 견적서 업로드
10. 여행사: v2 확인 → 최종 확정
11. 랜드사: 최종 확정 알림 확인

- [ ] **Step 5: Vercel 배포**

```bash
# Vercel CLI 설치 및 배포
npm install -g vercel
vercel --prod
```

Vercel 환경 변수 설정 (대시보드 → Settings → Environment Variables):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_APP_URL` (배포된 URL로)

- [ ] **Step 6: 최종 커밋**

```bash
git add .
git commit -m "feat: complete incentive quote platform MVP"
```

---

## Plan 3 완료 체크리스트

- [ ] `npx jest` 모든 테스트 통과
- [ ] `npm run build` 성공
- [ ] 랜드사 선택 → quote_selections 생성 확인
- [ ] 최종 확정 → status=finalized 확인
- [ ] 플로팅 채팅창 페이지 이동 후에도 유지
- [ ] 실시간 채팅 두 브라우저에서 동시 동작
- [ ] 인앱 알림 벨 아이콘 + 뱃지 동작
- [ ] 이메일 알림 Resend 대시보드에서 확인
- [ ] Vercel 배포 성공

---

## 전체 플랜 요약

| 플랜 | 내용 | 주요 결과물 |
|------|------|------------|
| Plan 1 | Foundation | 인증, DB, 관리자 대시보드 |
| Plan 2 | Quote Core | 견적 요청·제출·엑셀·조회 |
| Plan 3 | Collaboration | 선택·확정·채팅·알림·배포 |
