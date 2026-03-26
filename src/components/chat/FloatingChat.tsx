'use client'

import { useRef, useEffect, useState } from 'react'
import { useChat } from '@/lib/chat/ChatContext'

function ChatWindow() {
  const { messages, sendMessage, closeRoom, activeRoomId } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')
    await sendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!activeRoomId) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-blue-600 text-white rounded-t-xl">
        <span className="text-sm font-semibold">채팅</span>
        <button onClick={closeRoom} className="text-white hover:text-blue-200 text-lg leading-none">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-4">메시지가 없습니다</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            <span className="font-semibold text-gray-700 mr-1">{msg.sender?.company_name ?? '상대방'}:</span>
            <span className="text-gray-600">{msg.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-1 p-2 border-t bg-white rounded-b-xl">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지 입력..."
          className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={handleSend}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
        >
          전송
        </button>
      </div>
    </div>
  )
}

function ChatRoomList() {
  const { rooms, openRoom } = useChat()

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 bg-blue-600 text-white rounded-t-xl">
        <span className="text-sm font-semibold">채팅 목록</span>
      </div>
      <div className="flex-1 overflow-y-auto bg-white rounded-b-xl">
        {rooms.length === 0 && (
          <p className="text-xs text-gray-400 text-center p-4">채팅방이 없습니다</p>
        )}
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => openRoom(room.id)}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 text-sm text-gray-700"
          >
            채팅방 {room.id.slice(0, 8)}...
          </button>
        ))}
      </div>
    </div>
  )
}

export function FloatingChat() {
  const { isOpen, activeRoomId, unreadCount, openRoom, rooms, loadRooms } = useChat()
  const [showList, setShowList] = useState(false)

  const handleToggle = async () => {
    if (isOpen) {
      setShowList(false)
    } else if (activeRoomId) {
      openRoom(activeRoomId)
    } else {
      await loadRooms()
      setShowList((v) => !v)
    }
  }

  const panelOpen = isOpen || showList

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {panelOpen && (
        <div className="w-72 h-80 shadow-xl rounded-xl border border-gray-200 overflow-hidden">
          {isOpen ? <ChatWindow /> : <ChatRoomList />}
        </div>
      )}
      <button
        onClick={handleToggle}
        className="relative w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center text-xl"
        aria-label="채팅 열기"
      >
        💬
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}
