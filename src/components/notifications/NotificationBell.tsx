'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Notification {
  id: string
  type: string
  payload: { request_id?: string; event_name?: string }
  read_at: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  quote_selected: '견적서가 선택되었습니다',
  quote_finalized: '견적이 최종 확정되었습니다',
  new_request: '새 견적 요청이 접수되었습니다',
}

export function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.read_at).length

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications')
    if (res.ok) {
      const { notifications: data } = await res.json()
      setNotifications(data ?? [])
    }
  }, [])

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  useEffect(() => {
    load()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 20))
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, load, supabase])

  // 패널 외부 클릭시 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    setOpen((v) => !v)
    if (!open && unread > 0) markAllRead()
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className={`relative flex items-center justify-center w-9 h-9 rounded-md border transition-colors duration-150 ${
          open
            ? 'text-blue-600 bg-blue-50 border-blue-200'
            : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-100 hover:border-gray-200'
        }`}
        aria-label="알림"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-76 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden" style={{ width: '300px' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">알림</span>
            {unread === 0 && notifications.length > 0 && (
              <span className="text-xs text-gray-400">모두 읽음</span>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-40">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p className="text-xs">알림이 없습니다</p>
              </div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 text-sm transition-colors ${
                  n.read_at ? 'text-gray-500 bg-white' : 'text-gray-800 font-medium bg-blue-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.read_at ? 'bg-transparent' : 'bg-blue-500'}`} />
                  <div>
                    <p>{TYPE_LABEL[n.type] ?? n.type}</p>
                    {n.payload.event_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{n.payload.event_name}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
