'use client'

import { useEffect, useState } from 'react'
import { subscribe } from '@/lib/toast'

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    return subscribe(event => {
      setToasts(prev => [...prev, event])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== event.id))
      }, 3000)
    })
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium min-w-[240px] max-w-sm animate-in fade-in slide-in-from-top-2 duration-200 ${
            t.type === 'success' ? 'bg-gray-900 text-white'
            : t.type === 'error' ? 'bg-red-500 text-white'
            : 'bg-gray-900 text-white'
          }`}
        >
          {t.type === 'success' && <span className="text-green-400 shrink-0">✓</span>}
          {t.type === 'error' && <span className="text-red-200 shrink-0">✕</span>}
          {t.type === 'info' && <span className="text-blue-300 shrink-0">ℹ</span>}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
