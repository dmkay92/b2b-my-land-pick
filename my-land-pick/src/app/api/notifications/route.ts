import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// GET /api/notifications - 본인의 알림 조회 (최신 20개)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // request_id → display_id 매핑
  const requestIds = [...new Set(
    (notifications ?? [])
      .map((n: Record<string, unknown>) => (n.payload as Record<string, unknown>)?.request_id)
      .filter(Boolean) as string[]
  )]
  const displayIdMap: Record<string, string> = {}
  if (requestIds.length > 0) {
    const { data: reqs } = await admin
      .from('quote_requests').select('id, display_id').in('id', requestIds)
    reqs?.forEach(r => { if (r.display_id) displayIdMap[r.id] = r.display_id })
  }

  // 액션 가능한 알림의 실제 상태를 enrichment
  const enriched = await Promise.all((notifications ?? []).map(async (n: Record<string, unknown>) => {
    const payload = n.payload as Record<string, unknown>
    const requestId = payload?.request_id as string | undefined
    const enrichedPayload = requestId && displayIdMap[requestId]
      ? { ...payload, display_id: displayIdMap[requestId] }
      : payload

    if (n.type === 'additional_settlement_request' && payload?.settlement_id) {
      const { data } = await admin.from('additional_settlements').select('status').eq('id', payload.settlement_id).maybeSingle()
      return { ...n, payload: enrichedPayload, action_status: data?.status ?? 'pending' }
    }
    if (n.type === 'post_travel_approval_request' && payload?.schedule_id) {
      const { data } = await admin.from('payment_schedules').select('approval_status').eq('id', payload.schedule_id).maybeSingle()
      return { ...n, payload: enrichedPayload, action_status: data?.approval_status ?? 'pending' }
    }
    return { ...n, payload: enrichedPayload }
  }))

  return NextResponse.json({ notifications: enriched })
}

// PATCH /api/notifications - 전체 읽음 처리
export async function PATCH(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)

  return NextResponse.json({ success: true })
}
