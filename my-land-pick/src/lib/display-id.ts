import { SupabaseClient } from '@supabase/supabase-js'

/**
 * display_id 채번 — DB 시퀀스/함수 없이 앱 레벨에서 생성
 *
 * 날짜 포함 (use_date=true):  PREFIX-YYYYMMDD-000001
 * 날짜 미포함 (use_date=false): PREFIX000001
 *
 * 동시성 안전: 실제 DB에서 해당 prefix의 max display_id를 조회하여 +1
 */

const TABLE_CONFIG: Record<string, { table: string; useDate: boolean }> = {
  A:   { table: 'profiles', useDate: false },
  L:   { table: 'profiles', useDate: false },
  ADM: { table: 'profiles', useDate: false },
  REQ: { table: 'quote_requests', useDate: true },
  QOT: { table: 'quotes', useDate: true },
  STL: { table: 'quote_settlements', useDate: true },
  PSC: { table: 'payment_schedules', useDate: true },
  PIN: { table: 'payment_installments', useDate: true },
  TXN: { table: 'payment_transactions', useDate: true },
  SLD: { table: 'settlement_ledger', useDate: true },
}

function todayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export async function generateDisplayId(
  supabase: SupabaseClient,
  prefix: string,
): Promise<string> {
  const config = TABLE_CONFIG[prefix]
  if (!config) throw new Error(`Unknown display_id prefix: ${prefix}`)

  const { table, useDate } = config
  const today = todayStr()

  // 검색 패턴: 날짜 포함이면 "REQ-20260514-", 아니면 "A"
  const searchPrefix = useDate ? `${prefix}-${today}-` : prefix

  // 해당 prefix로 시작하는 가장 큰 display_id 조회
  const { data } = await supabase
    .from(table)
    .select('display_id')
    .like('display_id', `${searchPrefix}%`)
    .order('display_id', { ascending: false })
    .limit(1)

  let nextSeq = 1
  if (data && data.length > 0 && data[0].display_id) {
    const existing = data[0].display_id as string
    // 마지막 숫자 부분 추출
    const numPart = useDate
      ? existing.slice(searchPrefix.length)
      : existing.slice(prefix.length)
    const parsed = parseInt(numPart, 10)
    if (!isNaN(parsed)) nextSeq = parsed + 1
  }

  const seq = String(nextSeq).padStart(6, '0')
  return useDate ? `${prefix}-${today}-${seq}` : `${prefix}${seq}`
}

/**
 * 프로필용 display_id 생성 (role 기반 prefix 자동 결정)
 */
export async function generateProfileDisplayId(
  supabase: SupabaseClient,
  role: 'agency' | 'landco' | 'admin',
): Promise<string> {
  const prefixMap = { agency: 'A', landco: 'L', admin: 'ADM' } as const
  return generateDisplayId(supabase, prefixMap[role])
}
