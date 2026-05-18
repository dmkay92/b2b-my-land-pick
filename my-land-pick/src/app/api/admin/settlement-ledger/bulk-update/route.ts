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

// PATCH — settlement_ledger 상태 벌크 변경
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids, action } = await request.json() as {
    ids: string[]
    action: 'confirm' | 'landco_paid' | 'agency_paid'
  }

  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
  }
  if (!['confirm', 'landco_paid', 'agency_paid'].includes(action)) {
    return NextResponse.json({ error: '유효하지 않은 action입니다.' }, { status: 400 })
  }

  const admin = getAdmin()
  const now = new Date().toISOString()

  if (action === 'confirm') {
    // 검토중 → 확정
    const { error } = await admin
      .from('settlement_ledger')
      .update({
        landco_payout_status: 'confirmed',
        landco_confirmed_at: now,
      })
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'landco_paid') {
    // 확정 → 랜드사 지급완료 + 원본 installment settlement_status → settled
    const { error: ledgerError } = await admin
      .from('settlement_ledger')
      .update({
        landco_payout_status: 'paid',
        landco_paid_at: now,
      })
      .in('id', ids)

    if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 })

    // 해당 settlement_ledger rows의 installment_id 조회
    const { data: ledgerRows, error: fetchError } = await admin
      .from('settlement_ledger')
      .select('installment_id')
      .in('id', ids)

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

    const installmentIds = (ledgerRows ?? []).map(r => r.installment_id).filter(Boolean)
    if (installmentIds.length > 0) {
      const { error: instError } = await admin
        .from('payment_installments')
        .update({ settlement_status: 'settled' })
        .in('id', installmentIds)

      if (instError) return NextResponse.json({ error: instError.message }, { status: 500 })
    }
  } else if (action === 'agency_paid') {
    // 여행사 지급대기 → 여행사 지급완료
    const { error } = await admin
      .from('settlement_ledger')
      .update({
        agency_payout_status: 'paid',
        agency_paid_at: now,
      })
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: ids.length })
}
