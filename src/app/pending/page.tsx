'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function PendingPage() {
  const supabase = createClient()
  const router = useRouter()

  async function handleLogoClick() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="fixed top-4 left-6 z-50">
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="text-blue-600 font-bold text-lg">마이리얼랜드</span>
          <span className="text-gray-400 text-xs">by</span>
          <Image src="/myrealtrip-logo.png" alt="Myrealtrip" width={80} height={20} style={{ objectFit: 'contain' }} />
        </button>
      </div>
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-2">승인 대기 중</h1>
        <p className="text-gray-600">
          가입 신청이 완료되었습니다.<br />
          관리자 승인 후 서비스를 이용하실 수 있습니다.
        </p>
      </div>
    </div>
  )
}
