'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDate, calculateTotalPeople, getCountryName } from '@/lib/utils'
import { DateRangePicker } from '@/components/DateRangePicker'
import type { QuoteRequest } from '@/lib/supabase/types'

export type TravelPhase = 'all' | 'ing' | 'payment_pending' | 'confirmed' | 'end' | 'cancelled'

export type SelectedInfo = {
  landcoName: string
  total: number | null
  per_person: number | null
}

export type PhasedRequest = QuoteRequest & {
  quoteCount: number
  landcoCount: number
  phase: 'ing' | 'payment_pending' | 'pre' | 'mid' | 'end' | 'cancelled'
  dday: number | null
  selectedInfo?: SelectedInfo
}

const SUB_PHASE_LABELS: Record<'pre' | 'mid' | 'end', string> = {
  pre: '출발전',
  mid: '여행중',
  end: '여행완료',
}

const SUB_PHASE_COLORS: Record<'pre' | 'mid' | 'end', { border: string; badge: string }> = {
  pre: { border: '#7c3aed', badge: 'bg-purple-100 text-purple-700' },
  mid: { border: '#7c3aed', badge: 'bg-purple-100 text-purple-700' },
  end: { border: '#059669', badge: 'bg-green-100 text-green-700' },
}

const KPI_CARDS: { phase: TravelPhase; label: string; subtext: string; color?: string }[] = [
  { phase: 'all',       label: '전체',          subtext: '모든 요청' },
  { phase: 'ing',             label: '견적 수집 중',  subtext: '랜드사 견적 대기 중', color: '#2563eb' },
  { phase: 'payment_pending', label: '결제 대기 중',  subtext: '결제 확인 중', color: '#d97706' },
  { phase: 'confirmed',       label: '여행 확정',     subtext: '출발전 · 여행중',     color: '#7c3aed' },
  { phase: 'end',       label: '여행 완료',      subtext: '일정 종료',           color: '#059669' },
  { phase: 'cancelled', label: '취소',           subtext: '선택 없이 마감',      color: '#9ca3af' },
]

const SECTIONS = [
  {
    key: 'ing' as const,
    label: '견적 수집 중',
    dotColor: 'bg-blue-500',
    filter: (r: PhasedRequest) => r.phase === 'ing',
  },
  {
    key: 'payment_pending' as const,
    label: '결제 대기 중',
    dotColor: 'bg-amber-500',
    filter: (r: PhasedRequest) => r.phase === 'payment_pending',
  },
  {
    key: 'confirmed' as const,
    label: '여행 확정',
    dotColor: 'bg-purple-500',
    filter: (r: PhasedRequest) => r.phase === 'pre' || r.phase === 'mid',
  },
  {
    key: 'end' as const,
    label: '여행 완료',
    dotColor: 'bg-green-500',
    filter: (r: PhasedRequest) => r.phase === 'end',
  },
  {
    key: 'cancelled' as const,
    label: '취소',
    dotColor: 'bg-gray-400',
    filter: (r: PhasedRequest) => r.phase === 'cancelled',
  },
]

function getBorderColor(req: PhasedRequest): string {
  if (req.phase === 'ing') return '#2563eb'
  if (req.phase === 'payment_pending') return '#d97706'
  if (req.phase === 'pre') return '#7c3aed'
  if (req.phase === 'mid') return '#7c3aed'
  if (req.phase === 'end') return '#059669'
  return '#9ca3af'
}

export function AgencyDashboardClient({
  requests,
  isRejected = false,
}: {
  requests: PhasedRequest[]
  counts?: Record<TravelPhase, number>
  isRejected?: boolean
}) {
  type FilterPhase = 'ing' | 'payment_pending' | 'confirmed' | 'end' | 'cancelled'
  const ALL_FILTER_PHASES: FilterPhase[] = ['ing', 'payment_pending', 'confirmed', 'end', 'cancelled']

  const router = useRouter()
  const [activePhases, setActivePhases] = useState<Set<FilterPhase>>(new Set(ALL_FILTER_PHASES))
  const [confirmedSubFilter, setConfirmedSubFilter] = useState<'all' | 'pre' | 'mid' | 'end'>('all')
  const [ingSubFilter, setIngSubFilter] = useState<'all' | 'no_quote' | 'has_quote'>('all')
  const [hoveredPhase, setHoveredPhase] = useState<TravelPhase | null>(null)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [activePreset, setActivePreset] = useState('all')
  const [requestStart, setRequestStart] = useState('')
  const [requestEnd, setRequestEnd] = useState('')
  const [activeRequestPreset, setActiveRequestPreset] = useState('all')

  const PERIOD_PRESETS = [
    { key: 'all', label: '전체' },
    { key: 'this-month', label: '이번 달' },
    { key: 'next-month', label: '다음 달' },
  ]

  const REQUEST_PRESETS = [
    { key: 'all', label: '전체' },
    { key: 'this-month', label: '이번 달' },
    { key: 'last-month', label: '지난 달' },
  ]

  function toKSTStr(d: Date): string {
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 10)
  }

  function calcPresetRange(key: string): { start: string; end: string } | null {
    const now = new Date()
    if (key === 'all') return null
    if (key === 'this-month') return {
      start: toKSTStr(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: toKSTStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    }
    if (key === 'next-month') return {
      start: toKSTStr(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
      end: toKSTStr(new Date(now.getFullYear(), now.getMonth() + 2, 0)),
    }
    if (key === 'last-month') return {
      start: toKSTStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: toKSTStr(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
    if (key === 'this-quarter') {
      const q = Math.floor(now.getMonth() / 3)
      return {
        start: toKSTStr(new Date(now.getFullYear(), q * 3, 1)),
        end: toKSTStr(new Date(now.getFullYear(), q * 3 + 3, 0)),
      }
    }
    return null
  }

  function applyPreset(key: string) {
    setActivePreset(key)
    const range = calcPresetRange(key)
    setPeriodStart(range?.start ?? ''); setPeriodEnd(range?.end ?? '')
  }

  function applyRequestPreset(key: string) {
    setActiveRequestPreset(key)
    const range = calcPresetRange(key)
    setRequestStart(range?.start ?? ''); setRequestEnd(range?.end ?? '')
  }

  const periodFilteredRequests = (!periodStart && !periodEnd)
    ? requests
    : requests.filter(r => {
        if (periodStart && r.depart_date < periodStart) return false
        if (periodEnd && r.depart_date > periodEnd) return false
        return true
      })

  const fullyFilteredRequests = (!requestStart && !requestEnd)
    ? periodFilteredRequests
    : periodFilteredRequests.filter(r => {
        const createdDate = toKSTStr(new Date(r.created_at))
        if (requestStart && createdDate < requestStart) return false
        if (requestEnd && createdDate > requestEnd) return false
        return true
      })

  const isAllSelected = activePhases.size === ALL_FILTER_PHASES.length

  function togglePhase(phase: FilterPhase) {
    setActivePhases(prev => {
      const next = new Set(prev)
      if (next.has(phase)) { next.delete(phase) } else { next.add(phase) }
      return next
    })
  }
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [copyTarget, setCopyTarget] = useState<string | null>(null)

  async function handleCancel() {
    if (!cancelTarget) return
    setCanceling(true)
    await fetch(`/api/requests/${cancelTarget}/cancel`, { method: 'POST' })
    setCanceling(false)
    setCancelTarget(null)
    router.refresh()
  }

  const counts: Record<TravelPhase, number> = {
    all: fullyFilteredRequests.length,
    ing: fullyFilteredRequests.filter(r => r.phase === 'ing').length,
    payment_pending: fullyFilteredRequests.filter(r => r.phase === 'payment_pending').length,
    confirmed: fullyFilteredRequests.filter(r => r.phase === 'pre' || r.phase === 'mid').length,
    end: fullyFilteredRequests.filter(r => r.phase === 'end').length,
    cancelled: fullyFilteredRequests.filter(r => r.phase === 'cancelled').length,
  }

  const filteredRequests = fullyFilteredRequests.filter(r => {
    const key: FilterPhase =
      r.phase === 'pre' || r.phase === 'mid' ? 'confirmed' :
      r.phase === 'payment_pending' ? 'payment_pending' :
      r.phase
    return activePhases.has(key)
  })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* 견적 복사 확인 모달 */}
      {copyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setCopyTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="text-base font-bold text-gray-900 mb-2">견적을 복사하시겠습니까?</h3>
            <p className="text-sm text-gray-500 mb-6">해당 견적의 내용을 복사해 새 견적 요청 작성 페이지로 이동합니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setCopyTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                취소
              </button>
              <button
                autoFocus
                onClick={() => { setCopyTarget(null); router.push(`/agency/requests/new?copy=${copyTarget}`) }}
                className="flex-1 bg-[#009CF0] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#0088D9]"
              >
                복사하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 견적 취소 확인 모달 */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setCancelTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="text-base font-bold text-gray-900 mb-2">견적 요청을 취소하시겠습니까?</h3>
            <p className="text-sm text-gray-500 mb-6">취소한 견적은 되돌릴 수 없습니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                돌아가기
              </button>
              <button
                autoFocus
                onClick={handleCancel}
                disabled={canceling}
                className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {canceling ? '처리 중...' : '취소 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 계정 정지 배너 */}
      {isRejected && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-6">
          <span className="text-red-500 text-xl shrink-0">⊘</span>
          <div>
            <p className="text-sm font-semibold text-red-700">계정이 정지된 상태입니다.</p>
            <p className="text-xs text-red-500 mt-0.5">기존 견적 진행은 가능하지만 새 견적 요청을 생성할 수 없습니다. 문의: 관리자에게 연락해주세요.</p>
          </div>
        </div>
      )}
      {/* 목록 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gray-900">내 견적 요청</h1>
        {isRejected ? (
          <button
            disabled
            className="bg-gray-200 text-gray-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            + 새 견적 요청
          </button>
        ) : (
          <Link
            href="/agency/requests/new"
            className="bg-[#009CF0] text-white px-4 py-2 rounded-lg hover:bg-[#0088D9] text-sm font-medium"
          >
            + 새 견적 요청
          </Link>
        )}
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-6 gap-3 mb-8">
        {KPI_CARDS.map(({ phase, label, subtext, color }) => {
          const isActive = phase === 'all' ? isAllSelected : activePhases.has(phase as FilterPhase)
          const isHovered = hoveredPhase === phase
          const borderColor = color ?? '#374151'
          return (
            <button
              key={phase}
              onClick={() => {
                if (phase === 'all') {
                  setActivePhases(isAllSelected ? new Set() : new Set(ALL_FILTER_PHASES))
                } else {
                  togglePhase(phase as FilterPhase)
                }
              }}
              onMouseEnter={() => setHoveredPhase(phase)}
              onMouseLeave={() => setHoveredPhase(null)}
              style={isActive || isHovered ? { boxShadow: `0 0 0 2px ${borderColor}, 0 4px 10px rgba(0,0,0,0.1)` } : {}}
              className={`bg-white rounded-xl p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${!isActive ? 'opacity-50' : ''}`}
            >
              <p className="text-xs text-gray-500 font-medium mb-1.5">{label}</p>
              <p className="text-2xl font-bold" style={{ color: color ?? '#374151' }}>{counts[phase]}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{subtext}</p>
            </button>
          )
        })}
      </div>

      {/* 기간 필터 */}
      <div className="mb-6 bg-white rounded-xl shadow-sm overflow-visible">
        {[
          {
            label: '출발일',
            presets: PERIOD_PRESETS,
            activePreset,
            onPreset: applyPreset,
            start: periodStart,
            end: periodEnd,
            onRange: (s: string, e: string) => { setPeriodStart(s); setPeriodEnd(e); setActivePreset('custom') },
            onReset: () => applyPreset('all'),
          },
          {
            label: '요청일',
            presets: REQUEST_PRESETS,
            activePreset: activeRequestPreset,
            onPreset: applyRequestPreset,
            start: requestStart,
            end: requestEnd,
            onRange: (s: string, e: string) => { setRequestStart(s); setRequestEnd(e); setActiveRequestPreset('custom') },
            onReset: () => applyRequestPreset('all'),
          },
        ].map((row, i) => (
          <div key={row.label} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
            <span className="text-[11px] text-gray-400 font-semibold shrink-0" style={{ width: '2.5rem' }}>{row.label}</span>
            <div className="w-px h-4 bg-gray-200 shrink-0" />
            <div className="flex items-center gap-2">
              {row.presets.map(p => (
                <button
                  key={p.key}
                  onClick={() => row.onPreset(p.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                    row.activePreset === p.key
                      ? 'bg-gray-900 text-white'
                      : 'border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-gray-200 shrink-0" />
            <div className="flex-1 max-w-sm">
              <DateRangePicker
                startDate={row.start}
                endDate={row.end}
                compact
                triggerClassName="w-full flex items-center gap-2 border border-gray-200 bg-white hover:border-gray-300 transition-colors rounded-lg px-3 py-1.5"
                onChange={row.onRange}
              />
            </div>
            {(row.start || row.end) && (
              <button onClick={row.onReset} className="text-[11px] text-gray-400 hover:text-gray-600 shrink-0">초기화</button>
            )}
          </div>
        ))}
      </div>

      {/* 3개 섹션 */}
      <div className="space-y-8">
        {SECTIONS.map(section => {
          const baseSectionRequests = filteredRequests.filter(section.filter)
          const sectionRequests =
            section.key === 'confirmed' && confirmedSubFilter !== 'all'
              ? baseSectionRequests.filter(r => r.phase === confirmedSubFilter)
              : section.key === 'ing' && ingSubFilter !== 'all'
                ? baseSectionRequests.filter(r => ingSubFilter === 'has_quote' ? r.quoteCount > 0 : r.quoteCount === 0)
                : baseSectionRequests
          const isEnded = section.key === 'cancelled'

          const SUB_FILTERS: { key: 'all' | 'pre' | 'mid' | 'end'; label: string }[] = [
            { key: 'all', label: '전체' },
            { key: 'pre', label: '출발전' },
            { key: 'mid', label: '여행중' },
          ]

          const ING_SUB_FILTERS: { key: 'all' | 'no_quote' | 'has_quote'; label: string }[] = [
            { key: 'all', label: '전체' },
            { key: 'no_quote', label: '받은 견적 없음' },
            { key: 'has_quote', label: '견적 확정 필요' },
          ]

          return (
            <div key={section.key}>
              {/* 섹션 헤더 */}
              <div className="flex items-center gap-2.5 mb-3">
                <span className={`w-2 h-2 rounded-full ${section.dotColor} flex-shrink-0`} />
                <h2 className="text-sm font-bold text-gray-700">{section.label}</h2>
                <span className="text-sm text-gray-400">({baseSectionRequests.length}건)</span>
                <div className="flex-1 h-px bg-gray-100 ml-1" />
              </div>
              {section.key === 'ing' && (
                <div className="flex items-center gap-1 mb-3">
                  {ING_SUB_FILTERS.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setIngSubFilter(f.key)}
                      className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                        ingSubFilter === f.key
                          ? 'bg-blue-100 text-blue-700 font-semibold'
                          : 'text-gray-400 hover:bg-blue-100 hover:text-blue-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              {section.key === 'confirmed' && (
                <div className="flex items-center gap-1 mb-3">
                  {SUB_FILTERS.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setConfirmedSubFilter(f.key)}
                      className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                        confirmedSubFilter === f.key
                          ? 'bg-purple-100 text-purple-700 font-semibold'
                          : 'text-gray-400 hover:bg-purple-100 hover:text-purple-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {sectionRequests.length === 0 ? (
                <p className="text-xs text-gray-400 pl-4 py-2">해당 요청이 없습니다.</p>
              ) : (
                <div className="space-y-2.5">
                  {sectionRequests.map(req => {
                    const { phase, dday } = req
                    const isDone = false
                    const isCancelled = phase === 'cancelled'
                    const isFinalized = req.status === 'finalized'
                    const borderColor = getBorderColor(req)
                    const subPhaseColor = (phase === 'pre' || phase === 'mid' || phase === 'end')
                      ? SUB_PHASE_COLORS[phase]
                      : null

                    return (
                      <Link
                        key={req.id}
                        href={`/agency/requests/${req.id}`}
                        onMouseEnter={() => setHoveredId(req.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={hoveredId === req.id ? { boxShadow: `0 0 0 2px ${borderColor}, 0 4px 10px rgba(0,0,0,0.08)` } : {}}
                        className={`flex items-center justify-between rounded-xl p-4 shadow-sm transition-all hover:-translate-y-0.5 ${isDone ? 'bg-gray-50' : 'bg-white'}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[15px] font-semibold ${isDone ? 'text-gray-500' : 'text-gray-900'}`}>
                                {req.event_name}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDone ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                                {req.quote_type === 'land' ? '랜드' : '호텔+랜드'}
                              </span>
                              {phase === 'payment_pending' && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">결제대기</span>
                              )}
                              {phase === 'ing' && req.quoteCount > 0 && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">견적 확정 필요</span>
                              )}
                              {subPhaseColor && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${subPhaseColor.badge}`}>
                                  {SUB_PHASE_LABELS[phase as 'pre' | 'mid' | 'end']}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDone ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                                받은 견적 {req.quoteCount}개
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDone ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-500'}`}>
                                참여 랜드사 {req.landcoCount}개
                              </span>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                요청일 {new Date(req.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs ${isDone ? 'text-gray-400' : 'text-gray-500'}`}>
                            <span>{getCountryName(req.destination_country)} {req.destination_city}</span>
                            <span>·</span>
                            <span>{formatDate(req.depart_date)} ~ {formatDate(req.return_date)}</span>
                            {req.hotel_grade ? <><span>·</span><span>{req.hotel_grade}성급</span></> : null}
                            <span>·</span>
                            <span>총 {calculateTotalPeople(req)}명</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-3">
                              {phase === 'ing' && (
                                <p className="text-[11px] text-gray-400">마감: {formatDate(req.deadline)}</p>
                              )}
                              {phase === 'pre' && dday !== null && (
                                <p className="text-[11px]" style={{ color: SUB_PHASE_COLORS.pre.border }}>출발까지 D-{dday}</p>
                              )}
                              {phase === 'payment_pending' && dday !== null && (
                                <p className="text-[11px] text-amber-600">출발까지 D-{dday}</p>
                              )}
                              {phase === 'mid' && dday !== null && (
                                <p className="text-[11px]" style={{ color: SUB_PHASE_COLORS.mid.border }}>귀국까지 D-{dday}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={e => { e.preventDefault(); e.stopPropagation(); setCopyTarget(req.id) }}
                                className="text-[11px] text-gray-400 hover:text-gray-600 font-medium px-2 py-0.5 rounded hover:bg-gray-100 transition-colors"
                              >
                                견적 복사
                              </button>
                              {(phase === 'ing' || phase === 'payment_pending') && (
                                <button
                                  onClick={e => { e.preventDefault(); e.stopPropagation(); setCancelTarget(req.id) }}
                                  className="text-[11px] text-red-400 hover:text-red-600 font-medium px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                                >
                                  견적 취소
                                </button>
                              )}
                            </div>
                          </div>
                          {hoveredId === req.id && req.selectedInfo && (
                            <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                              <span className="text-[11px] font-semibold text-gray-700">{req.selectedInfo.landcoName}</span>
                              {req.selectedInfo.total !== null && (
                                <>
                                  <span className="text-gray-200 text-xs">|</span>
                                  <span className="text-[11px] text-gray-500">
                                    총액 <span className="font-semibold text-gray-700">₩{req.selectedInfo.total.toLocaleString()}</span>
                                  </span>
                                </>
                              )}
                              {req.selectedInfo.per_person !== null && (
                                <>
                                  <span className="text-gray-200 text-xs">|</span>
                                  <span className="text-[11px] text-gray-500">
                                    1인당 <span className="font-semibold text-gray-700">₩{req.selectedInfo.per_person.toLocaleString()}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="text-gray-300 text-lg ml-3">›</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
