'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DateRangePicker } from '@/components/DateRangePicker'

type QuoteRequestRow = {
  id: string
  display_id: string | null
  event_name: string
  destination_country: string
  destination_city: string
  depart_date: string
  return_date: string
  status: string
  created_at: string
  agency_name: string
  quote_count: number
  landco_names: string[]
}

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'open', label: '모집중' },
  { value: 'in_progress', label: '견적접수' },
  { value: 'payment_pending', label: '결제대기' },
  { value: 'finalized', label: '여행확정' },
  { value: 'completed', label: '여행완료' },
  { value: 'closed', label: '취소' },
]

function getDisplayStatus(r: { status: string; return_date: string }) {
  if (r.status === 'finalized' && r.return_date < new Date().toISOString().slice(0, 10)) return 'completed'
  return r.status
}

function statusLabel(s: string) {
  return STATUS_OPTIONS.find(o => o.value === s)?.label ?? s
}

function statusColor(s: string) {
  switch (s) {
    case 'open': return 'bg-blue-100 text-blue-700'
    case 'in_progress': return 'bg-blue-100 text-blue-700'
    case 'payment_pending': return 'bg-amber-100 text-amber-700'
    case 'finalized': return 'bg-purple-100 text-purple-700'
    case 'completed': return 'bg-green-100 text-green-700'
    case 'closed': return 'bg-red-100 text-red-600'
    default: return 'bg-gray-100 text-gray-500'
  }
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }

export default function AdminQuotesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [rows, setRows] = useState<QuoteRequestRow[]>([])
  const [loading, setLoading] = useState(true)

  // 검색 필터 — URL 파라미터에서 초기값 읽기
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [createdFrom, setCreatedFrom] = useState(searchParams.get('from') ?? '')
  const [createdTo, setCreatedTo] = useState(searchParams.get('to') ?? '')
  const [departFrom, setDepartFrom] = useState('')
  const [departTo, setDepartTo] = useState('')
  const [returnFrom, setReturnFrom] = useState('')
  const [returnTo, setReturnTo] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/quote-requests')
      if (res.ok) {
        const { rows: data } = await res.json()
        setRows(data ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // 필터링
  const filtered = rows.filter(r => {
    const ds = getDisplayStatus(r)
    if (statusFilter.length > 0 && !statusFilter.includes(ds)) return false
    // 요청일(생성일) 범위
    if (createdFrom && r.created_at?.slice(0, 10) < createdFrom) return false
    if (createdTo && r.created_at?.slice(0, 10) > createdTo) return false
    // 출발일 범위
    if (departFrom && r.depart_date < departFrom) return false
    if (departTo && r.depart_date > departTo) return false
    // 귀국일 범위
    if (returnFrom && r.return_date < returnFrom) return false
    if (returnTo && r.return_date > returnTo) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (r.display_id ?? '').toLowerCase().includes(q)
      || r.event_name.toLowerCase().includes(q)
      || r.agency_name.toLowerCase().includes(q)
      || r.destination_city.toLowerCase().includes(q)
      || r.destination_country.toLowerCase().includes(q)
  })

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">견적 현황</h1>

      {/* 검색 + 필터 */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="견적번호, 행사명, 여행사, 목적지 검색"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="whitespace-nowrap font-medium">요청일</span>
            <DateRangePicker startDate={createdFrom} endDate={createdTo} onChange={(s, e) => { setCreatedFrom(s); setCreatedTo(e) }} compact />
            {(createdFrom || createdTo) && (
              <button onClick={() => { setCreatedFrom(''); setCreatedTo('') }} className="text-gray-400 hover:text-gray-600">&#x2715;</button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="whitespace-nowrap font-medium">출발일</span>
            <DateRangePicker startDate={departFrom} endDate={departTo} onChange={(s, e) => { setDepartFrom(s); setDepartTo(e) }} compact />
            {(departFrom || departTo) && (
              <button onClick={() => { setDepartFrom(''); setDepartTo('') }} className="text-gray-400 hover:text-gray-600">&#x2715;</button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="whitespace-nowrap font-medium">귀국일</span>
            <DateRangePicker startDate={returnFrom} endDate={returnTo} onChange={(s, e) => { setReturnFrom(s); setReturnTo(e) }} compact />
            {(returnFrom || returnTo) && (
              <button onClick={() => { setReturnFrom(''); setReturnTo('') }} className="text-gray-400 hover:text-gray-600">&#x2715;</button>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {(() => {
            const filterStyle: Record<string, { active: string; hover: string }> = {
              '': { active: 'bg-gray-900 text-white border-gray-900', hover: 'hover:bg-gray-50' },
              open: { active: 'bg-blue-600 text-white border-blue-600', hover: 'hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200' },
              in_progress: { active: 'bg-blue-600 text-white border-blue-600', hover: 'hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200' },
              payment_pending: { active: 'bg-amber-500 text-white border-amber-500', hover: 'hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200' },
              finalized: { active: 'bg-purple-600 text-white border-purple-600', hover: 'hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200' },
              completed: { active: 'bg-green-600 text-white border-green-600', hover: 'hover:bg-green-50 hover:text-green-600 hover:border-green-200' },
              closed: { active: 'bg-red-500 text-white border-red-500', hover: 'hover:bg-red-50 hover:text-red-500 hover:border-red-200' },
            }
            return (
              <>
                <button
                  onClick={() => setStatusFilter([])}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    statusFilter.length === 0
                      ? filterStyle[''].active
                      : `bg-white text-gray-600 border-gray-200 ${filterStyle[''].hover}`
                  }`}
                >
                  전체
                </button>
                {STATUS_OPTIONS.filter(o => o.value).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(prev =>
                      prev.includes(opt.value)
                        ? prev.filter(v => v !== opt.value)
                        : [...prev, opt.value]
                    )}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      statusFilter.includes(opt.value)
                        ? filterStyle[opt.value]?.active
                        : `bg-white text-gray-600 border-gray-200 ${filterStyle[opt.value]?.hover}`
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </>
            )
          })()}
        </div>
      </div>

      {/* 결과 카운트 */}
      <p className="text-xs text-gray-400 mb-2">{fmt(filtered.length)}건</p>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              {search || statusFilter.length > 0 ? '검색 결과가 없습니다.' : '견적 요청이 없습니다.'}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <th className="text-left px-4 py-3 font-medium">견적번호</th>
                  <th className="text-left px-4 py-3 font-medium">행사명</th>
                  <th className="text-left px-4 py-3 font-medium">여행사</th>
                  <th className="text-left px-4 py-3 font-medium">목적지</th>
                  <th className="text-left px-4 py-3 font-medium">출발일</th>
                  <th className="text-left px-4 py-3 font-medium">귀국일</th>
                  <th className="text-center px-4 py-3 font-medium">견적수</th>
                  <th className="text-center px-4 py-3 font-medium">참여 랜드사</th>
                  <th className="text-center px-4 py-3 font-medium">상태</th>
                  <th className="text-left px-4 py-3 font-medium">요청일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(qr => (
                  <tr
                    key={qr.id}
                    className="border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/admin/requests/${qr.id}`)}
                  >
                    <td className="px-4 py-3 text-gray-400 font-mono text-[11px]">{qr.display_id ?? qr.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[220px] truncate">{qr.event_name}</td>
                    <td className="px-4 py-3 text-gray-600">{qr.agency_name}</td>
                    <td className="px-4 py-3 text-gray-600">{qr.destination_city}</td>
                    <td className="px-4 py-3 text-gray-600">{qr.depart_date}</td>
                    <td className="px-4 py-3 text-gray-600">{qr.return_date}</td>
                    <td className="px-4 py-3 text-center">
                      {qr.quote_count > 0
                        ? <span className="text-blue-600 font-medium">{qr.quote_count}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {qr.landco_names.length > 0
                        ? <span className="text-emerald-600 font-medium">{qr.landco_names.length}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(getDisplayStatus(qr))}`}>
                        {statusLabel(getDisplayStatus(qr))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{qr.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
