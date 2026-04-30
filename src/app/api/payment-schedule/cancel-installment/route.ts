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

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { installmentId } = await request.json() as { installmentId: string }
  if (!installmentId) return NextResponse.json({ error: 'installmentId required' }, { status: 400 })

  const admin = getAdmin()

  // installment 조회
  const { data: inst } = await admin
    .from('payment_installments').select('*, payment_schedules!inner(request_id, total_amount)')
    .eq('id', installmentId).single()

  if (!inst) return NextResponse.json({ error: '결제 회차를 찾을 수 없습니다.' }, { status: 404 })

  // 추가 정산 회차만 취소 가능 (rate === 0)
  if (inst.rate !== 0) {
    return NextResponse.json({ error: '기본 결제 회차는 취소할 수 없습니다.' }, { status: 400 })
  }

  // 이미 결제된 건은 취소 불가
  if (inst.paid_amount > 0 || inst.status === 'paid') {
    return NextResponse.json({ error: '이미 결제된 회차는 취소할 수 없습니다.' }, { status: 400 })
  }

  // 권한 확인: 선택된 랜드사만 취소 가능
  const schedule = inst.payment_schedules as { request_id: string; total_amount: number }
  const { data: sel } = await admin
    .from('quote_selections').select('landco_id').eq('request_id', schedule.request_id).single()

  if (!sel || sel.landco_id !== user.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  // installment 취소 처리
  await admin.from('payment_installments').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', installmentId)

  return NextResponse.json({ success: true })
}
