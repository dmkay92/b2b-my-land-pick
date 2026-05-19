import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json([], { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json([], { status: 403 })

  const { data } = await supabase
    .from('terms_consents')
    .select('terms_type, terms_version, agreed_at, ip_address')
    .eq('user_id', userId)
    .order('agreed_at', { ascending: true })

  return NextResponse.json(data ?? [])
}
