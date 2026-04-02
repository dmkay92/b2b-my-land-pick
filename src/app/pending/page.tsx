'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function PendingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('company_name, role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCompanyName(data.company_name)
            setRole(data.role)
          }
        })
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel = role === 'agency' ? '여행사' : role === 'landco' ? '랜드사' : ''

  const steps = [
    { label: '신청 완료', done: true, current: false },
    { label: '서류 검토 중', done: false, current: true },
    { label: '승인 완료', done: false, current: false },
  ]

  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@myrealtrip.com'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-gray-900 font-bold text-lg">마이랜드견적</span>
          <span className="text-gray-400 text-xs">by</span>
          <Image src="/myrealtrip-logo.png" alt="Myrealtrip" width={80} height={20} style={{ objectFit: 'contain' }} />
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          로그아웃
        </button>
      </div>

      {/* 본문 */}
      <div className="flex flex-1 items-center justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-md p-8 text-center">
          {/* 타이틀 */}
          <div className="mb-6">
            <div className="text-4xl mb-3">📋</div>
            <h1 className="text-xl font-bold text-gray-900">
              {companyName ? (
                <>{companyName}<span className="text-gray-400 font-normal">({roleLabel})</span>님의<br />가입 신청이 접수되었어요</>
              ) : (
                '가입 신청이 접수되었어요'
              )}
            </h1>
          </div>

          {/* 진행 단계 */}
          <div className="flex items-center justify-center gap-0 mb-8">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      s.done
                        ? 'bg-blue-600 text-white'
                        : s.current
                        ? 'bg-blue-100 text-blue-600 border-2 border-blue-400'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {s.done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs whitespace-nowrap ${s.current ? 'text-blue-600 font-medium' : s.done ? 'text-gray-500' : 'text-gray-300'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-1 mb-5 ${s.done ? 'bg-blue-600' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

          {/* 안내 */}
          <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-blue-800 font-medium mb-1">검토 예상 기간</p>
            <p className="text-sm text-blue-700">영업일 기준 1–2일 내에 검토 후<br />가입 승인 이메일을 보내드려요.</p>
          </div>

          <p className="text-xs text-gray-400">
            승인 관련 문의:{' '}
            <a href={`mailto:${supportEmail}`} className="text-blue-500 hover:underline">
              {supportEmail}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
