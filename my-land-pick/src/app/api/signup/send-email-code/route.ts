import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!

function makeToken(email: string, code: string, exp: number) {
  const payload = Buffer.from(JSON.stringify({ email, code, exp })).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 })
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const exp = Date.now() + 10 * 60 * 1000
  const token = makeToken(email, code, exp)

  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: '이메일 인증 코드',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <p style="color: #374151; margin-bottom: 16px;">아래 인증 코드를 입력해주세요.</p>
        <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 16px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1d4ed8;">${code}</span>
        </div>
        <p style="color: #9ca3af; font-size: 13px;">10분 내에 입력해주세요. 본인이 요청하지 않은 경우 이 메일을 무시해주세요.</p>
      </div>
    `,
  })

  if (error) {
    console.error('Resend error:', JSON.stringify(error))
    return NextResponse.json({ error: '이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  return NextResponse.json({ token })
}
