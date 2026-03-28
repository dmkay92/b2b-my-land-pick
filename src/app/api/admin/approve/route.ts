import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: admin } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, status } = await request.json()

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  const { data: current } = await serviceClient
    .from('profiles').select('status').eq('id', userId).single()

  const updateData = status === 'approved'
    ? { status, approved_at: new Date().toISOString() }
    : { status }

  const { error } = await serviceClient
    .from('profiles').update(updateData).eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('admin_action_logs').insert({
    target_user_id: userId,
    action_type: 'status_change',
    detail: { from: current?.status ?? null, to: status },
  })

  return NextResponse.json({ success: true })
}
