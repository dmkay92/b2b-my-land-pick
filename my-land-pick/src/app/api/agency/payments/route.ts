import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'agency') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const statusFilter = request.nextUrl.searchParams.get('status')

  // Get agency's quote_requests
  const { data: requests } = await admin
    .from('quote_requests').select('id').eq('agency_id', user.id)
  const requestIds = (requests ?? []).map(r => r.id)
  if (requestIds.length === 0) return NextResponse.json({ installments: [] })

  const { data: schedules } = await admin
    .from('payment_schedules').select('id, request_id').in('request_id', requestIds)
  const scheduleIds = (schedules ?? []).map(s => s.id)
  if (scheduleIds.length === 0) return NextResponse.json({ installments: [] })

  let query = admin
    .from('payment_installments')
    .select(`
      *,
      payment_schedules!inner (
        request_id,
        total_amount,
        template_type,
        quote_requests!inner (
          display_id,
          event_name
        )
      )
    `)
    .in('schedule_id', scheduleIds)
    .order('display_id', { ascending: true })

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'pending') {
      query = query.in('status', ['pending', 'overdue', 'verifying'])
    } else {
      query = query.eq('status', statusFilter)
    }
  }

  const { data, error } = await query.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ installments: data ?? [] })
}
