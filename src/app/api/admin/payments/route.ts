import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — 결제 회차 목록 (pending/overdue 우선, 전체도 볼 수 있게)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const statusFilter = request.nextUrl.searchParams.get('status') // 'pending' | 'paid' | 'all'

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
          event_name,
          agency_id,
          profiles!quote_requests_agency_id_fkey ( company_name )
        )
      )
    `)
    .order('due_date', { ascending: true })

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'pending') {
      query = query.in('status', ['pending', 'overdue'])
    } else {
      query = query.eq('status', statusFilter)
    }
  }

  const { data, error } = await query.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ installments: data ?? [] })
}

// PATCH — installment 상태 변경 (paid 처리)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { installmentId, action } = await request.json() as { installmentId: string; action: 'paid' | 'pending' }
  if (!installmentId || !['paid', 'pending'].includes(action)) {
    return NextResponse.json({ error: 'installmentId와 action(paid/pending)이 필요합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: inst } = await admin.from('payment_installments').select('amount, status').eq('id', installmentId).single()
  if (!inst) return NextResponse.json({ error: '결제 회차를 찾을 수 없습니다.' }, { status: 404 })

  if (action === 'paid') {
    await admin.from('payment_installments').update({
      status: 'paid',
      paid_amount: inst.amount,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', installmentId)
  } else {
    await admin.from('payment_installments').update({
      status: 'pending',
      paid_amount: 0,
      paid_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', installmentId)
  }

  return NextResponse.json({ success: true })
}
