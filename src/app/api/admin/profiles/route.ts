import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: admin } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, email } = await request.json()
  if (!userId || !email) return NextResponse.json({ error: 'userId, email required' }, { status: 400 })

  const serviceClient = await createServiceClient()

  const { data: current } = await serviceClient
    .from('profiles').select('email').eq('id', userId).single()

  const { error } = await serviceClient
    .from('profiles').update({ email }).eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('admin_action_logs').insert({
    target_user_id: userId,
    action_type: 'email_change',
    detail: { from: current?.email ?? null, to: email },
  })

  return NextResponse.json({ success: true })
}
