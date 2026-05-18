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

// GET — 정산 원장 목록 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdmin()
  const tab = request.nextUrl.searchParams.get('tab') ?? 'reviewing'

  // 탭별 필터 구성
  type LedgerQuery = ReturnType<typeof admin.from> extends { select: (...args: unknown[]) => infer Q } ? Q : never
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin.from('settlement_ledger').select('*').order('created_at', { ascending: false })

  if (tab === 'reviewing') {
    query = query.eq('landco_payout_status', 'reviewing')
  } else if (tab === 'confirmed') {
    query = query.eq('landco_payout_status', 'confirmed')
  } else if (tab === 'landco_paid') {
    query = query.eq('landco_payout_status', 'paid')
  } else if (tab === 'agency_payable') {
    query = query.in('agency_payout_status', ['accrued', 'payable'])
  } else if (tab === 'agency_paid') {
    query = query.eq('agency_payout_status', 'paid')
  }
  // tab === 'all': 필터 없음

  const { data: rawLedger, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!rawLedger || rawLedger.length === 0) {
    return NextResponse.json({ ledger: [] })
  }

  // 연관 데이터 조회
  const requestIds = [...new Set((rawLedger as { request_id: string }[]).map(r => r.request_id))]
  const installmentIds = [...new Set((rawLedger as { installment_id: string }[]).map(r => r.installment_id))]

  // quote_requests + quote_settlements 조회
  const [
    { data: requests },
    { data: settlements },
    { data: installments },
  ] = await Promise.all([
    admin
      .from('quote_requests')
      .select('id, display_id, event_name, depart_date, return_date, created_at, agency_id')
      .in('id', requestIds),
    admin
      .from('quote_settlements')
      .select('request_id, landco_id, agency_id')
      .in('request_id', requestIds),
    admin
      .from('payment_installments')
      .select('id, display_id')
      .in('id', installmentIds),
  ])

  // 프로필 ID 수집 (agency_id, landco_id)
  const profileIds: string[] = []
  for (const s of settlements ?? []) {
    if (s.landco_id) profileIds.push(s.landco_id)
    if (s.agency_id) profileIds.push(s.agency_id)
  }
  const uniqueProfileIds = [...new Set(profileIds)]

  const { data: profiles } = uniqueProfileIds.length > 0
    ? await admin.from('profiles').select('id, company_name').in('id', uniqueProfileIds)
    : { data: [] }

  // 맵 구성
  const requestMap = Object.fromEntries((requests ?? []).map(r => [r.id, r]))
  const settlementMap = Object.fromEntries((settlements ?? []).map(s => [s.request_id, s]))
  const installmentMap = Object.fromEntries((installments ?? []).map(i => [i.id, i]))
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  // 데이터 enrich
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (rawLedger as any[]).map(row => {
    const qr = requestMap[row.request_id]
    const settlement = settlementMap[row.request_id]
    const installment = installmentMap[row.installment_id]
    const landco = settlement?.landco_id ? profileMap[settlement.landco_id] : null
    const agency = settlement?.agency_id ? profileMap[settlement.agency_id] : null

    return {
      ...row,
      request: qr
        ? {
            display_id: qr.display_id,
            event_name: qr.event_name,
            depart_date: qr.depart_date,
            return_date: qr.return_date,
            created_at: qr.created_at,
          }
        : null,
      landco_id: settlement?.landco_id ?? null,
      agency_id: settlement?.agency_id ?? null,
      landco_company_name: landco?.company_name ?? null,
      agency_company_name: agency?.company_name ?? null,
      installment_display_id: installment?.display_id ?? null,
    }
  })

  return NextResponse.json({ ledger: enriched })
}
