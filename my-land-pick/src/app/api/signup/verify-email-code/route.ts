import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  const { token, code } = await req.json()
  if (!token || !code) {
    return NextResponse.json({ valid: false, error: '인증 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  const dotIdx = token.lastIndexOf('.')
  if (dotIdx === -1) {
    return NextResponse.json({ valid: false, error: '인증 정보가 올바르지 않습니다.' })
  }
  const payload = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)

  const expectedSig = createHmac('sha256', SECRET).update(payload).digest('hex')
  if (sig !== expectedSig) {
    return NextResponse.json({ valid: false, error: '인증 정보가 올바르지 않습니다.' })
  }

  let data: { email: string; code: string; exp: number }
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return NextResponse.json({ valid: false, error: '인증 정보가 올바르지 않습니다.' })
  }

  if (Date.now() > data.exp) {
    return NextResponse.json({ valid: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' })
  }

  if (data.code !== String(code).trim()) {
    return NextResponse.json({ valid: false, error: '인증 코드가 일치하지 않습니다.' })
  }

  return NextResponse.json({ valid: true })
}
