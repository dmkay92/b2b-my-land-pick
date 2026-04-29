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
      agency_id: string
      profiles: { company_name: string }
    }
  }
}

type FilterStatus = 'pending' | 'paid' | 'cancelled' | 'all'

export default function AdminPaymentsPage() {
  const [installments, setInstallments] = useState<Installment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [actingId, setActingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/payments?status=${filter}`)
    if (res.ok) {
      const { installments: data } = await res.json()
      setInstallments(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function handleAction(id: string, action: 'paid' | 'pending') {
    const label = action === 'paid' ? '결제완료 처리' : '결제대기로 되돌리기'
    if (!confirm(`${label}하시겠습니까?`)) return
    setActingId(id)
    await fetch('/api/admin/payments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId: id, action }),
    })
    setActingId(null)
    load()
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">결제완료</span>
      case 'overdue': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">기한초과</span>
      case 'cancelled': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">취소됨</span>
      case 'partial': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">부분결제</span>
      default: return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">결제대기</span>
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">결제 관리</h1>

      {/* 필터 탭 */}
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
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">결제 ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">견적 요청</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">여행사</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">항목</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">금액</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">납부기한</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">상태</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">로딩 중...</td></tr>
            ) : installments.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">데이터가 없습니다.</td></tr>
            ) : (
              installments.map(inst => {
                const qr = inst.payment_schedules?.quote_requests
                const isOverdue = inst.status === 'pending' && inst.due_date < new Date().toISOString().slice(0, 10)
                return (
                  <tr key={inst.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-500">{inst.display_id ?? inst.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{qr?.event_name ?? '-'}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{qr?.display_id ?? ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{qr?.profiles?.company_name ?? '-'}</span>
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
                      {(inst.status === 'pending' || inst.status === 'overdue') && (
                        <button
                          onClick={() => handleAction(inst.id, 'paid')}
                          disabled={actingId === inst.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          결제완료
                        </button>
                      )}
                      {inst.status === 'paid' && (
                        <button
                          onClick={() => handleAction(inst.id, 'pending')}
                          disabled={actingId === inst.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          되돌리기
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
    </div>
  )
}
