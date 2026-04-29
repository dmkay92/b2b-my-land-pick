'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Message {
  id: string
  room_id: string
  sender_id: string
  content: string | null
  file_url: string | null
  file_name: string | null
  message_type?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  sender?: { company_name: string }
}

interface ChatRoom {
  id: string
  request_id: string
  agency_id: string
  landco_id: string
  created_at: string
  agency_last_read_at: string | null
  landco_last_read_at: string | null
  last_msg_at: string | null
  last_msg_sender_id: string | null
  last_msg_content: string | null
  is_selected: boolean
  request?: { event_name: string; created_at: string; status: string; depart_date: string; return_date: string }
  agency?: { company_name: string }
  landco?: { company_name: string }
}

interface ChatContextValue {
  activeRoomId: string | null
  openRoom: (roomId: string) => void
  closeRoom: () => void
  messages: Message[]
  sendMessage: (content: string, fileData?: { url: string; name: string }) => Promise<void>
  isOpen: boolean
  unreadCount: number
  roomUnreadCounts: Record<string, number>
  rooms: ChatRoom[]
  loadRooms: () => Promise<void>
  openOrCreateRoom: (requestId: string, landcoId: string) => Promise<string | null>
  currentUserId: string | null
}

const ChatContext = createContext<ChatContextValue | null>(null)

function getLastReadAt(roomId: string): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(`chat_last_read:${roomId}`) ?? ''
}

function setLastReadAt(roomId: string, at: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`chat_last_read:${roomId}`, at)
}

function computeUnread(rooms: ChatRoom[], currentUserId: string | null): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const room of rooms) {
    if (!room.last_msg_at || !room.last_msg_sender_id) { counts[room.id] = 0; continue }
    if (room.last_msg_sender_id === currentUserId) { counts[room.id] = 0; continue }
    // DB의 last_read_at 컬럼 사용 (localStorage보다 정확)
    const myLastReadAt = currentUserId === room.agency_id
      ? room.agency_last_read_at
      : room.landco_last_read_at
    const lastRead = myLastReadAt ?? ''
    counts[room.id] = lastRead < room.last_msg_at ? 1 : 0
  }
  return counts
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [roomUnreadCounts, setRoomUnreadCounts] = useState<Record<string, number>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const roomsRef = useRef<ChatRoom[]>([])
  const currentUserIdRef = useRef<string | null>(null)
  const activeRoomIdRef = useRef<string | null>(null)

  const unreadCount = useMemo(
    () => Object.values(roomUnreadCounts).reduce((a, b) => a + b, 0),
    [roomUnreadCounts]
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null
      setCurrentUserId(id)
      currentUserIdRef.current = id
    })
  }, [supabase])

  const loadRooms = useCallback(async () => {
    const res = await fetch('/api/chat/rooms')
    if (!res.ok) return
    const { rooms: data } = await res.json()
    const list: ChatRoom[] = data ?? []
    setRooms(list)
    roomsRef.current = list

    if (list.length === 0 || !currentUserIdRef.current) return
    const lastReadAt: Record<string, string> = {}
    for (const room of list) {
      const myLastReadAt = currentUserIdRef.current === room.agency_id
        ? room.agency_last_read_at
        : room.landco_last_read_at
      lastReadAt[room.id] = myLastReadAt ?? ''
    }
    const unreadRes = await fetch('/api/chat/unread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastReadAt }),
    })
    if (unreadRes.ok) {
      const { counts } = await unreadRes.json()
      setRoomUnreadCounts(counts)
    }
  }, [])

  const loadMessages = useCallback(async (roomId: string) => {
    const res = await fetch(`/api/chat/rooms/${roomId}/messages`)
    if (res.ok) {
      const { messages: data } = await res.json()
      setMessages(data ?? [])
    }
  }, [])

  const markRoomRead = useCallback((roomId: string) => {
    const now = new Date().toISOString()
    setLastReadAt(roomId, now)
    setRoomUnreadCounts(prev => ({ ...prev, [roomId]: 0 }))
    // rooms 상태의 my last_read_at도 즉시 반영 (computeUnread가 DB값 사용하므로)
    const room = roomsRef.current.find(r => r.id === roomId)
    if (room && currentUserIdRef.current) {
      const col = currentUserIdRef.current === room.agency_id ? 'agency_last_read_at' : 'landco_last_read_at'
      const updated = roomsRef.current.map(r => r.id === roomId ? { ...r, [col]: now } : r)
      roomsRef.current = updated
      setRooms(updated)
    }
    // Broadcast 방식으로 상대방에게 읽음 알림 (같은 채널에 있을 때)
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'read',
        payload: { userId: currentUserIdRef.current, at: now },
      }).catch(() => {})
    }
    // DB read receipt (optional, best-effort)
    fetch(`/api/chat/rooms/${roomId}/read`, { method: 'PATCH' }).catch(() => {})
  }, [])

  const subscribeToRoom = useCallback((roomId: string, onSubscribed?: () => void) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }
    const channel = supabase
      .channel(`room-${roomId}`)
      .on('broadcast', { event: 'read' }, ({ payload }) => {
        const { userId, at } = payload as { userId: string; at: string }
        // 상대방의 읽음 이벤트만 처리 (자기 자신 제외)
        if (userId === currentUserIdRef.current) return
        const room = roomsRef.current.find(r => r.id === roomId)
        if (!room) return
        const col = userId === room.agency_id ? 'agency_last_read_at' : 'landco_last_read_at'
        const updatedRooms = roomsRef.current.map(r =>
          r.id === roomId ? { ...r, [col]: at } : r
        )
        roomsRef.current = updatedRooms
        setRooms(updatedRooms)
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const raw = payload.new as Message
          const room = roomsRef.current.find(r => r.id === roomId)
          const enriched: Message = room
            ? {
                ...raw,
                sender: {
                  company_name:
                    raw.sender_id === room.agency_id
                      ? (room.agency?.company_name ?? '')
                      : (room.landco?.company_name ?? ''),
                },
              }
            : raw
          setMessages(prev => {
            if (prev.find(m => m.id === enriched.id)) return prev
            return [...prev, enriched]
          })
          // 방이 열려 있으면 즉시 읽음 처리
          if (activeRoomIdRef.current === roomId) {
            markRoomRead(roomId)
          }
          // rooms의 last_msg_at 갱신
          const updatedRooms = roomsRef.current.map(r =>
            r.id === roomId
              ? { ...r, last_msg_at: raw.created_at, last_msg_sender_id: raw.sender_id, last_msg_content: raw.file_name ? `📎 ${raw.file_name}` : raw.content }
              : r
          )
          roomsRef.current = updatedRooms
          setRooms(updatedRooms)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && onSubscribed) onSubscribed()
      })
    channelRef.current = channel
  }, [supabase, markRoomRead])

  // 다른 방에서 온 메시지 알림용 + chat_rooms 읽음 상태 글로벌 구독
  useEffect(() => {
    if (!currentUserId) return
    const ch = supabase
      .channel(`global-msg-${currentUserId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const raw = payload.new as Message
          if (raw.sender_id === currentUserIdRef.current) return
          if (activeRoomIdRef.current === raw.room_id) return
          const inMyRoom = roomsRef.current.some(r => r.id === raw.room_id)
          if (!inMyRoom) return
          const updatedRooms = roomsRef.current.map(r =>
            r.id === raw.room_id
              ? { ...r, last_msg_at: raw.created_at, last_msg_sender_id: raw.sender_id, last_msg_content: raw.file_name ? `📎 ${raw.file_name}` : raw.content }
              : r
          )
          roomsRef.current = updatedRooms
          setRooms(updatedRooms)
          setRoomUnreadCounts(prev => ({
            ...prev,
            [raw.room_id]: (prev[raw.room_id] ?? 0) + 1,
          }))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_rooms' },
        (payload) => {
          const updated = payload.new as ChatRoom
          const inMyRoom = roomsRef.current.some(r => r.id === updated.id)
          if (!inMyRoom) return
          // last_read_at 컬럼만 업데이트 (last_msg_at 등 in-memory 값은 보존)
          const updatedRooms = roomsRef.current.map(r =>
            r.id === updated.id ? {
              ...r,
              agency_last_read_at: updated.agency_last_read_at,
              landco_last_read_at: updated.landco_last_read_at,
            } : r
          )
          roomsRef.current = updatedRooms
          setRooms(updatedRooms)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, currentUserId])

  const openRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId)
    activeRoomIdRef.current = roomId
    setIsOpen(true)
    loadMessages(roomId)
    subscribeToRoom(roomId, () => markRoomRead(roomId))
  }, [loadMessages, subscribeToRoom, markRoomRead])

  const closeRoom = useCallback(() => {
    setIsOpen(false)
    activeRoomIdRef.current = null
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [supabase])

  const sendMessage = useCallback(async (content: string, fileData?: { url: string; name: string }) => {
    if (!activeRoomId) return
    const res = await fetch(`/api/chat/rooms/${activeRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content || null,
        file_url: fileData?.url ?? null,
        file_name: fileData?.name ?? null,
      }),
    })
    if (res.ok) {
      const { message } = await res.json()
      setMessages(prev => prev.find(m => m.id === message.id) ? prev : [...prev, message])
      const lastContent = message.file_name ? `📎 ${message.file_name}` : message.content
      const updatedRooms = roomsRef.current.map(r =>
        r.id === activeRoomId
          ? { ...r, last_msg_at: message.created_at, last_msg_sender_id: message.sender_id, last_msg_content: lastContent }
          : r
      )
      roomsRef.current = updatedRooms
      setRooms(updatedRooms)
    }
  }, [activeRoomId])

  const openOrCreateRoom = useCallback(async (requestId: string, landcoId: string): Promise<string | null> => {
    const res = await fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, landcoId }),
    })
    if (!res.ok) return null
    const { room } = await res.json()
    await loadRooms()
    openRoom(room.id)
    return room.id
  }, [openRoom, loadRooms])

  useEffect(() => {
    supabase.auth.getUser().then(() => loadRooms())
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [loadRooms, supabase])

  return (
    <ChatContext.Provider value={{
      activeRoomId,
      openRoom,
      closeRoom,
      messages,
      sendMessage,
      isOpen,
      unreadCount,
      roomUnreadCounts,
      rooms,
      loadRooms,
      openOrCreateRoom,
      currentUserId,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
