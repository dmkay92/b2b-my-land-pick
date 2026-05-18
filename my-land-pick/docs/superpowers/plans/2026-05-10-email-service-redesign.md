# Email Service Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resend 기반 이메일 서비스를 브랜드 템플릿으로 리팩터링하고, 신규 이메일 5종 + Cron 미확인 메시지 알림을 구현한다.

**Architecture:** `src/lib/email/`를 constants → template → notifications 3파일로 분리. 모든 이메일이 공통 HTML 레이아웃을 공유하며, 채팅 이메일은 즉시 발송에서 Cron 지연 발송으로 전환.

**Tech Stack:** Next.js 16, Resend SDK, Supabase PostgreSQL, Vercel Cron

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/email/constants.ts` | FROM 주소, 로고 URL, 임계값 상수 |
| Create | `src/lib/email/template.ts` | 공통 HTML 래퍼 함수 |
| Rewrite | `src/lib/email/notifications.ts` | 10개 이메일 발송 함수 |
| Create | `src/app/api/cron/unread-messages/route.ts` | Cron 미확인 메시지 체크 + 발송 |
| Create | `supabase/migrations/20260510000000_chat_email_sent_at.sql` | chat_rooms에 email_sent_at 컬럼 추가 |
| Create | `vercel.json` | Cron 스케줄 설정 |
| Modify | `src/app/api/admin/approve/route.ts` | sendApprovalEmail 호출 추가 |
| Modify | `src/app/api/chat/rooms/[roomId]/messages/route.ts` | 즉시 이메일 발송 제거 |
| Modify | `src/app/api/chat/rooms/[roomId]/read/route.ts` | email_sent_at 리셋 추가 |
| Modify | `src/app/api/requests/[id]/route.ts` | sendRequestUpdatedEmail 호출 추가 |
| Modify | `src/app/api/payment-schedule/route.ts` | sendSettlementRequestEmail 호출 추가 |
| Modify | `src/app/api/payment-schedule/approve/route.ts` | sendSettlementApprovedEmail 호출 추가 |
| Modify | `src/app/api/quotes/finalize/route.ts` | sendFinalizedEmail 수신자를 여행사로 변경 |
| Modify | `src/app/api/requests/[id]/refund/route.ts` | sendCancellationEmail 호출 추가 |

---

### Task 1: Email Constants

**Files:**
- Create: `src/lib/email/constants.ts`

- [ ] **Step 1: Create constants file**

```typescript
// src/lib/email/constants.ts
export const EMAIL_FROM = 'noreply@mylandpick.com'
export const LOGO_URL =
  'https://depqyjvkjpdnwtxxlkcl.supabase.co/storage/v1/object/public/assets/logos/myrealtrip-logo.png'
export const UNREAD_THRESHOLD_MINUTES = 5
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/constants.ts
git commit -m "feat: add email constants (FROM, LOGO_URL, threshold)"
```

---

### Task 2: Email Template

**Files:**
- Create: `src/lib/email/template.ts`

- [ ] **Step 1: Create template wrapper function**

```typescript
// src/lib/email/template.ts
import { LOGO_URL } from './constants'

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export { esc }

export function emailLayout(body: string): string {
  return `
<div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <table style="border-bottom:1px solid #e5e7eb;padding-bottom:24px;margin-bottom:24px;" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;font-size:18px;font-weight:bold;color:#111;line-height:1;">마이랜드픽</td>
    <td style="vertical-align:middle;color:#9ca3af;font-size:12px;padding:0 6px;line-height:1;">by</td>
    <td style="vertical-align:middle;line-height:1;"><img src="${LOGO_URL}" alt="Myrealtrip" style="display:block;height:16px;width:auto;" /></td>
  </tr></table>
  ${body}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
    본 메일은 마이랜드픽에서 자동 발송된 메일입니다.
  </div>
</div>`
}

export function ctaButton(href: string, label: string): string {
  return `<div style="margin:24px 0;">
  <a href="${esc(href)}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">${esc(label)}</a>
</div>`
}

export function field(label: string, value: string): string {
  return `<p style="color:#374151;line-height:1.6;"><strong>${esc(label)}:</strong> ${esc(value)}</p>`
}

export function heading(text: string): string {
  return `<h2 style="font-size:18px;color:#111;margin:0 0 16px;">${esc(text)}</h2>`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/template.ts
git commit -m "feat: add shared email template layout with helpers"
```

---

### Task 3: Rewrite Notifications (10 email functions)

**Files:**
- Rewrite: `src/lib/email/notifications.ts`

- [ ] **Step 1: Rewrite notifications.ts with all 10 functions**

```typescript
// src/lib/email/notifications.ts
import { Resend } from 'resend'
import { EMAIL_FROM } from './constants'
import { emailLayout, heading, field, ctaButton, esc } from './template'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

// 1. 가입 승인 완료
export async function sendApprovalEmail(params: {
  to: string
  company_name: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: '[마이랜드픽] 가입이 승인되었습니다',
      html: emailLayout(
        heading('가입이 승인되었습니다') +
        `<p style="color:#374151;line-height:1.6;">${esc(params.company_name)}님의 마이랜드픽 가입이 승인되었습니다. 지금 로그인하여 서비스를 이용해보세요.</p>` +
        ctaButton(`${APP_URL}/login`, '로그인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 2. 새 견적 요청 접수 (랜드사)
export async function sendNewRequestEmail(params: {
  to: string[]
  event_name: string
  destination: string
  deadline: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[견적요청] ${params.event_name}`,
      html: emailLayout(
        heading('새 견적 요청이 접수되었습니다') +
        field('행사명', params.event_name) +
        field('목적지', params.destination) +
        field('마감일', params.deadline) +
        ctaButton(`${APP_URL}/landco/requests/${params.request_id}`, '견적서 작성하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 3. 새 견적 수신 (여행사)
export async function sendQuoteSubmittedEmail(params: {
  to: string
  event_name: string
  landco_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[견적도착] ${params.event_name} — ${params.landco_name}`,
      html: emailLayout(
        heading('새 견적서가 도착했습니다') +
        field('행사명', params.event_name) +
        field('랜드사', params.landco_name) +
        ctaButton(`${APP_URL}/agency/requests/${params.request_id}`, '견적서 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 4. 견적 요청 수정 알림 (랜드사)
export async function sendRequestUpdatedEmail(params: {
  to: string[]
  event_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[수정알림] ${params.event_name} 견적 요청이 수정되었습니다`,
      html: emailLayout(
        heading('견적 요청이 수정되었습니다') +
        field('행사명', params.event_name) +
        `<p style="color:#374151;line-height:1.6;">견적 요청 내용이 수정되었습니다. 변경된 내용을 확인해주세요.</p>` +
        ctaButton(`${APP_URL}/landco/requests/${params.request_id}`, '수정된 요청 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 5. 미확인 메시지 알림 (Cron 전용)
export async function sendUnreadMessageEmail(params: {
  to: string
  sender_name: string
  event_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[채팅] ${params.event_name} — 읽지 않은 메시지가 있습니다`,
      html: emailLayout(
        heading('읽지 않은 메시지가 있습니다') +
        field('보낸 사람', params.sender_name) +
        field('행사명', params.event_name) +
        `<p style="color:#374151;line-height:1.6;">확인하지 않은 메시지가 있습니다. 플랫폼에서 확인해주세요.</p>` +
        ctaButton(`${APP_URL}`, '채팅 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 6. 견적 최종 선택 (랜드사)
export async function sendQuoteSelectedEmail(params: {
  to: string
  company_name: string
  event_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[선택됨] ${params.event_name} 견적이 선택되었습니다`,
      html: emailLayout(
        heading('축하합니다! 귀사의 견적이 선택되었습니다') +
        field('행사명', params.event_name) +
        ctaButton(`${APP_URL}/landco/requests/${params.request_id}`, '견적 협업 진행하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 7. 정산 승인 요청 (랜드사)
export async function sendSettlementRequestEmail(params: {
  to: string
  event_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[정산] ${params.event_name} 정산 승인 요청`,
      html: emailLayout(
        heading('정산 승인 요청이 접수되었습니다') +
        field('행사명', params.event_name) +
        `<p style="color:#374151;line-height:1.6;">여행 후 정산 플랜이 요청되었습니다. 내용을 확인하고 승인해주세요.</p>` +
        ctaButton(`${APP_URL}/landco/requests/${params.request_id}`, '정산 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 8. 정산 승인 완료 (여행사)
export async function sendSettlementApprovedEmail(params: {
  to: string
  event_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[정산] ${params.event_name} 정산이 승인되었습니다`,
      html: emailLayout(
        heading('정산이 승인되었습니다') +
        field('행사명', params.event_name) +
        `<p style="color:#374151;line-height:1.6;">랜드사가 여행 후 정산을 승인했습니다. 결제 일정이 확정되었습니다.</p>` +
        ctaButton(`${APP_URL}/agency/requests/${params.request_id}`, '정산 내역 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 9. 여행 최종 확정 (여행사) — 랜드사가 결제확인 완료 시
export async function sendFinalizedEmail(params: {
  to: string
  event_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[최종확정] ${params.event_name} 여행이 확정되었습니다`,
      html: emailLayout(
        heading('여행이 최종 확정되었습니다') +
        field('행사명', params.event_name) +
        `<p style="color:#374151;line-height:1.6;">랜드사가 결제를 확인하고 여행을 최종 확정했습니다.</p>` +
        ctaButton(`${APP_URL}/agency/requests/${params.request_id}`, '상세 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 10. 행사 취소/환불 요청 (랜드사)
export async function sendCancellationEmail(params: {
  to: string
  event_name: string
  request_id: string
  refund_rate: number
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[취소] ${params.event_name} 행사 취소 및 환불이 요청되었습니다`,
      html: emailLayout(
        heading('행사 취소 및 환불이 요청되었습니다') +
        field('행사명', params.event_name) +
        field('환불 비율', `${params.refund_rate}%`) +
        `<p style="color:#374151;line-height:1.6;">여행사로부터 행사 취소 및 환불이 요청되었습니다. 내용을 확인해주세요.</p>` +
        ctaButton(`${APP_URL}/landco/requests/${params.request_id}`, '취소 내역 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /Users/youngjun-hwang/Desktop/Claude/my-land-pick/.worktrees/feature/incentive-quote-mvp && npx next build 2>&1 | tail -20`

Expected: Build succeeds (기존 import 참조가 깨질 수 있으므로 Task 4~10에서 수정)

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/notifications.ts
git commit -m "feat: rewrite email notifications with 10 functions + brand template"
```

---

### Task 4: DB Migration — chat_rooms email_sent_at columns

**Files:**
- Create: `supabase/migrations/20260510000000_chat_email_sent_at.sql`

- [ ] **Step 1: Create migration file**

```sql
-- chat_rooms에 이메일 발송 추적 컬럼 추가
ALTER TABLE chat_rooms ADD COLUMN agency_email_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE chat_rooms ADD COLUMN landco_email_sent_at TIMESTAMPTZ DEFAULT NULL;
```

- [ ] **Step 2: Apply migration**

Run: `cd /Users/youngjun-hwang/Desktop/Claude/my-land-pick/.worktrees/feature/incentive-quote-mvp && npx supabase db push --linked`

Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260510000000_chat_email_sent_at.sql
git commit -m "feat: add email_sent_at columns to chat_rooms"
```

---

### Task 5: Cron Route — Unread Messages

**Files:**
- Create: `src/app/api/cron/unread-messages/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create the cron API route**

```typescript
// src/app/api/cron/unread-messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendUnreadMessageEmail } from '@/lib/email/notifications'
import { UNREAD_THRESHOLD_MINUTES } from '@/lib/email/constants'

export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const thresholdDate = new Date(Date.now() - UNREAD_THRESHOLD_MINUTES * 60 * 1000).toISOString()

  // 모든 채팅방 조회 (email_sent_at이 NULL인 것만)
  const { data: rooms } = await admin
    .from('chat_rooms')
    .select('id, request_id, agency_id, landco_id, agency_last_read_at, landco_last_read_at, agency_email_sent_at, landco_email_sent_at')

  if (!rooms || rooms.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sentCount = 0

  for (const room of rooms) {
    // 여행사 측 미확인 체크: landco가 보낸 메시지 중 여행사가 안읽은 것
    if (!room.agency_email_sent_at) {
      const { data: unreadForAgency } = await admin
        .from('messages')
        .select('id, created_at, sender:profiles!messages_sender_id_fkey(company_name)')
        .eq('room_id', room.id)
        .eq('sender_id', room.landco_id)
        .lt('created_at', thresholdDate)
        .order('created_at', { ascending: true })
        .limit(1)

      if (unreadForAgency && unreadForAgency.length > 0) {
        const msg = unreadForAgency[0]
        // 여행사의 마지막 읽음 시각 이후의 메시지인지 확인
        if (!room.agency_last_read_at || msg.created_at > room.agency_last_read_at) {
          const { data: agency } = await admin
            .from('profiles').select('email').eq('id', room.agency_id).single()
          const { data: qr } = await admin
            .from('quote_requests').select('event_name').eq('id', room.request_id).single()

          if (agency?.email) {
            const senderProfile = msg.sender as { company_name: string } | null
            await sendUnreadMessageEmail({
              to: agency.email,
              sender_name: senderProfile?.company_name ?? '',
              event_name: qr?.event_name ?? '',
              request_id: room.request_id,
            })
            await admin.from('chat_rooms')
              .update({ agency_email_sent_at: new Date().toISOString() })
              .eq('id', room.id)
            sentCount++
          }
        }
      }
    }

    // 랜드사 측 미확인 체크: agency가 보낸 메시지 중 랜드사가 안읽은 것
    if (!room.landco_email_sent_at) {
      const { data: unreadForLandco } = await admin
        .from('messages')
        .select('id, created_at, sender:profiles!messages_sender_id_fkey(company_name)')
        .eq('room_id', room.id)
        .eq('sender_id', room.agency_id)
        .lt('created_at', thresholdDate)
        .order('created_at', { ascending: true })
        .limit(1)

      if (unreadForLandco && unreadForLandco.length > 0) {
        const msg = unreadForLandco[0]
        if (!room.landco_last_read_at || msg.created_at > room.landco_last_read_at) {
          const { data: landco } = await admin
            .from('profiles').select('email').eq('id', room.landco_id).single()
          const { data: qr } = await admin
            .from('quote_requests').select('event_name').eq('id', room.request_id).single()

          if (landco?.email) {
            const senderProfile = msg.sender as { company_name: string } | null
            await sendUnreadMessageEmail({
              to: landco.email,
              sender_name: senderProfile?.company_name ?? '',
              event_name: qr?.event_name ?? '',
              request_id: room.request_id,
            })
            await admin.from('chat_rooms')
              .update({ landco_email_sent_at: new Date().toISOString() })
              .eq('id', room.id)
            sentCount++
          }
        }
      }
    }
  }

  return NextResponse.json({ sent: sentCount })
}
```

- [ ] **Step 2: Create vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cron/unread-messages",
      "schedule": "* * * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/unread-messages/route.ts vercel.json
git commit -m "feat: add cron route for unread message email notifications"
```

---

### Task 6: Modify admin/approve — sendApprovalEmail

**Files:**
- Modify: `src/app/api/admin/approve/route.ts`

- [ ] **Step 1: Add email import and call**

At the top of the file, add import:
```typescript
import { sendApprovalEmail } from '@/lib/email/notifications'
```

After the `admin_action_logs` insert block (after `if (logError)` line), before `return`, add:
```typescript
  // 승인 시 이메일 알림
  if (status === 'approved') {
    const { data: profile } = await serviceClient
      .from('profiles').select('email, company_name').eq('id', userId).single()
    if (profile?.email) {
      await sendApprovalEmail({ to: profile.email, company_name: profile.company_name ?? '' })
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/approve/route.ts
git commit -m "feat: send approval email when admin approves user"
```

---

### Task 7: Modify chat messages — Remove instant email

**Files:**
- Modify: `src/app/api/chat/rooms/[roomId]/messages/route.ts`

- [ ] **Step 1: Remove sendChatMessageEmail import**

Delete this line at the top:
```typescript
import { sendChatMessageEmail } from '@/lib/email/notifications'
```

- [ ] **Step 2: Remove email sending block in POST handler**

Delete the entire block after `return NextResponse.json({ message }, { status: 201 })` would be — specifically, remove these lines (the email sending block before the return):

```typescript
  // 상대방에게 이메일 알림
  const recipientId = room.agency_id === user.id ? room.landco_id : room.agency_id
  const { data: sender } = await supabase
    .from('profiles').select('company_name').eq('id', user.id).single()
  const { data: recipient } = await supabase
    .from('profiles').select('email').eq('id', recipientId).single()

  if (recipient?.email) {
    await sendChatMessageEmail({
      to: recipient.email,
      sender_name: sender?.company_name ?? '',
      event_name: (room.request as { event_name: string })?.event_name ?? '',
      request_id: room.request_id,
    })
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/rooms/[roomId]/messages/route.ts
git commit -m "feat: remove instant chat email — replaced by cron unread check"
```

---

### Task 8: Modify chat read — Reset email_sent_at

**Files:**
- Modify: `src/app/api/chat/rooms/[roomId]/read/route.ts`

- [ ] **Step 1: Add email_sent_at reset**

Change the update block from:
```typescript
  const col = room.agency_id === user.id ? 'agency_last_read_at' : 'landco_last_read_at'
  const { error } = await admin
    .from('chat_rooms')
    .update({ [col]: new Date().toISOString() })
    .eq('id', roomId)
```

To:
```typescript
  const isAgency = room.agency_id === user.id
  const readCol = isAgency ? 'agency_last_read_at' : 'landco_last_read_at'
  const emailCol = isAgency ? 'agency_email_sent_at' : 'landco_email_sent_at'
  const { error } = await admin
    .from('chat_rooms')
    .update({ [readCol]: new Date().toISOString(), [emailCol]: null })
    .eq('id', roomId)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/chat/rooms/[roomId]/read/route.ts
git commit -m "feat: reset email_sent_at on chat read for cron cycle"
```

---

### Task 9: Modify requests/[id] PATCH — sendRequestUpdatedEmail

**Files:**
- Modify: `src/app/api/requests/[id]/route.ts`

- [ ] **Step 1: Add import at top of file**

```typescript
import { sendRequestUpdatedEmail } from '@/lib/email/notifications'
```

- [ ] **Step 2: Add email sending after notification insert**

After the existing `await admin.from('notifications').insert(notifications)` block, add:

```typescript
    // 매칭된 랜드사들에게 수정 이메일 발송
    const landcoEmails = await Promise.all(
      matchingLandcos.map(async l => {
        const { data } = await admin.from('profiles').select('email').eq('id', l.id).single()
        return data?.email
      })
    )
    const validEmails = landcoEmails.filter((e): e is string => !!e)
    if (validEmails.length > 0) {
      await sendRequestUpdatedEmail({
        to: validEmails,
        event_name: body.event_name,
        request_id: id,
      })
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/requests/[id]/route.ts
git commit -m "feat: send email to landcos when quote request is updated"
```

---

### Task 10: Modify payment-schedule PUT — sendSettlementRequestEmail

**Files:**
- Modify: `src/app/api/payment-schedule/route.ts`

- [ ] **Step 1: Add import at top of file**

```typescript
import { sendSettlementRequestEmail } from '@/lib/email/notifications'
```

- [ ] **Step 2: Add email sending inside the post_travel block**

Inside the `if (targetType === 'post_travel')` block, after the notification insert (`await putAdmin.from('notifications').insert(...)` on line ~124), add:

```typescript
      // 랜드사에 정산 승인 요청 이메일
      const { data: landcoProfile } = await putAdmin
        .from('profiles').select('email').eq('id', selection.landco_id).single()
      if (landcoProfile?.email) {
        await sendSettlementRequestEmail({
          to: landcoProfile.email,
          event_name: qr?.event_name ?? '',
          request_id: requestId,
        })
      }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/payment-schedule/route.ts
git commit -m "feat: send settlement request email to landco on post_travel"
```

---

### Task 11: Modify payment-schedule/approve — sendSettlementApprovedEmail

**Files:**
- Modify: `src/app/api/payment-schedule/approve/route.ts`

- [ ] **Step 1: Add import at top of file**

```typescript
import { sendSettlementApprovedEmail } from '@/lib/email/notifications'
```

- [ ] **Step 2: Add email sending after notification insert**

After the existing `await admin.from('notifications').insert(...)` block (around line ~60), add:

```typescript
    // 승인 시 여행사에게 이메일 발송
    if (action === 'approve' && agencyId) {
      const { data: agencyProfile } = await admin
        .from('profiles').select('email').eq('id', agencyId).single()
      const { data: qr } = await admin
        .from('quote_requests').select('event_name').eq('id', schedule.request_id).single()
      if (agencyProfile?.email) {
        await sendSettlementApprovedEmail({
          to: agencyProfile.email,
          event_name: qr?.event_name ?? '',
          request_id: schedule.request_id,
        })
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/payment-schedule/approve/route.ts
git commit -m "feat: send settlement approved email to agency"
```

---

### Task 12: Modify quotes/finalize — Change recipient to agency

**Files:**
- Modify: `src/app/api/quotes/finalize/route.ts`

- [ ] **Step 1: Change sendFinalizedEmail import and call**

The import stays the same. Change the email sending block at the bottom from:

```typescript
  // 랜드사 이메일 알림
  const { data: landco } = await supabase
    .from('profiles').select('email, company_name').eq('id', selection.landco_id).single()
  if (landco) {
    await sendFinalizedEmail({
      to: landco.email,
      company_name: landco.company_name,
      event_name: qr?.event_name ?? '',
    })
  }
```

To:

```typescript
  // 여행사에게 최종 확정 이메일 알림
  const { data: agency } = await supabase
    .from('profiles').select('email').eq('id', user.id).single()
  if (agency?.email) {
    await sendFinalizedEmail({
      to: agency.email,
      event_name: qr?.event_name ?? '',
      request_id: requestId,
    })
  }
```

Note: `sendFinalizedEmail`의 시그니처가 Task 3에서 `{ to, event_name, request_id }`로 변경되었으므로 이에 맞춤.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/quotes/finalize/route.ts
git commit -m "feat: send finalized email to agency instead of landco"
```

---

### Task 13: Modify refund route — sendCancellationEmail

**Files:**
- Modify: `src/app/api/requests/[id]/refund/route.ts`

- [ ] **Step 1: Add import at top of file**

```typescript
import { sendCancellationEmail } from '@/lib/email/notifications'
```

- [ ] **Step 2: Add email sending after landco notification insert**

Inside the `if (sel)` block, after `await admin.from('notifications').insert(...)` for the landco, add:

```typescript
    // 랜드사에게 취소 이메일 발송
    const { data: landcoProfile } = await admin
      .from('profiles').select('email').eq('id', sel.landco_id).single()
    if (landcoProfile?.email) {
      await sendCancellationEmail({
        to: landcoProfile.email,
        event_name: qr.event_name,
        request_id: id,
        refund_rate: refundRate,
      })
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/requests/[id]/refund/route.ts
git commit -m "feat: send cancellation email to landco on refund request"
```

---

### Task 14: Final Build Verification

- [ ] **Step 1: Run build to verify everything compiles**

Run: `cd /Users/youngjun-hwang/Desktop/Claude/my-land-pick/.worktrees/feature/incentive-quote-mvp && npx next build 2>&1 | tail -30`

Expected: Build succeeds with no errors

- [ ] **Step 2: Fix any build errors if present**

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build errors from email service redesign"
```
