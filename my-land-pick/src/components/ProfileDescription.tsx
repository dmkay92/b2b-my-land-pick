'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function ProfileDescription() {
  const router = useRouter()
  const [introduction, setIntroduction] = useState('')

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
      setIntroduction(d.introduction ?? '')
    })
  }, [])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-900">회사 소개</h3>
        <button onClick={() => router.push('/landco/profile')} className="text-xs text-blue-500 hover:text-blue-700">프로필 편집</button>
      </div>
      <p className="text-sm text-gray-600 line-clamp-2">
        {introduction || <span className="text-gray-300">소개를 입력해주세요. 프로필 편집에서 작성할 수 있습니다.</span>}
      </p>
    </div>
  )
}
