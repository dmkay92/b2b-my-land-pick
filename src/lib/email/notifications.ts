import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'noreply@incentivequote.com'

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

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
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `[견적요청] ${params.event_name}`,
      html: `
        <h2>새 견적 요청이 접수되었습니다</h2>
        <p><strong>행사명:</strong> ${esc(params.event_name)}</p>
        <p><strong>목적지:</strong> ${esc(params.destination)}</p>
        <p><strong>마감일:</strong> ${esc(params.deadline)}</p>
        <p><a href="${esc(process.env.NEXT_PUBLIC_APP_URL ?? '')}/landco/requests/${esc(params.request_id)}">견적서 작성하기</a></p>
      `,
    })
  } catch {
    // 이메일 실패는 무시 (메인 플로우에 영향 없도록)
  }
}

export async function sendQuoteSubmittedEmail(params: {
  to: string
  event_name: string
  landco_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `[견적서 도착] ${params.event_name} — ${params.landco_name}`,
      html: `
        <h2>새 견적서가 도착했습니다</h2>
        <p><strong>행사명:</strong> ${esc(params.event_name)}</p>
        <p><strong>랜드사:</strong> ${esc(params.landco_name)}</p>
        <p><a href="${esc(process.env.NEXT_PUBLIC_APP_URL ?? '')}/agency/requests/${esc(params.request_id)}">견적서 확인하기</a></p>
      `,
    })
  } catch {
    // 이메일 실패는 무시
  }
}

export async function sendQuoteSelectedEmail(params: QuoteRequestNotification) {
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `[선택됨] ${params.event_name} 견적서가 선택되었습니다`,
      html: `
        <h2>축하합니다! 귀사의 견적서가 선택되었습니다</h2>
        <p><strong>행사명:</strong> ${esc(params.event_name)}</p>
        <p><a href="${esc(process.env.NEXT_PUBLIC_APP_URL ?? '')}/landco/requests/${esc(params.request_id)}">견적 협업 진행하기</a></p>
      `,
    })
  } catch {
    // 이메일 실패는 무시
  }
}

export async function sendFinalizedEmail(params: {
  to: string
  company_name: string
  event_name: string
}) {
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `[최종확정] ${params.event_name} 견적이 최종 확정되었습니다`,
      html: `
        <h2>견적이 최종 확정되었습니다</h2>
        <p><strong>행사명:</strong> ${esc(params.event_name)}</p>
        <p>여행사가 귀사의 견적을 최종 확정했습니다. 고객과 직접 연락하여 진행해주세요.</p>
      `,
    })
  } catch {
    // 이메일 실패는 무시
  }
}

export async function sendChatMessageEmail(params: {
  to: string
  sender_name: string
  event_name: string
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `[채팅] ${params.event_name} — ${params.sender_name}님이 메시지를 보냈습니다`,
      html: `
        <h2>새 채팅 메시지가 도착했습니다</h2>
        <p><strong>보낸 사람:</strong> ${esc(params.sender_name)}</p>
        <p><strong>행사명:</strong> ${esc(params.event_name)}</p>
        <p><a href="${esc(process.env.NEXT_PUBLIC_APP_URL ?? '')}">플랫폼에서 확인하기</a></p>
      `,
    })
  } catch {
    // 이메일 실패는 무시
  }
}
