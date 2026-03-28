import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: admin } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { landcoId, countryCodes } = await request.json()

  if (!Array.isArray(countryCodes)) {
    return NextResponse.json({ error: 'Invalid countryCodes' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  const { data: current } = await serviceClient
    .from('profiles').select('country_codes').eq('id', landcoId).single()

  const { error } = await serviceClient
    .from('profiles').update({ country_codes: countryCodes }).eq('id', landcoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('admin_action_logs').insert({
    target_user_id: landcoId,
    action_type: 'country_change',
    detail: { from: current?.country_codes ?? [], to: countryCodes },
  })

  return NextResponse.json({ success: true })
}
