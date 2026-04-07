import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: admin } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, status } = await request.json()

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // @supabase/supabase-js 직접 사용 — RLS 완전 우회 보장
  const serviceClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: current } = await serviceClient
    .from('profiles').select('status, approved_at').eq('id', userId).single()

  // 한 번 승인된 사용자는 approved_at 유지, status만 변경
  const updateData = status === 'approved'
    ? { status, approved_at: current?.approved_at ?? new Date().toISOString() }
    : { status }

  const { error } = await serviceClient
    .from('profiles').update(updateData).eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: logError } = await serviceClient.from('admin_action_logs').insert({
    target_user_id: userId,
    action_type: 'status_change',
    detail: { from: current?.status ?? null, to: status },
  })
  if (logError) console.error('action log insert error:', logError.message)

  return NextResponse.json({ success: true })
}
