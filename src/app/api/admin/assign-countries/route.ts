import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { landcoId, countryCodes } = await request.json()

  if (!Array.isArray(countryCodes)) {
    return NextResponse.json({ error: 'Invalid countryCodes' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: current } = await admin
    .from('profiles').select('country_codes').eq('id', landcoId).single()

  const { error } = await admin
    .from('profiles').update({ country_codes: countryCodes }).eq('id', landcoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('admin_action_logs').insert({
    target_user_id: landcoId,
    action_type: 'country_change',
    detail: { from: current?.country_codes ?? [], to: countryCodes },
  })

  return NextResponse.json({ success: true })
}
