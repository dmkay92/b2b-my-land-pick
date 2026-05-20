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

// 10. 계좌이체 입금 알림 (관리자)
export async function sendTransferNotifyEmail(params: {
  to: string
  event_name: string
  agency_name: string
  label: string
  amount: number
  request_id: string
}) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: `[입금알림] ${params.event_name} — ${params.agency_name} ${params.label} 입금 확인 요청`,
      html: emailLayout(
        heading('입금 확인이 필요합니다') +
        field('행사명', params.event_name) +
        field('여행사', params.agency_name) +
        field('항목', params.label) +
        field('금액', `${params.amount.toLocaleString('ko-KR')}원`) +
        `<p style="color:#374151;line-height:1.6;">여행사에서 계좌이체 입금 완료를 알렸습니다. 입금 내역을 확인해주세요.</p>` +
        ctaButton(`${APP_URL}/admin`, '관리자 페이지에서 확인하기')
      ),
    })
  } catch { /* 이메일 실패는 무시 */ }
}

// 11. 행사 취소/환불 요청 (랜드사)
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
