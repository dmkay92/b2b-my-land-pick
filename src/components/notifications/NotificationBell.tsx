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
        className="relative p-1 text-gray-600 hover:text-gray-900"
        aria-label="알림"
      >
        <span className="text-xl">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b text-sm font-semibold text-gray-700">알림</div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="text-xs text-gray-400 text-center p-4">알림이 없습니다</p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-3 py-2 border-b last:border-b-0 text-sm ${n.read_at ? 'text-gray-500' : 'text-gray-800 font-medium bg-blue-50'}`}
              >
                <p>{TYPE_LABEL[n.type] ?? n.type}</p>
                {n.payload.event_name && (
                  <p className="text-xs text-gray-500 mt-0.5">{n.payload.event_name}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
