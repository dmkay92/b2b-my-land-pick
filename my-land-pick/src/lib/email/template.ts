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
