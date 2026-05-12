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

// POST — 결제완료 installment → settlement_ledger 벌크 생성
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { installmentIds } = await request.json() as { installmentIds: string[] }
  if (!installmentIds || installmentIds.length === 0) {
    return NextResponse.json({ error: 'installmentIds가 필요합니다.' }, { status: 400 })
  }

  const admin = getAdmin()

  // 1. 선택된 installments 조회 (status='paid', settlement_status IS NULL 조건)
  const { data: installments, error: instError } = await admin
    .from('payment_installments')
    .select('id, schedule_id, request_id, label, rate, paid_amount, amount')
    .in('id', installmentIds)
    .eq('status', 'paid')
    .is('settlement_status', null)

  if (instError) return NextResponse.json({ error: instError.message }, { status: 500 })
  if (!installments || installments.length === 0) {
    return NextResponse.json({ error: '처리할 수 있는 installment가 없습니다.' }, { status: 400 })
  }

  // 2. request_id 없는 installment에 대해 payment_schedules에서 백필
  const needsBackfill = installments.filter(i => !i.request_id)
  if (needsBackfill.length > 0) {
    const scheduleIds = [...new Set(needsBackfill.map(i => i.schedule_id).filter(Boolean))]
    if (scheduleIds.length > 0) {
      const { data: schedules } = await admin
        .from('payment_schedules')
        .select('id, request_id')
        .in('id', scheduleIds)

      if (schedules && schedules.length > 0) {
        const scheduleMap = Object.fromEntries(schedules.map(s => [s.id, s.request_id]))

        await Promise.all(
          needsBackfill.map(async (inst) => {
            const reqId = scheduleMap[inst.schedule_id]
            if (reqId) {
              await admin
                .from('payment_installments')
                .update({ request_id: reqId })
                .eq('id', inst.id)
              inst.request_id = reqId
            }
          })
        )
      }
    }
  }

  // 3. request_id별 quote_settlements 조회
  const requestIds = [...new Set(installments.map(i => i.request_id).filter(Boolean))]
  const { data: settlements, error: settlError } = await admin
    .from('quote_settlements')
    .select('request_id, platform_fee, agency_commission, gmv')
    .in('request_id', requestIds)

  if (settlError) return NextResponse.json({ error: settlError.message }, { status: 500 })

  const settlementMap = Object.fromEntries(
    (settlements ?? []).map(s => [s.request_id, s])
  )

  // 4. settlement_ledger row 생성
  const now = new Date().toISOString()
  const ledgerRows = installments
    .filter(i => i.request_id)
    .map(inst => {
      const settlement = settlementMap[inst.request_id]
      const paidAmt = inst.paid_amount ?? inst.amount ?? 0
      const rate = inst.rate ?? 0

      let platformFee = 0
      let agencyFee = 0
      let landcoPayoutAmount = paidAmt

      if (rate > 0 && settlement && settlement.gmv > 0) {
        platformFee = Math.round(paidAmt * (settlement.platform_fee / settlement.gmv))
        agencyFee = Math.round(paidAmt * (settlement.agency_commission / settlement.gmv))
        landcoPayoutAmount = paidAmt - platformFee - agencyFee
      }
      // rate = 0 (추가정산/공제): 모두 0, landco_payout_amount = paid_amount

      return {
        request_id: inst.request_id,
        installment_id: inst.id,
        installment_label: inst.label ?? '',
        installment_rate: rate,
        paid_amount: paidAmt,
        platform_fee: platformFee,
        agency_fee: agencyFee,
        landco_payout_amount: landcoPayoutAmount,
        landco_payout_status: 'reviewing',
        agency_payout_status: 'accrued',
        created_by: user.id,
        created_at: now,
      }
    })

  if (ledgerRows.length === 0) {
    return NextResponse.json({ error: 'request_id를 확인할 수 없어 처리할 건이 없습니다.' }, { status: 400 })
  }

  const { error: insertError } = await admin.from('settlement_ledger').insert(ledgerRows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // 5. 원본 installment settlement_status → reviewing
  const processedIds = ledgerRows.map(r => r.installment_id)
  const { error: updateError } = await admin
    .from('payment_installments')
    .update({ settlement_status: 'reviewing' })
    .in('id', processedIds)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, created: ledgerRows.length })
}
