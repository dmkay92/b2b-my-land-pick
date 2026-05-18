import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptPiiList } from '@/lib/privacy'

/**
 * POST /api/admin/decrypt-profiles
 * 암호화된 프로필 데이터를 복호화하여 반환
 * Admin 전용 — 클라이언트에서 KMS 복호화 불가하므로 서버 경유
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { profiles } = await request.json() as { profiles: Record<string, unknown>[] }
  if (!profiles || !Array.isArray(profiles)) {
    return NextResponse.json({ error: 'profiles array required' }, { status: 400 })
  }

  const decrypted = await decryptPiiList(profiles)
  return NextResponse.json({ profiles: decrypted })
}
