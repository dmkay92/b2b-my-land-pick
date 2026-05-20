'use client'

import { useEffect, useState } from 'react'
import DeductionClaimSection from '@/components/DeductionClaimSection'
import type { DeductionClaim } from '@/lib/supabase/types'

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
  settlement_status: string | null
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ type: 'action'; id: string; action: 'paid' | 'pending'; label: string } | { type: 'bulk'; count: number } | null>(null)
  const [allClaims, setAllClaims] = useState<(DeductionClaim & { quote_requests?: { event_name: string; display_id: string | null; agency_id: string } })[]>([])
  const [claimsLoading, setClaimsLoading] = useState(true)
  const [claimFilter, setClaimFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')

  async function loadClaims() {
    setClaimsLoading(true)
    const param = claimFilter === 'all' ? '' : `?status=${claimFilter}`
    const res = await fetch(`/api/deduction-claims${param}`)
    if (res.ok) {
      const { claims } = await res.json()
      setAllClaims(claims ?? [])
    }
    setClaimsLoading(false)
  }

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/payments?status=${filter}`)
    if (res.ok) {
      const { installments: data } = await res.json()
      setInstallments(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load(); setSelectedIds(new Set()) }, [filter])
  useEffect(() => { loadClaims() }, [claimFilter])

  const selectableIds = installments
    .filter(i => i.status === 'paid' && i.settlement_status == null)
    .map(i => i.id)

  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableIds))
    }
  }

  async function handleBulkSettlement() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setConfirmModal({ type: 'bulk', count: ids.length })
  }

  async function executeBulkSettlement() {
    const ids = [...selectedIds]
    setBulkActing(true)
    await fetch('/api/admin/settlement-ledger/bulk-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentIds: ids }),
    })
    setBulkActing(false)
    setSelectedIds(new Set())
    load()
  }

  async function handleAction(id: string, action: 'paid' | 'pending') {
    const label = action === 'paid' ? '결제완료 처리' : '결제대기로 되돌리기'
    setConfirmModal({ type: 'action', id, action, label })
  }

  async function executeAction(id: string, action: 'paid' | 'pending') {
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
      case 'verifying': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">입금 확인 중</span>
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

      {/* 액션 바 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkSettlement}
              disabled={bulkActing}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {bulkActing ? '처리 중...' : `정산 검토로 넘기기 (${selectedIds.size}건)`}
            </button>
          )}
        </div>
        <button
          onClick={() => window.open(`/api/admin/payments/export?status=${filter}`, '_blank')}
          className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          엑셀 다운로드
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                  title="전체 선택"
                />
              </th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">견적번호</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">행사명</th>
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
                const isSelectable = inst.status === 'paid' && inst.settlement_status == null
                return (
                  <tr key={inst.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 w-8">
                      {isSelectable && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inst.id)}
                          onChange={() => toggleSelect(inst.id)}
                          className="rounded border-gray-300"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-400">{qr?.display_id ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{qr?.event_name ?? '-'}</span>
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
                      <div className="flex flex-col items-center gap-1">
                        {statusBadge(inst.status)}
                        {inst.settlement_status === 'reviewing' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">정산검토중</span>
                        )}
                        {inst.settlement_status === 'settled' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">정산완료</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(inst.status === 'pending' || inst.status === 'overdue' || inst.status === 'verifying') && (
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

      {/* 공제 검토 섹션 */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">공제 관리</h2>
      <div className="flex gap-2 mb-4">
        {([
          { key: 'pending' as const, label: '검토 대기' },
          { key: 'approved' as const, label: '승인됨' },
          { key: 'rejected' as const, label: '거부됨' },
          { key: 'all' as const, label: '전체' },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setClaimFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              claimFilter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {claimsLoading ? (
        <p className="text-sm text-gray-400">로딩 중...</p>
      ) : allClaims.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-8 text-center">
          <p className="text-sm text-gray-400">공제 신청 내역이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(
            allClaims.reduce<Record<string, typeof allClaims>>((acc, c) => {
              const key = c.request_id
              if (!acc[key]) acc[key] = []
              acc[key].push(c)
              return acc
            }, {})
          ).map(([requestId, claims]) => (
            <div key={requestId}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-gray-900">
                  {claims[0]?.quote_requests?.event_name ?? '행사명 없음'}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  {claims[0]?.quote_requests?.display_id ?? requestId.slice(0, 8)}
                </span>
              </div>
              <DeductionClaimSection
                requestId={requestId}
                claims={claims}
                onUpdated={loadClaims}
                role="admin"
              />
            </div>
          ))}
        </div>
      )}
      {/* 확인 모달 */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {confirmModal.type === 'bulk' ? '정산 검토' : confirmModal.action === 'paid' ? '결제완료 처리' : '결제 되돌리기'}
              </h3>
            </div>
            <div className="px-5 py-5 space-y-3">
              {confirmModal.type === 'bulk' ? (
                <p className="text-sm text-gray-700"><strong>{confirmModal.count}건</strong>을 정산 검토로 넘기시겠습니까?</p>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    {confirmModal.action === 'paid' ? '결제완료 처리' : '결제대기 상태로 되돌리기'}하시겠습니까?
                  </p>
                  {confirmModal.action === 'pending' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs text-amber-700">결제완료 상태를 되돌리면 결제대기 상태로 변경됩니다.</p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  if (confirmModal.type === 'bulk') {
                    setConfirmModal(null)
                    await executeBulkSettlement()
                  } else {
                    const { id: instId, action } = confirmModal
                    setConfirmModal(null)
                    await executeAction(instId, action)
                  }
                }}
                disabled={!!actingId || bulkActing}
                className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
                  confirmModal.type === 'bulk' ? 'bg-blue-600 hover:bg-blue-700' :
                  confirmModal.action === 'paid' ? 'bg-emerald-500 hover:bg-emerald-600' :
                  'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {actingId || bulkActing ? '처리 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
