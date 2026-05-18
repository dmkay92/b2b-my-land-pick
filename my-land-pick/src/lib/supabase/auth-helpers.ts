import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// Returns { user, error } — error is a NextResponse if unauthorized
export async function getAuthorizedLandco(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, error: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()
  if (profile?.role !== 'landco' || profile?.status !== 'approved') {
    return { user: null, error: NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 }) }
  }

  return { user, error: null }
}
