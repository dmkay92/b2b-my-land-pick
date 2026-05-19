'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Notice {
  id: string
  title: string
  content: string
  pinned: boolean
  created_at: string
}

export function NoticeListPage({ basePath }: { basePath: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('id')
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/notices')
      .then(r => r.json())
      .then(d => { setNotices(d.notices ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const selected = selectedId ? notices.find(n => n.id === selectedId) : null

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>

  // 상세 보기
  if (selected) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => router.push(`${basePath}/notices`)} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          목록으로
        </button>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              {selected.pinned && <span className="text-amber-500 text-xs">&#x1F4CC;</span>}
              <h1 className="text-lg font-bold text-gray-900">{selected.title}</h1>
            </div>
            <p className="text-xs text-gray-400">{selected.created_at?.slice(0, 10)}</p>
          </div>
          <div className="px-6 py-5 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[120px]">
            {selected.content || '내용이 없습니다.'}
          </div>
        </div>
      </div>
    )
  }

  // 목록
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">공지사항</h1>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {notices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">등록된 공지사항이 없습니다.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {notices.map(n => (
              <button
                key={n.id}
                onClick={() => router.push(`${basePath}/notices?id=${n.id}`)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
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
    </div>
  )
}
