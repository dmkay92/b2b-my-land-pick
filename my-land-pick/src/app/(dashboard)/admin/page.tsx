'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
import CitySearchSelect from '@/components/CitySearchSelect'

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([])
  const [agencyCount, setAgencyCount] = useState(0)
  const [landcoCount, setLandcoCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pendingInstallments, setPendingInstallments] = useState<{ label: string; event_name: string; amount: number; due_date: string; id: string; status: string; agency_name: string; request_id: string; display_id: string | null; request_display_id: string | null }[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [actingPayment, setActingPayment] = useState(false)
  // 대시보드 KPI
  type DashboardData = {
    quotes: {
      totalRequests: number; todayRequests: number; yesterdayRequests: number; thisMonthRequests: number; lastMonthRequests: number; totalQuotes: number; conversionRate: number; responseRate: number; respondedCount: number; byStatus: Record<string, number>
      monthlyConversion: { month: string; total: number; finalized: number; closed: number; rate: number }[]
      conversionMatrix: { createdMonth: string; total: number; snapshots: { observedMonth: string; finalized: number; closed: number; rate: number }[] }[]
    }
    payments: { pendingCount: number; pendingTotal: number; overdueCount: number; paidCount: number; paidTotal: number; thisMonthPaidCount: number; thisMonthPaidTotal: number }
    settlements: { totalGmv: number; totalLandcoQuote: number; totalAgencyCommission: number; totalPlatformFee: number; totalNetRevenue: number; totalLandcoPayout: number; totalAgencyPayout: number }
  }
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

  // 상세 모달
  const [detailModal, setDetailModal] = useState<{ user: Profile } | null>(null)
  const [editServiceAreas, setEditServiceAreas] = useState<{ country: string; city: string }[]>([])
  const [saCountry, setSaCountry] = useState('')
  const [saCities, setSaCities] = useState<string[]>([])
  const [availableCountries, setAvailableCountries] = useState<{ code: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<{ biz: string | null; bank: string | null }>({ biz: null, bank: null })

  useEffect(() => {
    fetch('/api/cities').then(r => r.json()).then(d => setAvailableCountries(d.countries ?? []))
  }, [])

  const getCountryName = (code: string) => availableCountries.find(c => c.code === code)?.name || code

  async function openDetailModal(user: Profile) {
    setEditServiceAreas(user.service_areas ?? [])
    setSaCountry('')
    setSaCities([])
    setSignedUrls({ biz: null, bank: null })
    setDetailModal({ user })

    const [bizResult, bankResult] = await Promise.all([
      user.document_biz_url
        ? supabase.storage.from('signup-documents').createSignedUrl(user.document_biz_url, 60 * 10)
        : Promise.resolve({ data: null }),
      user.document_bank_url
        ? supabase.storage.from('signup-documents').createSignedUrl(user.document_bank_url, 60 * 10)
        : Promise.resolve({ data: null }),
    ])
    setSignedUrls({
      biz: bizResult.data?.signedUrl ?? null,
      bank: bankResult.data?.signedUrl ?? null,
    })
  }

  useEffect(() => {
    async function fetchData() {
      const [{ data: pending }, { count: aCnt }, { count: lCnt }] = await Promise.all([
        supabase.from('profiles').select('*').eq('status', 'pending').neq('role', 'admin'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'agency').eq('status', 'approved'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'landco').eq('status', 'approved'),
      ])
      // PII 복호화 (서버 경유)
      if (pending && pending.length > 0) {
        const res = await fetch('/api/admin/decrypt-profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profiles: pending }),
        })
        if (res.ok) {
          const { profiles: decrypted } = await res.json()
          setPendingUsers(decrypted)
        } else {
          setPendingUsers(pending)
        }
      } else {
        setPendingUsers(pending ?? [])
      }
      setAgencyCount(aCnt ?? 0)
      setLandcoCount(lCnt ?? 0)

      // 대시보드 KPI
      const dashRes = await fetch('/api/admin/dashboard')
      if (dashRes.ok) {
        const data = await dashRes.json()
        setDashboard(data)
      }

      // 결제 리스트 (결제 대기 / 최근 결제)
      const payRes = await fetch('/api/admin/payments?status=pending')
      if (payRes.ok) {
        const { installments } = await payRes.json()
        setPendingInstallments(
          (installments ?? [])
            .sort((a: { due_date: string }, b: { due_date: string }) => a.due_date.localeCompare(b.due_date))
            .slice(0, 10)
            .map((i: Record<string, unknown>) => {
              const ps = i.payment_schedules as Record<string, unknown> | undefined
              const qr = ps?.quote_requests as Record<string, unknown> | undefined
              const prof = qr?.profiles as Record<string, unknown> | undefined
              return {
                id: i.id as string, label: i.label as string, amount: i.amount as number, due_date: i.due_date as string, status: i.status as string, display_id: i.display_id as string | null,
                event_name: (qr?.event_name as string) ?? '-',
                agency_name: (prof?.company_name as string) ?? '-',
                request_id: (ps?.request_id as string) ?? '',
                request_display_id: (qr?.display_id as string | null) ?? null,
              }
            })
        )
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  async function handleApprove(userId: string, status: 'approved' | 'rejected') {
    setSaving(true)
    setSaveError(null)
    const res = await fetch('/api/admin/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status }),
    })
    setSaving(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setSaveError(json.error ?? '처리 중 오류가 발생했습니다.')
      return
    }
    const user = pendingUsers.find(u => u.id === userId)
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
    if (status === 'approved' && user?.role === 'agency') setAgencyCount(c => c + 1)
    setDetailModal(null)
  }

  async function handleApproveWithCountries() {
    if (!detailModal) return
    setSaving(true)
    setSaveError(null)
    const { user } = detailModal
    const countryCodes = [...new Set(editServiceAreas.map(a => a.country))]
    const [approveRes, countryRes] = await Promise.all([
      fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, status: 'approved' }),
      }),
      fetch('/api/admin/assign-countries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landcoId: user.id, countryCodes, serviceAreas: editServiceAreas }),
      }),
    ])
    setSaving(false)
    if (!approveRes.ok || !countryRes.ok) {
      setSaveError('처리 중 오류가 발생했습니다. 다시 시도해주세요.')
      return
    }
    setPendingUsers(prev => prev.filter(u => u.id !== user.id))
    setLandcoCount(c => c + 1)
    setDetailModal(null)
  }

  const pendingAgencies = pendingUsers.filter(u => u.role === 'agency')
  const pendingLandcos = pendingUsers.filter(u => u.role === 'landco')

  if (loading) return <div className="p-8 text-gray-500">로딩 중...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">관리자 대시보드</h1>

      {dashboard && (
        <>
        {/* 견적 현황 */}
        <div className="rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="px-5 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center rounded-t-xl">
            <h2 className="text-xs font-bold text-white">견적 현황</h2>
          </div>
          <div className="grid grid-cols-5 divide-x divide-gray-100 bg-white rounded-b-xl">
            <button onClick={() => {
              const t = new Date().toISOString().slice(0, 10)
              router.push(`/admin/quotes?from=${t}&to=${t}`)
            }} className="p-4 text-left hover:bg-gray-50 transition-colors">
              <p className="text-[10px] text-gray-400 mb-1">오늘 견적 요청</p>
              <p className="text-2xl font-bold text-gray-900">{dashboard.quotes.todayRequests}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">어제 {dashboard.quotes.yesterdayRequests}건</p>
            </button>
            <button onClick={() => {
              const now = new Date()
              const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
              const to = now.toISOString().slice(0, 10)
              router.push(`/admin/quotes?from=${from}&to=${to}`)
            }} className="p-4 text-left hover:bg-gray-50 transition-colors">
              <p className="text-[10px] text-gray-400 mb-1">이번 달 견적 요청</p>
              <p className="text-2xl font-bold text-blue-600">{dashboard.quotes.thisMonthRequests}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">지난달 {dashboard.quotes.lastMonthRequests}건</p>
            </button>
            <div className="p-4">
              <p className="text-[10px] text-gray-400 mb-1">전체 체결률</p>
              <p className="text-2xl font-bold text-emerald-600">{dashboard.quotes.conversionRate}%</p>
              <p className="text-[10px] text-gray-400 mt-0.5">체결 {dashboard.quotes.byStatus.finalized ?? 0} / 전체 {dashboard.quotes.totalRequests}건</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] text-gray-400 mb-1">견적 응답률</p>
              <p className="text-2xl font-bold text-blue-600">{dashboard.quotes.responseRate}%</p>
              <p className="text-[10px] text-gray-400 mt-0.5">응답 {dashboard.quotes.respondedCount} / 전체 {dashboard.quotes.totalRequests}건</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] text-gray-400 mb-1">취소율</p>
              <p className="text-2xl font-bold text-red-500">{dashboard.quotes.totalRequests > 0 ? Math.round(((dashboard.quotes.byStatus.closed ?? 0) / dashboard.quotes.totalRequests) * 100) : 0}%</p>
              <p className="text-[10px] text-gray-400 mt-0.5">취소 {dashboard.quotes.byStatus.closed ?? 0} / 전체 {dashboard.quotes.totalRequests}건</p>
            </div>
          </div>
        </div>

        {/* 월별 체결률 추이 */}
        {dashboard.quotes.conversionMatrix.length > 0 && (() => {
          const matrix = dashboard.quotes.conversionMatrix
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
                        router.push(`/admin/quotes?from=${from}&to=${to}`)
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
                          // 이전 스냅샷 대비 변화
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
          )
        })()}

        {/* 결제 & 매출 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-gray-200 shadow-sm flex flex-col h-full">
            <div className="px-5 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center rounded-t-xl shrink-0">
              <h2 className="text-xs font-bold text-white">결제 현황</h2>
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-100 bg-white flex-1">
              <button onClick={() => router.push('/admin/payments')} className="p-4 text-left hover:bg-gray-50 transition-colors">
                <p className="text-[10px] text-gray-400 mb-1">결제 대기</p>
                <p className="text-xl font-bold text-amber-600">{dashboard.payments.pendingCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
                <p className="text-[10px] text-gray-500 mt-0.5">{dashboard.payments.pendingTotal.toLocaleString('ko-KR')}원</p>
              </button>
              <button onClick={() => router.push('/admin/payments')} className="p-4 text-left hover:bg-gray-50 transition-colors">
                <p className="text-[10px] text-gray-400 mb-1">기한 초과</p>
                <p className={`text-xl font-bold ${dashboard.payments.overdueCount > 0 ? 'text-red-500' : 'text-gray-300'}`}>{dashboard.payments.overdueCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
              </button>
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-100 bg-white border-t border-gray-100 rounded-b-xl flex-1">
              <div className="p-4">
                <p className="text-[10px] text-gray-400 mb-1">이번 달 결제</p>
                <p className="text-xl font-bold text-emerald-600">{dashboard.payments.thisMonthPaidCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
                <p className="text-[10px] text-gray-500 mt-0.5">{dashboard.payments.thisMonthPaidTotal.toLocaleString('ko-KR')}원</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] text-gray-400 mb-1">총 결제 완료</p>
                <p className="text-xl font-bold text-gray-900">{dashboard.payments.paidCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
                <p className="text-[10px] text-gray-500 mt-0.5">{dashboard.payments.paidTotal.toLocaleString('ko-KR')}원</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center">
              <h2 className="text-xs font-bold text-white">매출</h2>
            </div>
            <div className="bg-white divide-y divide-gray-100">
              <div className="p-4">
                <p className="text-[10px] text-gray-400 mb-1">총 GMV <span className="text-gray-300">(랜드사 견적가 + 여행사 커미션)</span></p>
                <p className="text-2xl font-bold text-gray-900">{dashboard.settlements.totalGmv.toLocaleString('ko-KR')}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-100">
                <div className="p-4">
                  <p className="text-[10px] text-gray-400 mb-1">랜드사 견적가</p>
                  <p className="text-lg font-bold text-gray-700">{dashboard.settlements.totalLandcoQuote.toLocaleString('ko-KR')}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                </div>
                <div className="p-4">
                  <p className="text-[10px] text-gray-400 mb-1">여행사 커미션</p>
                  <p className="text-lg font-bold text-amber-600">{dashboard.settlements.totalAgencyCommission.toLocaleString('ko-KR')}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-100 rounded-b-xl">
                <div className="p-4">
                  <p className="text-[10px] text-gray-400 mb-1">플랫폼 수수료</p>
                  <p className="text-base font-bold text-blue-600">{dashboard.settlements.totalPlatformFee.toLocaleString('ko-KR')}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                </div>
                <div className="p-4">
                  <p className="text-[10px] text-gray-400 mb-1">랜드사 지급</p>
                  <p className="text-base font-bold text-gray-600">{dashboard.settlements.totalLandcoPayout.toLocaleString('ko-KR')}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>

        </>
      )}

      {/* 결제 대기 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">결제 대기 <span className="text-gray-400 font-normal">(납부기한순, 최대 10건)</span></h3>
          <button onClick={() => router.push('/admin/payments')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">전체보기</button>
        </div>
        {pendingInstallments.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                <th className="text-left px-5 py-2.5 font-medium">견적번호</th>
                <th className="text-left px-5 py-2.5 font-medium">행사명</th>
                <th className="text-left px-5 py-2.5 font-medium">여행사</th>
                <th className="text-left px-5 py-2.5 font-medium">회차</th>
                <th className="text-right px-5 py-2.5 font-medium">금액</th>
                <th className="text-center px-5 py-2.5 font-medium">납부기한</th>
                <th className="text-center px-5 py-2.5 font-medium">상태</th>
                <th className="text-center px-5 py-2.5 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {pendingInstallments.map(inst => {
                const today = new Date().toISOString().slice(0, 10)
                const daysLeft = Math.ceil((new Date(inst.due_date).getTime() - new Date(today).getTime()) / 86400000)
                const isOverdue = daysLeft < 0
                return (
                  <tr
                    key={inst.id}
                    className="border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/admin/requests/${inst.request_id}`)}
                  >
                    <td className="px-5 py-3 text-gray-400 font-mono">{inst.request_display_id || '-'}</td>
                    <td className="px-5 py-3 text-gray-800 font-medium max-w-[200px] truncate">{inst.event_name}</td>
                    <td className="px-5 py-3 text-gray-600">{inst.agency_name}</td>
                    <td className="px-5 py-3 text-gray-600">{inst.label}</td>
                    <td className="px-5 py-3 text-right text-gray-800 font-medium">{inst.amount.toLocaleString('ko-KR')}원</td>
                    <td className="px-5 py-3 text-center">
                      <span className={isOverdue ? 'text-red-500 font-semibold' : daysLeft <= 3 ? 'text-amber-500 font-medium' : 'text-gray-500'}>
                        {inst.due_date} ({isOverdue ? `D+${Math.abs(daysLeft)}` : `D-${daysLeft}`})
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {inst.status === 'verifying'
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">입금 확인 중</span>
                        : inst.status === 'overdue'
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">기한초과</span>
                        : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">결제대기</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmingId(inst.id) }}
                        disabled={actingPayment}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        결제완료
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">결제 대기 건이 없습니다.</p>
        )}
      </div>

      {/* 결제완료 확인 모달 */}
      {confirmingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">결제완료 처리</h3>
            </div>
            <div className="px-5 py-5">
              <p className="text-sm text-gray-700">해당 건을 결제완료 처리하시겠습니까?</p>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setConfirmingId(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setActingPayment(true)
                  await fetch('/api/admin/payments', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ installmentId: confirmingId, action: 'paid' }),
                  })
                  setConfirmingId(null)
                  setActingPayment(false)
                  setPendingInstallments(prev => prev.filter(i => i.id !== confirmingId))
                }}
                disabled={actingPayment}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
              >
                {actingPayment ? '처리 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회원 현황 + 승인 대기 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 shadow-sm">
          <button onClick={() => router.push('/admin/agencies')} className="w-full px-5 h-10 flex items-center justify-between bg-gradient-to-r from-gray-900 to-gray-800 rounded-t-xl hover:from-gray-800 hover:to-gray-700 transition-colors">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white">여행사</h3>
              <span className="text-xs font-bold text-white">{agencyCount}<span className="text-[10px] font-normal text-gray-300 ml-0.5">개사</span></span>
            </div>
            {pendingAgencies.length > 0 && <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full">승인대기 {pendingAgencies.length}</span>}
          </button>
          <div className="bg-white rounded-b-xl">
            {pendingAgencies.length === 0 ? (
              <p className="text-gray-300 text-xs text-center py-4">승인 대기 없음</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {pendingAgencies.slice(0, 5).map(user => (
                  <div key={user.id} onClick={() => openDetailModal(user)} className="px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.company_name}</p>
                        <p className="text-[10px] text-gray-400">{user.representative_name ?? user.email}</p>
                      </div>
                      <p className="text-[10px] text-gray-300">{new Date(user.created_at).toLocaleDateString('ko-KR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 shadow-sm">
          <button onClick={() => router.push('/admin/landcos')} className="w-full px-5 h-10 flex items-center justify-between bg-gradient-to-r from-gray-900 to-gray-800 rounded-t-xl hover:from-gray-800 hover:to-gray-700 transition-colors">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white">랜드사</h3>
              <span className="text-xs font-bold text-white">{landcoCount}<span className="text-[10px] font-normal text-gray-300 ml-0.5">개사</span></span>
            </div>
            {pendingLandcos.length > 0 && <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full">승인대기 {pendingLandcos.length}</span>}
          </button>
          <div className="bg-white rounded-b-xl">
            {pendingLandcos.length === 0 ? (
              <p className="text-gray-300 text-xs text-center py-4">승인 대기 없음</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {pendingLandcos.slice(0, 5).map(user => (
                  <div key={user.id} onClick={() => openDetailModal(user)} className="px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.company_name}</p>
                        <p className="text-[10px] text-gray-400">{user.representative_name ?? user.email}</p>
                      </div>
                      <p className="text-[10px] text-gray-300">{new Date(user.created_at).toLocaleDateString('ko-KR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 상세 모달 */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">{detailModal.user.company_name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {detailModal.user.role === 'agency' ? '여행사' : '랜드사'} · 신청일 {new Date(detailModal.user.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* 기본 정보 */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">기본 정보</h4>
                <dl className="space-y-1.5">
                  <InfoRow label="이메일" value={detailModal.user.email} />
                  <InfoRow label="사업자등록번호" value={detailModal.user.business_registration_number} />
                  <InfoRow label="대표자명" value={detailModal.user.representative_name} />
                  <InfoRow label="유선" value={detailModal.user.phone_landline} />
                  <InfoRow label="휴대폰" value={detailModal.user.phone_mobile} />
                </dl>
              </section>

              {/* 계좌 정보 */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">정산 계좌</h4>
                <dl className="space-y-1.5">
                  <InfoRow label="은행" value={detailModal.user.bank_name} />
                  <InfoRow label="계좌번호" value={detailModal.user.bank_account} />
                  <InfoRow label="예금주" value={detailModal.user.bank_holder} />
                </dl>
              </section>

              {/* 서류 */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">첨부 서류</h4>
                <div className="flex gap-2">
                  {signedUrls.biz ? (
                    <a
                      href={signedUrls.biz}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-xs text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors"
                    >
                      사업자등록증 ↗
                    </a>
                  ) : detailModal.user.document_biz_url ? (
                    <span className="flex-1 text-center text-xs text-gray-400 border border-gray-100 rounded-lg py-2">로딩 중...</span>
                  ) : (
                    <span className="flex-1 text-center text-xs text-gray-300 border border-gray-100 rounded-lg py-2">사업자등록증 없음</span>
                  )}
                  {signedUrls.bank ? (
                    <a
                      href={signedUrls.bank}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-xs text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors"
                    >
                      통장 사본 ↗
                    </a>
                  ) : detailModal.user.document_bank_url ? (
                    <span className="flex-1 text-center text-xs text-gray-400 border border-gray-100 rounded-lg py-2">로딩 중...</span>
                  ) : (
                    <span className="flex-1 text-center text-xs text-gray-300 border border-gray-100 rounded-lg py-2">통장 사본 없음</span>
                  )}
                </div>
              </section>

              {/* 랜드사 담당 지역 */}
              {detailModal.user.role === 'landco' && (
                <section>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">담당 지역</h4>

                  {editServiceAreas.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {Object.entries(
                        editServiceAreas.reduce<Record<string, string[]>>((acc, a) => {
                          if (!acc[a.country]) acc[a.country] = []
                          acc[a.country].push(a.city)
                          return acc
                        }, {})
                      ).map(([country, cities]) => (
                        <div key={country} className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-[10px] font-bold text-gray-400 mb-1.5">{getCountryName(country)}</p>
                          <div className="flex flex-wrap gap-1">
                            {cities.map(city => (
                              <span key={city} className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-700 text-[11px] px-2 py-0.5 rounded-full">
                                {city}
                                <button
                                  onClick={() => setEditServiceAreas(prev => prev.filter(a => !(a.country === country && a.city === city)))}
                                  className="text-blue-300 hover:text-blue-600"
                                >&times;</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {editServiceAreas.length === 0 && (
                    <p className="text-xs text-gray-300 mb-3">등록된 담당 지역이 없습니다.</p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <select
                        value={saCountry}
                        onChange={e => { setSaCountry(e.target.value); setSaCities([]) }}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-blue-400 bg-white"
                      >
                        <option value="">국가 선택</option>
                        {availableCountries.map(c => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      {saCountry ? (
                        <CitySearchSelect
                          countryCode={saCountry}
                          selected={saCities}
                          onChange={v => setSaCities(v as string[])}
                          multiple
                          placeholder="도시 검색"
                        />
                      ) : (
                        <input disabled placeholder="국가를 먼저 선택" className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-gray-50 text-gray-300" />
                      )}
                    </div>
                  </div>
                  {saCities.length > 0 && (
                    <button
                      onClick={() => {
                        const newAreas = saCities
                          .filter(city => !editServiceAreas.some(a => a.country === saCountry && a.city === city))
                          .map(city => ({ country: saCountry, city }))
                        setEditServiceAreas(prev => [...prev, ...newAreas])
                        setSaCities([])
                        setSaCountry('')
                      }}
                      className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      + {saCities.length}개 도시 추가
                    </button>
                  )}
                  {editServiceAreas.length === 0 && (
                    <p className="text-xs text-amber-500 mt-2">승인 시 담당 지역을 1개 이상 선택해주세요.</p>
                  )}
                </section>
              )}
            </div>

            {/* 에러 메시지 */}
            {saveError && (
              <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                {saveError}
              </div>
            )}
            {/* 하단 버튼 */}
            <div className="flex gap-2 px-6 pb-6 pt-2">
              <button
                onClick={() => handleApprove(detailModal.user.id, 'rejected')}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {saving ? '처리 중...' : '거절'}
              </button>
              {detailModal.user.role === 'landco' ? (
                <button
                  onClick={handleApproveWithCountries}
                  disabled={saving || editServiceAreas.length === 0}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-40"
                >
                  {saving ? '처리 중...' : '승인'}
                </button>
              ) : (
                <button
                  onClick={() => handleApprove(detailModal.user.id, 'approved')}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
                >
                  {saving ? '처리 중...' : '승인'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="text-xs text-gray-400 w-24 shrink-0">{label}</dt>
      <dd className="text-xs text-gray-700 break-all">{value || <span className="text-gray-300">-</span>}</dd>
    </div>
  )
}
