import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ notices: [] })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ''

  const { data } = await supabase
    .from('notices')
    .select('id, title, content, target, pinned, created_at')
    .eq('published', true)
    .or(`target.eq.all,target.eq.${role}`)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ notices: data ?? [] })
}
