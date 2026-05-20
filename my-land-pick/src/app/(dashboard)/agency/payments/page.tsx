'use client'

import { useEffect, useState } from 'react'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

interface Installment {
  id: string
  display_id: string | null
  label: string
  rate: number
  amount: number
  paid_amount: number
  due_date: string
  status: string
  paid_at: string | null
  payment_schedules: {
    request_id: string
    total_amount: number
    template_type: string
    quote_requests: {
      display_id: string | null
      event_name: string
    }
  }
}

type FilterStatus = 'pending' | 'paid' | 'cancelled' | 'all'

export default function AgencyPaymentsPage() {
  const [installments, setInstallments] = useState<Installment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [payingInstallment, setPayingInstallment] = useState<Installment | null>(null)
  const [notifyingTransfer, setNotifyingTransfer] = useState(false)
  const [showTransferSuccess, setShowTransferSuccess] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/agency/payments?status=${filter}`)
    if (res.ok) {
      const { installments: data } = await res.json()
      setInstallments(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function handleTransferNotify() {
    if (!payingInstallment || notifyingTransfer) return
    setNotifyingTransfer(true)
    try {
      const res = await fetch('/api/payment-schedule/transfer-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: payingInstallment.id }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        alert(error || '처리 중 오류가 발생했습니다.')
        return
      }
      setPayingInstallment(null)
      setShowTransferSuccess(true)
      load()
    } finally {
      setNotifyingTransfer(false)
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">결제완료</span>
      case 'overdue': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">기한초과</span>
      case 'cancelled': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">취소됨</span>
      case 'partial': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">부분결제</span>
      case 'verifying': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">입금 확인 중</span>
      default: return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">결제대기</span>
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">결제 관리</h1>

      <div className="flex gap-2 mb-4">
        {([
          { key: 'pending' as const, label: '결제대기' },
          { key: 'paid' as const, label: '결제완료' },
          { key: 'cancelled' as const, label: '취소됨' },
          { key: 'all' as const, label: '전체' },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">견적번호</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">행사명</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">항목</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">금액</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">납부기한</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">상태</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">로딩 중...</td></tr>
            ) : installments.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">데이터가 없습니다.</td></tr>
            ) : (
              installments.map(inst => {
                const qr = inst.payment_schedules?.quote_requests
                const isOverdue = inst.status === 'pending' && inst.due_date < new Date().toISOString().slice(0, 10)
                const canPay = inst.status === 'pending' || inst.status === 'overdue'
                return (
                  <tr
                    key={inst.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => window.location.href = `/agency/requests/${inst.payment_schedules?.request_id}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-400">{qr?.display_id ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{qr?.event_name ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">{inst.label}</span>
                      {inst.rate > 0 && <span className="text-[10px] text-gray-400 ml-1">({Math.round(inst.rate * 100)}%)</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">{fmt(inst.amount)}원</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                        {inst.due_date}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {statusBadge(inst.status)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canPay && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPayingInstallment(inst) }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-all active:scale-95 ${
                            inst.status === 'overdue' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          결제하기
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 계좌이체 안내 모달 */}
      {payingInstallment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">계좌이체 안내</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {payingInstallment.label} — {fmt(payingInstallment.amount - payingInstallment.paid_amount)}원
              </p>
            </div>
            <div className="px-5 py-5 space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">은행</span>
                  <span className="text-sm font-semibold text-gray-900">우리은행</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">계좌번호</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-700 tracking-wide">1005-604-520904</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText('1005604520904'); alert('계좌번호가 복사되었습니다.') }}
                      className="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded hover:bg-blue-200"
                    >
                      복사
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">예금주</span>
                  <span className="text-sm font-semibold text-gray-900">(주)마이리얼트립</span>
                </div>
                <div className="flex justify-between items-center border-t border-blue-200 pt-2.5">
                  <span className="text-xs font-medium text-gray-600">입금 금액</span>
                  <span className="text-base font-bold text-blue-700">{fmt(payingInstallment.amount - payingInstallment.paid_amount)}원</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                입금 후 확인까지 영업일 기준 1~2일 소요됩니다.<br />
                입금자명은 회사명으로 기재해주세요.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setPayingInstallment(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                닫기
              </button>
              <button
                onClick={handleTransferNotify}
                disabled={notifyingTransfer}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {notifyingTransfer ? '처리 중...' : '입금을 완료했습니다'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 입금 완료 알림 성공 모달 */}
      {showTransferSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-5 text-center space-y-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-900">입금 알림이 전송되었습니다</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                마이랜드픽 담당자가 입금 내역을 확인할 예정입니다.<br />
                확인 완료 시 결제 상태가 업데이트됩니다.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-center">
              <button
                onClick={() => setShowTransferSuccess(false)}
                className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
