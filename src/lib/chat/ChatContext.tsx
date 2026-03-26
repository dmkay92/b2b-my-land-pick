'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Message {
  id: string
  room_id: string
  sender_id: string
  content: string
  created_at: string
  sender?: { company_name: string }
}

interface ChatRoom {
  id: string
  request_id: string
  agency_id: string
  landco_id: string
  created_at: string
}

interface ChatContextValue {
  activeRoomId: string | null
  openRoom: (roomId: string) => void
  closeRoom: () => void
  messages: Message[]
  sendMessage: (content: string) => Promise<void>
  isOpen: boolean
  unreadCount: number
  rooms: ChatRoom[]
  loadRooms: () => Promise<void>
  openOrCreateRoom: (requestId: string, landcoId: string) => Promise<string | null>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const loadRooms = useCallback(async () => {
    const res = await fetch('/api/chat/rooms')
    if (res.ok) {
      const { rooms: data } = await res.json()
      setRooms(data ?? [])
    }
  }, [])

  const loadMessages = useCallback(async (roomId: string) => {
    const res = await fetch(`/api/chat/rooms/${roomId}/messages`)
    if (res.ok) {
      const { messages: data } = await res.json()
      setMessages(data ?? [])
    }
  }, [])

  const subscribeToRoom = useCallback((roomId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new as Message]
          })
          setUnreadCount((c) => c + 1)
        }
      )
      .subscribe()
    channelRef.current = channel
  }, [supabase])

  const openRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId)
    setIsOpen(true)
    setUnreadCount(0)
    loadMessages(roomId)
    subscribeToRoom(roomId)
  }, [loadMessages, subscribeToRoom])

  const closeRoom = useCallback(() => {
    setIsOpen(false)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [supabase])

  const sendMessage = useCallback(async (content: string) => {
    if (!activeRoomId) return
    await fetch(`/api/chat/rooms/${activeRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  }, [activeRoomId])

  const openOrCreateRoom = useCallback(async (requestId: string, landcoId: string): Promise<string | null> => {
    const res = await fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, landcoId }),
    })
    if (!res.ok) return null
    const { room } = await res.json()
    openRoom(room.id)
    return room.id
  }, [openRoom])

  useEffect(() => {
    loadRooms()
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
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
      rooms,
      loadRooms,
      openOrCreateRoom,
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
