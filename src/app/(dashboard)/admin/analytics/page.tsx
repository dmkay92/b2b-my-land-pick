'use client'

import { useEffect, useState } from 'react'
import { DateRangePicker } from '@/components/DateRangePicker'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

type AnalyticsData = {
  period: { from: string; to: string }
  summary: { totalRequests: number; finalizedCount: number; closedCount: number; conversionRate: number; cancelRate: number }
  conversionMatrix: { createdMonth: string; total: number; snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[] }[]
  allMonths: string[]
  revenue: { totalGmv: number; totalLandcoQuote: number; totalAgencyCommission: number; totalPlatformFee: number; totalLandcoPayout: number }
  paymentStats: { paidCount: number; paidTotal: number; pendingCount: number; pendingTotal: number }
}

function formatMonth(ym: string) {
  return ym.slice(2).replace('-', '년 ') + '월'
}

const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#e11d48', '#14b8a6']

export default function AdminAnalyticsPage() {
  // 기본값: 최근 6개월
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const defaultFrom = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo = now.toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(f: string, t: string) {
    if (!f || !t) return
    setLoading(true)
    const res = await fetch(`/api/admin/analytics?from=${f}&to=${t}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load(from, to) }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">분석</h1>
        <div className="flex items-center gap-3">
          <DateRangePicker
            startDate={from}
            endDate={to}
            onChange={(s, e) => { setFrom(s); setTo(e) }}
            compact
          />
          <button
            onClick={() => load(from, to)}
            disabled={loading || !from || !to}
            className="px-4 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? '조회 중...' : '조회'}
          </button>
          {/* 빠른 선택 */}
          <div className="flex gap-1">
            {[
              { label: '1개월', months: 1 },
              { label: '3개월', months: 3 },
              { label: '6개월', months: 6 },
              { label: '1년', months: 12 },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => {
                  const t = new Date()
                  const f = new Date(t.getFullYear(), t.getMonth() - p.months + 1, 1)
                  const fStr = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`
                  const tStr = t.toISOString().slice(0, 10)
                  setFrom(fStr); setTo(tStr)
                  load(fStr, tStr)
                }}
                className="px-2.5 py-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>}

      {data && !loading && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-[10px] text-gray-400 mb-1">견적 요청</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.totalRequests}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-[10px] text-gray-400 mb-1">확정</p>
              <p className="text-2xl font-bold text-emerald-600">{data.summary.finalizedCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-[10px] text-gray-400 mb-1">체결률</p>
              <p className="text-2xl font-bold text-emerald-600">{data.summary.conversionRate}%</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-[10px] text-gray-400 mb-1">취소</p>
              <p className="text-2xl font-bold text-red-500">{data.summary.closedCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-[10px] text-gray-400 mb-1">취소율</p>
              <p className="text-2xl font-bold text-red-500">{data.summary.cancelRate}%</p>
            </div>
          </div>

          {/* 월별 체결률 추이 */}
          {data.conversionMatrix.length > 0 && (
            <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
              <div className="px-5 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center">
                <h2 className="text-xs font-bold text-white">월별 체결률 추이</h2>
              </div>
              <div className="bg-white overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[80px]">생성월</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-500 min-w-[50px]">건수</th>
                      {data.allMonths.map(m => (
                        <th key={m} className="text-center px-3 py-3 font-medium text-gray-500 min-w-[100px]">
                          {formatMonth(m)} 기준
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.conversionMatrix.map((row, ri) => (
                      <tr key={row.createdMonth} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3 sticky left-0 bg-inherit">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[ri % colors.length] }} />
                            <span className="font-bold text-gray-900">{formatMonth(row.createdMonth)}</span>
                          </div>
                        </td>
                        <td className="text-center px-3 py-3 font-medium text-gray-600">{row.total}건</td>
                        {data.allMonths.map((om, oi) => {
                          const snap = row.snapshots.find(s => s.observedMonth === om)
                          if (!snap) return <td key={om} className="text-center px-3 py-3 text-gray-200">-</td>
                          const prevSnap = oi > 0 ? row.snapshots.find(s => s.observedMonth === data.allMonths[oi - 1]) : null
                          const diff = prevSnap ? snap.rate - prevSnap.rate : 0
                          return (
                            <td key={om} className="text-center px-3 py-3">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-bold" style={{ color: colors[ri % colors.length] }}>{snap.rate}%</span>
                                  {diff > 0 && <span className="text-[9px] text-emerald-500 font-medium">+{diff}%</span>}
                                </div>
                                <div className="w-full max-w-[80px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${snap.rate}%`, backgroundColor: colors[ri % colors.length] }} />
                                </div>
                                <span className="text-[9px] text-gray-400">확정 {snap.finalized} · 취소 {snap.closed}</span>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 매출 + 결제 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 매출 */}
            <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center">
                <h2 className="text-xs font-bold text-white">매출</h2>
                <span className="text-[10px] text-gray-400 ml-2">기간 내 확정 견적 기준</span>
              </div>
              <div className="bg-white divide-y divide-gray-100">
                <div className="p-4">
                  <p className="text-[10px] text-gray-400 mb-1">총 GMV</p>
                  <p className="text-2xl font-bold text-gray-900">{fmt(data.revenue.totalGmv)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <div className="p-4">
                    <p className="text-[10px] text-gray-400 mb-1">랜드사 견적가</p>
                    <p className="text-lg font-bold text-gray-700">{fmt(data.revenue.totalLandcoQuote)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] text-gray-400 mb-1">여행사 커미션</p>
                    <p className="text-lg font-bold text-amber-600">{fmt(data.revenue.totalAgencyCommission)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <div className="p-4">
                    <p className="text-[10px] text-gray-400 mb-1">플랫폼 수수료</p>
                    <p className="text-base font-bold text-blue-600">{fmt(data.revenue.totalPlatformFee)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] text-gray-400 mb-1">랜드사 지급</p>
                    <p className="text-base font-bold text-gray-600">{fmt(data.revenue.totalLandcoPayout)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* 결제 */}
            <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center">
                <h2 className="text-xs font-bold text-white">결제</h2>
                <span className="text-[10px] text-gray-400 ml-2">기간 내 견적 기준</span>
              </div>
              <div className="bg-white divide-y divide-gray-100">
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <div className="p-4">
                    <p className="text-[10px] text-gray-400 mb-1">결제 완료</p>
                    <p className="text-xl font-bold text-emerald-600">{data.paymentStats.paidCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{fmt(data.paymentStats.paidTotal)}원</p>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] text-gray-400 mb-1">결제 대기</p>
                    <p className="text-xl font-bold text-amber-600">{data.paymentStats.pendingCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{fmt(data.paymentStats.pendingTotal)}원</p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[10px] text-gray-400 mb-1">결제율</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-bold text-gray-900">
                      {data.paymentStats.paidTotal + data.paymentStats.pendingTotal > 0
                        ? Math.round((data.paymentStats.paidTotal / (data.paymentStats.paidTotal + data.paymentStats.pendingTotal)) * 100)
                        : 0}%
                    </p>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${data.paymentStats.paidTotal + data.paymentStats.pendingTotal > 0 ? Math.round((data.paymentStats.paidTotal / (data.paymentStats.paidTotal + data.paymentStats.pendingTotal)) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{fmt(data.paymentStats.paidTotal)}원 / {fmt(data.paymentStats.paidTotal + data.paymentStats.pendingTotal)}원</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
