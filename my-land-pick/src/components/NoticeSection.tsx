'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

interface Notice {
  id: string
  title: string
  content: string
  pinned: boolean
  created_at: string
}

export function NoticeSection() {
  const router = useRouter()
  const pathname = usePathname()
  const [notices, setNotices] = useState<Notice[]>([])

  // Determine base path from current pathname
  const basePath = pathname.startsWith('/agency') ? '/agency' : pathname.startsWith('/landco') ? '/landco' : ''

  useEffect(() => {
    fetch('/api/notices')
      .then(r => r.json())
      .then(d => setNotices(d.notices ?? []))
      .catch(() => {})
  }, [])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">&#x1F4E2;</span>
          <h3 className="text-sm font-bold text-gray-900">공지사항</h3>
        </div>
        {basePath && (
          <button onClick={() => router.push(`${basePath}/notices`)} className="text-xs text-gray-400 hover:text-gray-600">
            전체보기
          </button>
        )}
      </div>
      {notices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">등록된 공지사항이 없습니다.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {notices.slice(0, 5).map(n => (
            <button
              key={n.id}
              onClick={() => basePath ? router.push(`${basePath}/notices?id=${n.id}`) : undefined}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50/50 transition-colors"
            >
              {n.pinned && <span className="text-amber-500 text-xs shrink-0">&#x1F4CC;</span>}
              <span className="text-sm text-gray-800 font-medium flex-1 truncate">{n.title}</span>
              <span className="text-[11px] text-gray-400 shrink-0">{n.created_at?.slice(0, 10)}</span>
              <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
