'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

const COUNTRY_OPTIONS = [
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'TH', name: '태국' },
  { code: 'VN', name: '베트남' },
  { code: 'SG', name: '싱가포르' },
  { code: 'ES', name: '스페인' },
  { code: 'IT', name: '이탈리아' },
  { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' },
  { code: 'US', name: '미국' },
  { code: 'AU', name: '호주' },
  { code: 'AE', name: '두바이/UAE' },
  { code: 'HU', name: '헝가리' },
  { code: 'AT', name: '오스트리아' },
]

export default function AdminPage() {
  const supabase = createClient()
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([])
  const [landcos, setLandcos] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const [{ data: pending }, { data: approved }] = await Promise.all([
        supabase.from('profiles').select('*').eq('status', 'pending').neq('role', 'admin'),
        supabase.from('profiles').select('*').eq('status', 'approved').eq('role', 'landco'),
      ])
      setPendingUsers(pending ?? [])
      setLandcos(approved ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  async function handleApprove(userId: string, status: 'approved' | 'rejected') {
    const res = await fetch('/api/admin/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status }),
    })
    if (!res.ok) return
    const user = pendingUsers.find(u => u.id === userId)
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
    if (status === 'approved' && user?.role === 'landco') {
      setLandcos(prev => [...prev, { ...user, status: 'approved' }])
    }
  }

  async function handleToggleCountry(landcoId: string, currentCodes: string[], code: string) {
    const newCodes = currentCodes.includes(code)
      ? currentCodes.filter(c => c !== code)
      : [...currentCodes, code]
    const res = await fetch('/api/admin/assign-countries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landcoId, countryCodes: newCodes }),
    })
    if (!res.ok) return
    setLandcos(prev => prev.map(l => l.id === landcoId ? { ...l, country_codes: newCodes } : l))
  }

  if (loading) return <div className="p-8 text-gray-500">로딩 중...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">관리자 대시보드</h1>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">
          가입 승인 대기 <span className="text-gray-500 font-normal">({pendingUsers.length})</span>
        </h2>
        {pendingUsers.length === 0 ? (
          <p className="text-gray-400">대기 중인 가입 신청이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {pendingUsers.map(user => (
              <div key={user.id} className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-medium">{user.company_name}</p>
                  <p className="text-sm text-gray-500">
                    {user.email} · {user.role === 'agency' ? '여행사' : '랜드사'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(user.id, 'approved')}
                    className="bg-green-500 text-white px-4 py-1.5 rounded text-sm hover:bg-green-600"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleApprove(user.id, 'rejected')}
                    className="bg-red-100 text-red-600 px-4 py-1.5 rounded text-sm hover:bg-red-200"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">랜드사 국가 지정</h2>
        {landcos.length === 0 ? (
          <p className="text-gray-400">승인된 랜드사가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {landcos.map(landco => (
              <div key={landco.id} className="bg-white p-4 rounded-lg shadow-sm">
                <p className="font-medium mb-3">{landco.company_name}</p>
                <div className="flex flex-wrap gap-2">
                  {COUNTRY_OPTIONS.map(country => {
                    const selected = (landco.country_codes ?? []).includes(country.code)
                    return (
                      <button
                        key={country.code}
                        onClick={() => handleToggleCountry(landco.id, landco.country_codes ?? [], country.code)}
                        className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                          selected
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {country.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
