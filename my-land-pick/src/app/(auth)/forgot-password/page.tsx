'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/Logo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setError('이메일 전송에 실패했습니다. 다시 시도해주세요.')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Logo />
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-2">비밀번호 찾기</h1>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-gray-600 text-sm mt-4">
              <strong>{email}</strong> 으로 비밀번호 재설정 링크를 보냈습니다.<br />
              이메일을 확인해주세요.
            </p>
            <Link href="/login" className="text-blue-600 hover:underline text-sm">
              로그인으로 돌아가기
            </Link>
          </div>
        ) : (
          <>
            <p className="text-center text-gray-500 mb-6 text-sm">
              가입한 이메일을 입력하면 재설정 링크를 보내드립니다.
            </p>
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
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '전송 중...' : '재설정 링크 보내기'}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-600">
              <Link href="/login" className="text-blue-600 hover:underline">로그인으로 돌아가기</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
