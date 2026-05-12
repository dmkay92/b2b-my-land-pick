'use client'

import { useEffect, useState } from 'react'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

type TabKey = 'reviewing' | 'confirmed' | 'landco_paid' | 'agency_payable' | 'agency_paid' | 'all'

interface LedgerRow {
  id: string
  display_id: string | null
  request_id: string
  installment_id: string | null
  paid_amount: number
  platform_fee: number
  agency_fee: number
  landco_payout_amount: number
  landco_payout_status: string
  agency_payout_status: string
  created_at: string
  request: {
    display_id: string | null
    event_name: string
    depart_date: string | null
    return_date: string | null
    created_at: string
  } | null
  landco_company_name: string | null
  agency_company_name: string | null
  installment_display_id: string | null
  installment_label: string | null
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'reviewing', label: '검토중' },
  { key: 'confirmed', label: '확정' },
  { key: 'landco_paid', label: '랜드사 지급완료' },
  { key: 'agency_payable', label: '여행사 지급대기' },
  { key: 'agency_paid', label: '여행사 지급완료' },
  { key: 'all', label: '전체' },
]

const TABS_WITH_BULK: Record<TabKey, { action: 'confirm' | 'landco_paid' | 'agency_paid'; label: string } | null> = {
  reviewing: { action: 'confirm', label: '정산 확정' },
  confirmed: { action: 'landco_paid', label: '랜드사 지급완료' },
  agency_payable: { action: 'agency_paid', label: '여행사 지급완료' },
  landco_paid: null,
  agency_paid: null,
  all: null,
}

function LandcoBadge({ status }: { status: string }) {
  switch (status) {
    case 'reviewing':
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">검토중</span>
    case 'confirmed':
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">확정</span>
    case 'paid':
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">지급완료</span>
    default:
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{status}</span>
  }
}

function AgencyBadge({ status }: { status: string }) {
  switch (status) {
    case 'accrued':
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">적립</span>
    case 'payable':
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">지급대기</span>
    case 'paid':
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">지급완료</span>
    default:
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{status}</span>
  }
}

export default function AdminSettlementLedgerPage() {
  const [tab, setTab] = useState<TabKey>('reviewing')
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)

  const bulkConfig = TABS_WITH_BULK[tab]
  const hasBulk = bulkConfig !== null

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/settlement-ledger?tab=${tab}`)
    if (res.ok) {
      const { ledger: data } = await res.json()
      setLedger(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    setSelectedIds(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === ledger.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(ledger.map(r => r.id)))
    }
  }

  async function handleBulk() {
    if (!bulkConfig) return
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 ${selectedIds.size}건을 "${bulkConfig.label}" 처리하시겠습니까?`)) return

    setBulkActing(true)
    await fetch('/api/admin/settlement-ledger/bulk-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: bulkConfig.action }),
    })
    setBulkActing(false)
    setSelectedIds(new Set())
    load()
  }

  const colSpan = hasBulk ? 15 : 14

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">정산 원장 관리</h1>

      {/* 탭 + 엑셀 다운로드 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <a
          href={`/api/admin/settlement-ledger/export?tab=${tab}`}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          엑셀 다운로드
        </a>
      </div>

      {/* 벌크 액션 버튼 */}
      {hasBulk && (
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm text-gray-500">{selectedIds.size}건 선택됨</span>
          <button
            onClick={handleBulk}
            disabled={selectedIds.size === 0 || bulkActing}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {bulkActing ? '처리 중...' : bulkConfig!.label}
          </button>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {hasBulk && (
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={ledger.length > 0 && selectedIds.size === ledger.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">요청ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">정산ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">결제ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">행사명</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">여행사</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">랜드사</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">항목</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">납부액</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">플랫폼수수료</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">여행사수수료</th>
              <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">랜드사정산금</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">랜드사상태</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">여행사상태</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">생성일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-8 text-gray-400 text-sm">로딩 중...</td>
              </tr>
            ) : ledger.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-8 text-gray-400 text-sm">데이터가 없습니다.</td>
              </tr>
            ) : (
              ledger.map(row => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                    hasBulk && selectedIds.has(row.id) ? 'bg-blue-50/30' : ''
                  }`}
                >
                  {hasBulk && (
                    <td className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-gray-400">{row.request?.display_id ?? '-'}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-gray-500">{row.display_id ?? row.id.slice(0, 8)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-gray-400">{row.installment_display_id ?? '-'}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-gray-900 whitespace-nowrap">{row.request?.event_name ?? '-'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm text-gray-700 whitespace-nowrap">{row.agency_company_name ?? '-'}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm text-gray-700 whitespace-nowrap">{row.landco_company_name ?? '-'}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm text-gray-900 whitespace-nowrap">{row.installment_label ?? '-'}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">{fmt(row.paid_amount ?? 0)}원</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm text-gray-700">{fmt(row.platform_fee ?? 0)}원</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm text-gray-700">{fmt(row.agency_fee ?? 0)}원</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">{fmt(row.landco_payout_amount ?? 0)}원</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <LandcoBadge status={row.landco_payout_status} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <AgencyBadge status={row.agency_payout_status} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs text-gray-500">{row.created_at?.slice(0, 10) ?? '-'}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
