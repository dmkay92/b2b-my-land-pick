'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NoticeSection } from '@/components/NoticeSection'

function fmt(n: number | null | undefined) { return (n ?? 0).toLocaleString('ko-KR') }

export default function AgencyDashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<{
    quotes: {
      totalRequests: number
      thisMonthRequests: number
      lastMonthRequests: number
      conversionRate: number
      responseRate: number
      respondedCount: number
      conversionMatrix: { createdMonth: string; total: number; snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[] }[]
      byStatus: Record<string, number>
      closedCount?: number
    }
    payments: {
      pendingCount: number
      pendingTotal: number
      overdueCount: number
      paidCount: number
      paidTotal: number
      thisMonthPaidCount: number
      thisMonthPaidTotal: number
      pendingList: { id: string; label: string; amount: number; due_date: string; overdue: boolean; event_name: string; display_id: string; request_id: string }[]
    }
    revenue: {
      totalGmv: number
      totalLandcoQuote: number
      totalAgencyCommission: number
    }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agency/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
  if (!data) return <p className="p-8 text-gray-400">데이터를 불러올 수 없습니다.</p>

  const { quotes, payments, revenue } = data
  const closedCount = quotes.byStatus.closed ?? 0
  const cancelRate = quotes.totalRequests > 0 ? Math.round((closedCount / quotes.totalRequests) * 100) : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">대시보드</h1>

      <div className="mb-6">
        <NoticeSection />
      </div>

      {/* 견적 현황 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-gray-900 text-white px-5 py-3 text-sm font-bold">견적 현황</div>
        <div className="grid grid-cols-5 divide-x divide-gray-100">
          <div className="p-5">
            <p className="text-xs text-gray-400 mb-1">총 견적 요청</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(quotes.totalRequests)}</p>
            <p className="text-[11px] text-gray-400 mt-1">이번 달 {fmt(quotes.thisMonthRequests)}건</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-400 mb-1">이번 달 견적 요청</p>
            <p className="text-2xl font-bold text-blue-600">{fmt(quotes.thisMonthRequests)}</p>
            <p className="text-[11px] text-gray-400 mt-1">지난달 {fmt(quotes.lastMonthRequests)}건</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-400 mb-1">체결률</p>
            <p className="text-2xl font-bold text-green-600">{quotes.conversionRate}%</p>
            <p className="text-[11px] text-gray-400 mt-1">체결 {fmt(quotes.byStatus.finalized ?? 0)} / 전체 {fmt(quotes.totalRequests)}건</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-400 mb-1">견적 응답률</p>
            <p className="text-2xl font-bold text-purple-600">{quotes.responseRate}%</p>
            <p className="text-[11px] text-gray-400 mt-1">응답 {fmt(quotes.respondedCount)} / 전체 {fmt(quotes.totalRequests)}건</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-400 mb-1">취소율</p>
            <p className="text-2xl font-bold text-red-500">{cancelRate}%</p>
            <p className="text-[11px] text-gray-400 mt-1">취소 {fmt(closedCount)} / 전체 {fmt(quotes.totalRequests)}건</p>
          </div>
        </div>
      </div>

      {/* 월별 체결률 추이 */}
      {(quotes.conversionMatrix ?? []).length > 0 && (() => {
        const matrix = quotes.conversionMatrix
        const allObservedMonths = [...new Set(matrix.flatMap(m => m.snapshots.map(s => s.observedMonth)))].sort()
        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
        return (
          <div className="rounded-xl border border-gray-200 shadow-sm mb-6">
            <div className="px-5 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center rounded-t-xl">
              <h2 className="text-xs font-bold text-white">월별 체결률 추이</h2>
              <span className="text-[10px] text-gray-400 ml-2">생성월별 체결률이 시간에 따라 어떻게 변화하는지</span>
            </div>
            <div className="bg-white rounded-b-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[80px]">생성월</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-500 min-w-[50px]">건수</th>
                    {allObservedMonths.map(m => (
                      <th key={m} className="text-center px-3 py-3 font-medium text-gray-500 min-w-[100px]">
                        {m.slice(2).replace('.', '년 ')}월 기준
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, ri) => (
                    <tr key={row.createdMonth} className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={() => {
                      const [y, m] = row.createdMonth.split('.')
                      const from = `${y}-${m}-01`
                      const end = new Date(Number(y), Number(m), 0)
                      const to = `${y}-${m}-${String(end.getDate()).padStart(2, '0')}`
                      router.push(`/agency/requests?from=${from}&to=${to}`)
                    }}>
                      <td className="px-4 py-3 sticky left-0 bg-inherit">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[ri % colors.length] }} />
                          <span className="font-bold text-gray-900">{row.createdMonth.slice(2).replace('.', '년 ')}월</span>
                        </div>
                      </td>
                      <td className="text-center px-3 py-3 font-medium text-gray-600">{row.total}건</td>
                      {allObservedMonths.map((om, oi) => {
                        const snap = row.snapshots.find(s => s.observedMonth === om)
                        if (!snap) return <td key={om} className="text-center px-3 py-3 text-gray-200">-</td>
                        const prevSnap = oi > 0 ? row.snapshots.find(s => s.observedMonth === allObservedMonths[oi - 1]) : null
                        const diff = prevSnap ? snap.rate - prevSnap.rate : 0
                        return (
                          <td key={om} className="text-center px-3 py-3">
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-bold" style={{ color: colors[ri % colors.length] }}>{snap.rate}%</span>
                                {diff > 0 && <span className="text-[9px] text-emerald-500 font-medium">+{diff}%</span>}
                                {diff < 0 && <span className="text-[9px] text-red-500 font-medium">{diff}%</span>}
                              </div>
                              <div className="w-full max-w-[80px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${snap.rate}%`, backgroundColor: colors[ri % colors.length] }} />
                              </div>
                              <span className="text-[9px] text-gray-400">체결 {snap.finalized} · 취소 {snap.closed}</span>
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
        )
      })()}

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* 결제 현황 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-900 text-white px-5 py-3 text-sm font-bold">결제 현황</div>
          <div className="grid grid-cols-2 gap-px bg-gray-100">
            <div className="bg-white p-5 flex flex-col justify-center" style={{ minHeight: 88 }}>
              <p className="text-xs text-gray-400 mb-1">결제 대기</p>
              <p className="text-xl font-bold text-gray-900">{fmt(payments.pendingCount)}<span className="text-sm font-normal text-gray-400"> 건</span></p>
              <p className="text-[11px] text-gray-400 mt-1">{fmt(payments.pendingTotal)}원</p>
            </div>
            <div className="bg-white p-5 flex flex-col justify-center" style={{ minHeight: 88 }}>
              <p className="text-xs text-gray-400 mb-1">기한 초과</p>
              <p className="text-xl font-bold text-red-500">{fmt(payments.overdueCount)}<span className="text-sm font-normal text-gray-400"> 건</span></p>
            </div>
            <div className="bg-white p-5 flex flex-col justify-center" style={{ minHeight: 88 }}>
              <p className="text-xs text-gray-400 mb-1">이번 달 결제</p>
              <p className="text-xl font-bold text-blue-600">{fmt(payments.thisMonthPaidCount)}<span className="text-sm font-normal text-gray-400"> 건</span></p>
              <p className="text-[11px] text-gray-400 mt-1">{fmt(payments.thisMonthPaidTotal)}원</p>
            </div>
            <div className="bg-white p-5 flex flex-col justify-center" style={{ minHeight: 88 }}>
              <p className="text-xs text-gray-400 mb-1">총 결제 완료</p>
              <p className="text-xl font-bold text-gray-900">{fmt(payments.paidCount)}<span className="text-sm font-normal text-gray-400"> 건</span></p>
              <p className="text-[11px] text-gray-400 mt-1">{fmt(payments.paidTotal)}원</p>
            </div>
          </div>
        </div>

        {/* 매출 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-900 text-white px-5 py-3 text-sm font-bold">매출</div>
          <div className="grid grid-cols-2 gap-px bg-gray-100">
            <div className="bg-white p-5 col-span-2 flex flex-col justify-center" style={{ minHeight: 108 }}>
              <p className="text-xs text-gray-400 mb-1">총 GMV</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(revenue.totalGmv)}<span className="text-sm font-normal text-gray-400"> 원</span></p>
            </div>
            <div className="bg-white p-5 flex flex-col justify-center" style={{ minHeight: 88 }}>
              <p className="text-xs text-gray-400 mb-1">랜드사 견적가</p>
              <p className="text-xl font-bold text-gray-900">{fmt(revenue.totalLandcoQuote)}<span className="text-sm font-normal text-gray-400"> 원</span></p>
            </div>
            <div className="bg-white p-5 flex flex-col justify-center" style={{ minHeight: 88 }}>
              <p className="text-xs text-blue-500 mb-1">여행사 커미션</p>
              <p className="text-xl font-bold text-blue-700">{fmt(revenue.totalAgencyCommission)}<span className="text-sm font-normal text-blue-400"> 원</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* 결제 대기 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">결제 대기 <span className="text-gray-400 font-normal">(납부기한순, 최대 10건)</span></h3>
        </div>
        {(payments.pendingList ?? []).length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                <th className="text-left px-5 py-2.5 font-medium">견적번호</th>
                <th className="text-left px-5 py-2.5 font-medium">행사명</th>
                <th className="text-left px-5 py-2.5 font-medium">회차</th>
                <th className="text-right px-5 py-2.5 font-medium">금액</th>
                <th className="text-right px-5 py-2.5 font-medium">납부기한</th>
              </tr>
            </thead>
            <tbody>
              {payments.pendingList.map(item => (
                <tr
                  key={item.id}
                  className="border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                  onClick={() => window.location.href = `/agency/requests/${item.request_id}`}
                >
                  <td className="px-5 py-3 text-gray-400 font-mono">{item.display_id || '-'}</td>
                  <td className="px-5 py-3 text-gray-800 font-medium">{item.event_name}</td>
                  <td className="px-5 py-3 text-gray-600">{item.label}</td>
                  <td className="px-5 py-3 text-right text-gray-800 font-medium">{fmt(item.amount)}원</td>
                  <td className="px-5 py-3 text-right">
                    <span className={item.overdue ? 'text-red-500 font-semibold' : 'text-gray-600'}>
                      {item.due_date}
                      {item.overdue && ' (초과)'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">결제 대기 건이 없습니다.</p>
        )}
      </div>

    </div>
  )
}
