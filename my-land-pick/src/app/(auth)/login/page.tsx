'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/Logo'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 pb-40">
      <Logo />
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-2">마이랜드픽</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">로그인</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          비밀번호를 잊으셨나요?{' '}
          <Link href="/forgot-password" className="text-gray-700 font-medium underline hover:text-gray-900">비밀번호 찾기</Link>
        </p>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <Link
            href="/signup"
            className="block w-full text-center border-2 border-blue-100 bg-blue-50 text-blue-600 font-semibold py-2.5 rounded-md hover:bg-blue-100 transition-colors text-sm"
          >
            파트너 신청하기
          </Link>
        </div>
      </div>
      <footer className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-4 mb-3">
            <Link href="/terms/agency" target="_blank" className="text-xs font-semibold text-gray-700 hover:text-gray-900">
              이용약관
            </Link>
            <Link href="/terms/privacy" target="_blank" className="text-xs font-semibold text-gray-700 hover:text-gray-900">
              개인정보 처리방침
            </Link>
          </div>
          <div className="text-[11px] text-gray-400 leading-relaxed space-y-0.5">
            <p>상호명 (주)마이리얼트립 | 대표 이동건 | 사업자등록번호 209-81-55339 | 통신판매업신고번호 2019-서울서초-0260</p>
            <p>주소 서울특별시 서초구 강남대로 311, 드림플러스 강남 18층 (서초동, 한화생명보험빌딩)</p>
            <p>입점 문의 sales@myrealtrip.com</p>

          </div>
        </div>
      </footer>
    </div>
  )
}
