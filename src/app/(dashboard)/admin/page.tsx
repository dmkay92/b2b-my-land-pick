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

  // 국가 지정 팝업
  const [countryModal, setCountryModal] = useState<{ user: Profile } | null>(null)
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

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
      setLoading(false)
    }
    fetchData()
  }, [])

  async function handleApprove(userId: string, status: 'approved' | 'rejected') {
    if (status === 'approved') {
      const user = pendingUsers.find(u => u.id === userId)
      if (user?.role === 'landco') {
        setSelectedCodes([])
        setCountryModal({ user })
        return
      }
    }
    const res = await fetch('/api/admin/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status }),
    })
    if (!res.ok) return
    const user = pendingUsers.find(u => u.id === userId)
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
    if (status === 'approved' && user?.role === 'agency') setAgencyCount(c => c + 1)
  }

  async function handleApproveWithCountries() {
    if (!countryModal) return
    setSaving(true)
    const { user } = countryModal
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
    if (!approveRes.ok || !countryRes.ok) return
    setPendingUsers(prev => prev.filter(u => u.id !== user.id))
    setLandcoCount(c => c + 1)
    setCountryModal(null)
  }

  const pendingAgencies = pendingUsers.filter(u => u.role === 'agency')
  const pendingLandcos = pendingUsers.filter(u => u.role === 'landco')

  if (loading) return <div className="p-8 text-gray-500">로딩 중...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">관리자 대시보드</h1>

      {/* 현황 카드 */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <button onClick={() => router.push('/admin/agencies')} className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow cursor-pointer">
          <p className="text-sm text-gray-400 mb-1">승인된 여행사</p>
          <p className="text-3xl font-bold text-gray-800">{agencyCount}<span className="text-base font-normal text-gray-400 ml-1">개사</span></p>
        </button>
        <button onClick={() => router.push('/admin/landcos')} className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow cursor-pointer">
          <p className="text-sm text-gray-400 mb-1">승인된 랜드사</p>
          <p className="text-3xl font-bold text-gray-800">{landcoCount}<span className="text-base font-normal text-gray-400 ml-1">개사</span></p>
        </button>
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
                <div key={user.id} className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{user.company_name}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(user.id, 'approved')} className="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600">승인</button>
                    <button onClick={() => handleApprove(user.id, 'rejected')} className="bg-red-100 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-200">거절</button>
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
                <div key={user.id} className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{user.company_name}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(user.id, 'approved')} className="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600">승인</button>
                    <button onClick={() => handleApprove(user.id, 'rejected')} className="bg-red-100 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-200">거절</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 국가 지정 모달 */}
      {countryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold mb-1">담당 국가 지정</h3>
            <p className="text-sm text-gray-400 mb-4">{countryModal.user.company_name}</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {COUNTRY_OPTIONS.map(country => {
                const selected = selectedCodes.includes(country.code)
                return (
                  <button
                    key={country.code}
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
            <div className="flex gap-2">
              <button
                onClick={() => setCountryModal(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleApproveWithCountries}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
              >
                {saving ? '처리 중...' : '승인 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
