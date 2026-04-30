'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

const COUNTRY_OPTIONS = [
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'VN', name: '베트남' },
  { code: 'FR', name: '프랑스' },
]

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([])
  const [agencyCount, setAgencyCount] = useState(0)
  const [landcoCount, setLandcoCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [paymentPending, setPaymentPending] = useState<{ count: number; total: number }>({ count: 0, total: 0 })
  const [paymentOverdue, setPaymentOverdue] = useState(0)
  const [monthlyPaid, setMonthlyPaid] = useState<{ count: number; total: number }>({ count: 0, total: 0 })
  const [totalGmv, setTotalGmv] = useState(0)
  const [pendingInstallments, setPendingInstallments] = useState<{ label: string; event_name: string; amount: number; due_date: string; id: string }[]>([])
  const [recentPaid, setRecentPaid] = useState<{ label: string; event_name: string; amount: number; paid_at: string }[]>([])

  // 상세 모달
  const [detailModal, setDetailModal] = useState<{ user: Profile } | null>(null)
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<{ biz: string | null; bank: string | null }>({ biz: null, bank: null })

  async function openDetailModal(user: Profile) {
    setSelectedCodes([])
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
      setPendingUsers(pending ?? [])
      setAgencyCount(aCnt ?? 0)
      setLandcoCount(lCnt ?? 0)

      // 결제 데이터
      const payRes = await fetch('/api/admin/payments?status=pending')
      if (payRes.ok) {
        const { installments } = await payRes.json()
        const today = new Date().toISOString().slice(0, 10)
        const overdueCount = (installments ?? []).filter((i: { due_date: string; status: string }) => i.due_date < today || i.status === 'overdue').length
        const pendingTotal = (installments ?? []).reduce((s: number, i: { amount: number }) => s + i.amount, 0)
        setPaymentPending({ count: (installments ?? []).length, total: pendingTotal })
        setPaymentOverdue(overdueCount)
        setPendingInstallments(
          (installments ?? [])
            .sort((a: { due_date: string }, b: { due_date: string }) => a.due_date.localeCompare(b.due_date))
            .slice(0, 5)
            .map((i: { id: string; label: string; amount: number; due_date: string; payment_schedules?: { quote_requests?: { event_name?: string } } }) => ({
              id: i.id,
              label: i.label,
              event_name: i.payment_schedules?.quote_requests?.event_name ?? '-',
              amount: i.amount,
              due_date: i.due_date,
            }))
        )
      }

      const paidRes = await fetch('/api/admin/payments?status=paid')
      if (paidRes.ok) {
        const { installments: paidList } = await paidRes.json()
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const thisMonthPaid = (paidList ?? []).filter((i: { paid_at: string | null }) => i.paid_at && i.paid_at >= monthStart)
        const monthTotal = thisMonthPaid.reduce((s: number, i: { amount: number }) => s + i.amount, 0)
        setMonthlyPaid({ count: thisMonthPaid.length, total: monthTotal })
        setTotalGmv((paidList ?? []).reduce((s: number, i: { amount: number }) => s + i.amount, 0))
        setRecentPaid(
          (paidList ?? [])
            .filter((i: { paid_at: string | null }) => i.paid_at)
            .sort((a: { paid_at: string }, b: { paid_at: string }) => b.paid_at.localeCompare(a.paid_at))
            .slice(0, 5)
            .map((i: { label: string; amount: number; paid_at: string; payment_schedules?: { quote_requests?: { event_name?: string } } }) => ({
              label: i.label,
              event_name: i.payment_schedules?.quote_requests?.event_name ?? '-',
              amount: i.amount,
              paid_at: i.paid_at,
            }))
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
    const [approveRes, countryRes] = await Promise.all([
      fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, status: 'approved' }),
      }),
      fetch('/api/admin/assign-countries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landcoId: user.id, countryCodes: selectedCodes }),
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
      <h1 className="text-2xl font-bold mb-8">관리자 대시보드</h1>

      {/* 현황 카드 — 회원 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button onClick={() => router.push('/admin/agencies')} className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow cursor-pointer">
          <p className="text-sm text-gray-400 mb-1">여행사</p>
          <p className="text-3xl font-bold text-gray-800">{agencyCount}<span className="text-base font-normal text-gray-400 ml-1">개사 승인</span></p>
          {pendingAgencies.length > 0 && (
            <p className="text-xs text-amber-500 mt-1">대기 {pendingAgencies.length}건</p>
          )}
        </button>
        <button onClick={() => router.push('/admin/landcos')} className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow cursor-pointer">
          <p className="text-sm text-gray-400 mb-1">랜드사</p>
          <p className="text-3xl font-bold text-gray-800">{landcoCount}<span className="text-base font-normal text-gray-400 ml-1">개사 승인</span></p>
          {pendingLandcos.length > 0 && (
            <p className="text-xs text-amber-500 mt-1">대기 {pendingLandcos.length}건</p>
          )}
        </button>
      </div>

      {/* 결제 현황 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <button onClick={() => router.push('/admin/payments')} className="bg-white rounded-xl shadow-sm p-5 text-left hover:shadow-md transition-shadow cursor-pointer">
          <p className="text-xs text-gray-400 mb-1">결제 대기</p>
          <p className="text-2xl font-bold text-amber-600">{paymentPending.count}<span className="text-sm font-normal text-gray-400 ml-1">건</span></p>
          <p className="text-xs text-gray-500 mt-1">{paymentPending.total.toLocaleString('ko-KR')}원</p>
        </button>
        <button onClick={() => router.push('/admin/payments')} className="bg-white rounded-xl shadow-sm p-5 text-left hover:shadow-md transition-shadow cursor-pointer">
          <p className="text-xs text-gray-400 mb-1">기한 초과</p>
          <p className={`text-2xl font-bold ${paymentOverdue > 0 ? 'text-red-500' : 'text-gray-300'}`}>{paymentOverdue}<span className="text-sm font-normal text-gray-400 ml-1">건</span></p>
        </button>
        <div className="bg-white rounded-xl shadow-sm p-5 text-left">
          <p className="text-xs text-gray-400 mb-1">이번 달 결제</p>
          <p className="text-2xl font-bold text-emerald-600">{monthlyPaid.count}<span className="text-sm font-normal text-gray-400 ml-1">건</span></p>
          <p className="text-xs text-gray-500 mt-1">{monthlyPaid.total.toLocaleString('ko-KR')}원</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 text-left">
          <p className="text-xs text-gray-400 mb-1">총 GMV</p>
          <p className="text-2xl font-bold text-gray-800">{totalGmv.toLocaleString('ko-KR')}<span className="text-sm font-normal text-gray-400 ml-1">원</span></p>
        </div>
      </div>

      {/* 가입 승인 대기 */}
      <div className="grid grid-cols-2 gap-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">
            여행사 승인 대기 <span className="text-gray-400 font-normal text-sm">({pendingAgencies.length})</span>
          </h2>
          {pendingAgencies.length === 0 ? (
            <p className="text-gray-400 text-sm">대기 중인 여행사가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pendingAgencies.map(user => (
                <div
                  key={user.id}
                  onClick={() => openDetailModal(user)}
                  className="bg-white p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{user.company_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                      {user.business_registration_number && (
                        <p className="text-xs text-gray-400">사업자 {user.business_registration_number}</p>
                      )}
                      {user.representative_name && (
                        <p className="text-xs text-gray-400">대표자 {user.representative_name}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-300 shrink-0 ml-2">
                      {new Date(user.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">
            랜드사 승인 대기 <span className="text-gray-400 font-normal text-sm">({pendingLandcos.length})</span>
          </h2>
          {pendingLandcos.length === 0 ? (
            <p className="text-gray-400 text-sm">대기 중인 랜드사가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pendingLandcos.map(user => (
                <div
                  key={user.id}
                  onClick={() => openDetailModal(user)}
                  className="bg-white p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{user.company_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                      {user.business_registration_number && (
                        <p className="text-xs text-gray-400">사업자 {user.business_registration_number}</p>
                      )}
                      {user.representative_name && (
                        <p className="text-xs text-gray-400">대표자 {user.representative_name}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-300 shrink-0 ml-2">
                      {new Date(user.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 결제 리스트 */}
      <div className="grid grid-cols-2 gap-6 mt-8">
        <section>
          <h2 className="text-lg font-semibold mb-3">
            결제 대기 <span className="text-gray-400 font-normal text-sm">(납부기한순)</span>
          </h2>
          {pendingInstallments.length === 0 ? (
            <p className="text-gray-400 text-sm">결제 대기 건이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pendingInstallments.map(inst => {
                const today = new Date().toISOString().slice(0, 10)
                const daysLeft = Math.ceil((new Date(inst.due_date).getTime() - new Date(today).getTime()) / 86400000)
                const isOverdue = daysLeft < 0
                return (
                  <div key={inst.id} className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/admin/payments')}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{inst.label}</p>
                        <p className="text-xs text-gray-400">{inst.event_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{inst.amount.toLocaleString('ko-KR')}원</p>
                        <p className={`text-xs font-medium ${isOverdue ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {isOverdue ? `D+${Math.abs(daysLeft)}` : `D-${daysLeft}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">
            최근 결제 완료
          </h2>
          {recentPaid.length === 0 ? (
            <p className="text-gray-400 text-sm">결제 완료 건이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {recentPaid.map((inst, i) => (
                <div key={i} className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{inst.label}</p>
                      <p className="text-xs text-gray-400">{inst.event_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">{inst.amount.toLocaleString('ko-KR')}원</p>
                      <p className="text-xs text-gray-400">{new Date(inst.paid_at).toLocaleDateString('ko-KR')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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

              {/* 랜드사 국가 선택 */}
              {detailModal.user.role === 'landco' && (
                <section>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">담당 국가 지정</h4>
                  <div className="flex flex-wrap gap-2">
                    {COUNTRY_OPTIONS.map(country => {
                      const selected = selectedCodes.includes(country.code)
                      return (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => setSelectedCodes(prev =>
                            prev.includes(country.code) ? prev.filter(c => c !== country.code) : [...prev, country.code]
                          )}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                            selected ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                          }`}
                        >
                          {country.name}
                        </button>
                      )
                    })}
                  </div>
                  {selectedCodes.length === 0 && (
                    <p className="text-xs text-amber-500 mt-1">승인 시 국가를 1개 이상 선택해주세요.</p>
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
                  disabled={saving || selectedCodes.length === 0}
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
