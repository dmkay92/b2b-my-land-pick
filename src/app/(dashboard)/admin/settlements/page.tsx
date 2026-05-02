'use client'

import { useEffect, useState, useCallback } from 'react'
import { calculateSettlement, type SettlementCalcResult } from '@/lib/settlement'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

type SettlementStatus = 'pending' | 'reviewing' | 'confirmed' | 'paid'
type FilterStatus = SettlementStatus | 'all'

interface Settlement {
  id: string
  display_id: string | null
  request_id: string
  quote_id: string
  landco_id: string
  agency_id: string
  landco_quote_total: number
  platform_fee_rate: number
  platform_fee: number
  agency_markup: number
  agency_commission_rate: number
  agency_payout: number
  landco_payout: number
  gmv: number
  settlement_status: SettlementStatus
  confirmed_at: string | null
  landco_paid_at: string | null
  agency_paid_at: string | null
  memo: string | null
  created_at: string
  quote_requests: {
    id: string
    display_id: string | null
    event_name: string
    depart_date: string
    return_date: string
    destination_country: string
    destination_city: string
    adults: number
    children: number
    infants: number
    leaders: number
    status: string
    updated_at: string
  }
  agency: {
    id: string
    company_name: string
    bank_name: string | null
    bank_account: string | null
    bank_holder: string | null
  }
  landco: {
    id: string
    company_name: string
    business_registration_number: string | null
    representative_name: string | null
    bank_name: string | null
    bank_account: string | null
    bank_holder: string | null
  }
  paymentSummary: {
    total: number
    paid: number
    count: number
    paidCount: number
  }
  deductionSummary: {
    total: number
    count: number
  }
}

const STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: '정산 대기',
  reviewing: '검토 중',
  confirmed: '정산 확정',
  paid: '지급 완료',
}

function statusBadge(status: SettlementStatus) {
  const styles: Record<SettlementStatus, string> = {
    pending: 'bg-amber-50 text-amber-700',
    reviewing: 'bg-blue-50 text-blue-600',
    confirmed: 'bg-purple-50 text-purple-700',
    paid: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [selected, setSelected] = useState<Settlement | null>(null)
  const [acting, setActing] = useState(false)
  const [memo, setMemo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/settlements?status=${filter}`)
    if (res.ok) {
      const { settlements: data } = await res.json()
      setSettlements(data ?? [])
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  function openDetail(s: Settlement) {
    setSelected(s)
    setMemo(s.memo ?? '')
  }

  function closeDetail() {
    setSelected(null)
    setMemo('')
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const label = STATUS_LABELS[newStatus as SettlementStatus] ?? newStatus
    if (!confirm(`"${label}" 상태로 변경하시겠습니까?`)) return
    setActing(true)
    await fetch('/api/admin/settlements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    setActing(false)
    closeDetail()
    load()
  }

  async function handleSaveMemo(id: string) {
    setActing(true)
    await fetch('/api/admin/settlements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, memo }),
    })
    setActing(false)
    load()
  }

  function getCalc(s: Settlement): SettlementCalcResult {
    const isCancelled = s.quote_requests?.status === 'closed'
    const departDate = new Date(s.quote_requests?.depart_date)
    const now = new Date()
    const daysUntilDepart = Math.ceil((departDate.getTime() - now.getTime()) / 86400000)

    return calculateSettlement({
      landcoQuoteTotal: Number(s.landco_quote_total),
      agencyCommission: Number(s.agency_commission ?? 0),
      totalCustomerPrice: Number(s.gmv),
      paidAmount: s.paymentSummary.paid,
      approvedDeduction: s.deductionSummary.total,
      isCancelled,
      daysUntilDepart,
    })
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">정산 관리</h1>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'pending' as const, label: '정산 대기' },
          { key: 'reviewing' as const, label: '검토 중' },
          { key: 'confirmed' as const, label: '정산 확정' },
          { key: 'paid' as const, label: '지급 완료' },
          { key: 'all' as const, label: '전체' },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">정산 ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">요청 / 행사명</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">여행사</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">랜드사</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">여행기간</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">상태</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">총 고객가</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">결제완료</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">로딩 중...</td></tr>
            ) : settlements.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">데이터가 없습니다.</td></tr>
            ) : (
              settlements.map(s => {
                const qr = s.quote_requests
                return (
                  <tr
                    key={s.id}
                    onClick={() => openDetail(s)}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-500">{s.display_id ?? s.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-mono text-blue-600">{qr?.display_id ?? '-'}</div>
                      <div className="text-sm font-medium text-gray-900">{qr?.event_name ?? '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{s.agency?.company_name ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{s.landco?.company_name ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-500">
                        {qr?.depart_date?.slice(0, 10)} ~ {qr?.return_date?.slice(0, 10)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {statusBadge(s.settlement_status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">{fmt(Number(s.gmv))}원</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-700">{fmt(s.paymentSummary.paid)}원</span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeDetail}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">정산 상세</h2>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* 1. 기본 정보 */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">기본 정보</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <InfoRow label="정산 ID" value={selected.display_id ?? selected.id.slice(0, 8)} />
                  <InfoRow label="요청 ID" value={selected.quote_requests?.display_id ?? '-'} />
                  <InfoRow label="행사명" value={selected.quote_requests?.event_name ?? '-'} />
                  <InfoRow label="여행사" value={selected.agency?.company_name ?? '-'} />
                  <InfoRow label="랜드사" value={selected.landco?.company_name ?? '-'} />
                  <InfoRow label="여행기간" value={`${selected.quote_requests?.depart_date?.slice(0, 10)} ~ ${selected.quote_requests?.return_date?.slice(0, 10)}`} />
                  <InfoRow label="취소 여부" value={selected.quote_requests?.status === 'closed' ? '취소됨' : '정상'} />
                </div>
              </section>

              {/* 2. 정산 계산 */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">정산 계산</h3>
                {(() => {
                  const calc = getCalc(selected)
                  return (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                      <CalcRow label="랜드사 견적가" value={`${fmt(calc.landcoBase)}원`} />
                      <CalcRow label="플랫폼 수수료 (5%)" value={`-${fmt(calc.platformFee)}원`} sub />
                      {selected.deductionSummary.total > 0 && (
                        <CalcRow label={`공제 (${selected.deductionSummary.count}건)`} value={`-${fmt(selected.deductionSummary.total)}원`} sub />
                      )}
                      <div className="border-t border-gray-200 pt-2 mt-2">
                        <CalcRow label="랜드사 정산금" value={`${fmt(calc.landcoPayout)}원`} bold highlight="purple" />
                      </div>
                      <div className="border-t border-gray-200 pt-2 mt-2">
                        <CalcRow label="여행사 수수료" value={`${fmt(calc.agencyPayout)}원`} />
                        <CalcRow label="플랫폼 수익" value={`${fmt(calc.platformRevenue)}원`} />
                        {calc.customerRefund > 0 && (
                          <CalcRow label="고객 환불액" value={`${fmt(calc.customerRefund)}원`} highlight="red" />
                        )}
                        {calc.agencyAdditionalCharge > 0 && (
                          <CalcRow label="여행사 추가 청구" value={`${fmt(calc.agencyAdditionalCharge)}원`} highlight="red" />
                        )}
                      </div>
                    </div>
                  )
                })()}
              </section>

              {/* 3. 결제 현황 */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">결제 현황</h3>
                <div className="bg-gray-50 rounded-lg p-4 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-500">총 결제 금액</span>
                    <span className="font-semibold text-gray-900">{fmt(selected.paymentSummary.total)}원</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-500">결제 완료</span>
                    <span className="font-semibold text-emerald-600">{fmt(selected.paymentSummary.paid)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">회차</span>
                    <span className="text-gray-700">{selected.paymentSummary.paidCount} / {selected.paymentSummary.count} 완료</span>
                  </div>
                  {selected.paymentSummary.total > 0 && (
                    <div className="mt-2">
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (selected.paymentSummary.paid / selected.paymentSummary.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 4. 정산 액션 */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">정산 액션</h3>
                <div className="flex flex-wrap gap-2">
                  {selected.settlement_status === 'pending' && (
                    <button
                      onClick={() => handleStatusChange(selected.id, 'reviewing')}
                      disabled={acting}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      검토 시작
                    </button>
                  )}
                  {selected.settlement_status === 'reviewing' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(selected.id, 'confirmed')}
                        disabled={acting}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        정산 확정
                      </button>
                      <button
                        onClick={() => window.open(`/api/admin/settlements/${selected.id}/statement`, '_blank')}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        명세서 미리보기
                      </button>
                    </>
                  )}
                  {selected.settlement_status === 'confirmed' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(selected.id, 'paid')}
                        disabled={acting}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        랜드사 입금 완료
                      </button>
                      <button
                        onClick={() => window.open(`/api/admin/settlements/${selected.id}/statement`, '_blank')}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        명세서 다운로드
                      </button>
                    </>
                  )}
                  {selected.settlement_status === 'paid' && (
                    <div className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-50 text-emerald-700">
                      지급 완료
                    </div>
                  )}
                </div>
              </section>

              {/* 5. 메모 */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">메모</h3>
                <textarea
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={3}
                  placeholder="관리자 메모를 입력하세요..."
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleSaveMemo(selected.id)}
                    disabled={acting}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    메모 저장
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="text-gray-400 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  )
}

function CalcRow({ label, value, sub, bold, highlight }: {
  label: string
  value: string
  sub?: boolean
  bold?: boolean
  highlight?: 'purple' | 'red'
}) {
  const textColor = highlight === 'purple' ? 'text-purple-700' : highlight === 'red' ? 'text-red-600' : 'text-gray-900'
  return (
    <div className={`flex justify-between ${sub ? 'pl-4' : ''}`}>
      <span className={`${sub ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
      <span className={`${bold ? 'font-bold text-base' : 'font-semibold'} ${textColor}`}>{value}</span>
    </div>
  )
}
