'use client'

import { useRef, useEffect, useState } from 'react'
import { useChat } from '@/lib/chat/ChatContext'

type FilterMode = 'request' | 'landco'

type RequestPhase = 'pre' | 'mid'

function getRequestPhase(req: { status: string; depart_date: string; return_date: string } | undefined): RequestPhase | null {
  if (!req) return null
  const today = new Date().toISOString().slice(0, 10)
  if (req.status === 'finalized') {
    if (today < req.depart_date) return 'pre'
    if (today <= req.return_date) return 'mid'
  }
  return null
}

const PHASE_TAG: Record<RequestPhase, { label: string; style: React.CSSProperties }> = {
  pre: { label: '여행전', style: { backgroundColor: '#ede9fe', color: '#6d28d9' } },
  mid: { label: '여행중', style: { backgroundColor: '#fef3c7', color: '#b45309' } },
}

function ChatWindow({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { messages, sendMessage, activeRoomId, rooms, currentUserId } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeRoom = rooms.find(r => r.id === activeRoomId)
  const otherName = activeRoom
    ? (currentUserId === activeRoom.agency_id
        ? (activeRoom.landco?.company_name ?? '랜드사')
        : (activeRoom.agency?.company_name ?? '여행사'))
    : ''
  const roomLabel = activeRoom
    ? `${otherName} · ${activeRoom.request?.event_name ?? '견적'}`
    : '채팅'

  // 상대방이 마지막으로 읽은 시각
  const otherLastReadAt = activeRoom
    ? (currentUserId === activeRoom.agency_id
        ? activeRoom.landco_last_read_at
        : activeRoom.agency_last_read_at)
    : null

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')
    await sendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!activeRoomId) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-3 bg-blue-600 text-white rounded-t-xl flex-shrink-0">
        <button onClick={onBack} className="text-white hover:text-blue-200 text-lg leading-none flex-shrink-0 px-1">‹</button>
        <p className="text-sm font-semibold truncate flex-1">{roomLabel}</p>
        <button onClick={onClose} className="text-white hover:text-blue-200 text-base leading-none flex-shrink-0 px-1">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gray-50" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-8">메시지가 없습니다</p>
        )}
        {messages.map((msg, i) => {
          const isMine = msg.sender_id === currentUserId
          const unread = isMine && (!otherLastReadAt || otherLastReadAt < msg.created_at)
          const minuteKey = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          const next = messages[i + 1]
          const nextMinuteKey = next ? new Date(next.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null
          const isLastInGroup = !next || next.sender_id !== msg.sender_id || nextMinuteKey !== minuteKey
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '72%',
                padding: '8px 12px',
                borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                backgroundColor: isMine ? '#2563eb' : '#ffffff',
                color: isMine ? '#ffffff' : '#1f2937',
                fontSize: '14px',
                lineHeight: '1.4',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
              {isLastInGroup && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexDirection: isMine ? 'row-reverse' : 'row', paddingLeft: '4px', paddingRight: '4px' }}>
                  {isMine && unread && (
                    <span style={{ fontSize: '10px', color: '#facc15', fontWeight: 700, lineHeight: 1 }}>1</span>
                  )}
                  <span style={{ fontSize: '10px', color: '#9ca3af' }}>{minuteKey}</span>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid #e5e7eb', backgroundColor: 'white', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', flexShrink: 0 }}>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지 입력..."
          style={{ flex: 1, fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '9999px', padding: '8px 16px', outline: 'none', backgroundColor: '#f9fafb' }}
        />
        <button
          onClick={handleSend}
          style={{ fontSize: '14px', backgroundColor: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: '9999px', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}
        >
          전송
        </button>
      </div>
    </div>
  )
}

function ChatRoomList({ filterMode, setFilterMode, onClose }: { filterMode: FilterMode; setFilterMode: (m: FilterMode) => void; onClose: () => void }) {
  const { rooms, openRoom, currentUserId, roomUnreadCounts } = useChat()

  const getOtherName = (room: (typeof rooms)[0]) =>
    currentUserId === room.agency_id
      ? (room.landco?.company_name ?? '랜드사')
      : (room.agency?.company_name ?? '여행사')

  type GroupItem = { label: string; subLabel: string; room: (typeof rooms)[0] }
  type GroupEntry = { key: string; label: string; items: GroupItem[] }

  const getLatestMsgAt = (list: GroupItem[]) =>
    list.reduce((max, { room }) => (room.last_msg_at ?? '') > max ? (room.last_msg_at ?? '') : max, '')

  // 견적별: 견적 요청 created_at 기준 그룹 정렬 (최신 견적 위로), 그룹 내는 최신 메시지 순
  const byRequest: GroupEntry[] = Object.values(
    rooms.reduce<Record<string, GroupItem[]>>((acc, room) => {
      const key = room.request_id
      if (!acc[key]) acc[key] = []
      acc[key].push({ label: room.request?.event_name ?? '알 수 없는 견적', subLabel: getOtherName(room), room })
      return acc
    }, {})
  ).map(items => {
    const requestCreatedAt = items[0].room.request?.created_at ?? ''
    return {
      key: items[0].room.request_id,
      label: items[0].label,
      items: [...items].sort((a, b) => (b.room.last_msg_at ?? '') > (a.room.last_msg_at ?? '') ? 1 : -1),
      requestCreatedAt,
    }
  }).sort((a, b) => {
    if (b.requestCreatedAt > a.requestCreatedAt) return 1
    if (b.requestCreatedAt < a.requestCreatedAt) return -1
    return 0
  }).map(({ requestCreatedAt: _, ...rest }) => rest)

  // 랜드사별: 최신 메시지 기준 그룹 정렬, 그룹 내는 최신 견적 순
  const byOther: GroupEntry[] = Object.values(
    rooms.reduce<Record<string, GroupItem[]>>((acc, room) => {
      const isAgency = currentUserId === room.agency_id
      const key = isAgency ? room.landco_id : room.agency_id
      if (!acc[key]) acc[key] = []
      acc[key].push({ label: getOtherName(room), subLabel: room.request?.event_name ?? '견적', room })
      return acc
    }, {})
  ).map(items => ({
    key: items[0].room.agency_id === currentUserId ? items[0].room.landco_id : items[0].room.agency_id,
    label: items[0].label,
    items: [...items].sort((a, b) => (b.room.last_msg_at ?? '') > (a.room.last_msg_at ?? '') ? 1 : -1),
  })).sort((a, b) => a.label.localeCompare(b.label, 'ko'))

  const grouped = filterMode === 'request' ? byRequest : byOther

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 bg-blue-600 text-white rounded-t-xl flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">채팅 목록</p>
          <button onClick={onClose} className="text-white hover:text-blue-200 text-base leading-none px-1">✕</button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setFilterMode('request')}
            style={{
              fontSize: '12px', padding: '3px 12px', borderRadius: '9999px', cursor: 'pointer',
              backgroundColor: filterMode === 'request' ? 'white' : 'transparent',
              color: filterMode === 'request' ? '#2563eb' : '#bfdbfe',
              fontWeight: filterMode === 'request' ? 600 : 400,
            }}
          >
            견적별
          </button>
          <button
            onClick={() => setFilterMode('landco')}
            style={{
              fontSize: '12px', padding: '3px 12px', borderRadius: '9999px', cursor: 'pointer',
              backgroundColor: filterMode === 'landco' ? 'white' : 'transparent',
              color: filterMode === 'landco' ? '#2563eb' : '#bfdbfe',
              fontWeight: filterMode === 'landco' ? 600 : 400,
            }}
          >
            {currentUserId === rooms[0]?.agency_id ? '랜드사별' : '여행사별'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white rounded-b-xl">
        {rooms.length === 0 && (
          <p className="text-xs text-gray-400 text-center p-6">채팅방이 없습니다</p>
        )}
        {grouped.map(({ key, label, items }) => {
          return (
          <div key={key}>
            <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, padding: '8px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', margin: 0 }}>{label}</p>
            {items.map(({ subLabel, room }) => {
              const unread = roomUnreadCounts[room.id] ?? 0
              const itemPhase = room.is_selected ? getRequestPhase(room.request) : null
              const isUnselected = room.request?.status === 'finalized' && !room.is_selected
              return (
                <button
                  key={room.id}
                  onClick={() => openRoom(room.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <p style={{ fontSize: '14px', color: '#374151', fontWeight: unread > 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{subLabel}</p>
                      {itemPhase && <span style={{ ...PHASE_TAG[itemPhase].style, fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '9999px', flexShrink: 0 }}>{PHASE_TAG[itemPhase].label}</span>}
                      {isUnselected && <span style={{ backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '9999px', flexShrink: 0 }}>미선택</span>}
                    </div>
                    {room.last_msg_content && (
                      <p style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.last_msg_content}</p>
                    )}
                  </div>
                  {unread > 0 && (
                    <span style={{ backgroundColor: '#ef4444', color: 'white', fontSize: '11px', fontWeight: 700, borderRadius: '9999px', minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          )
        })}
      </div>
    </div>
  )
}

export function FloatingChat() {
  const { isOpen, activeRoomId, unreadCount, openRoom, closeRoom, loadRooms } = useChat()
  const [showList, setShowList] = useState(false)
  const [panelVisible, setPanelVisible] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('request')

  useEffect(() => {
    if (isOpen) setPanelVisible(true)
  }, [isOpen])

  const handleToggle = async () => {
    if (panelVisible) {
      setPanelVisible(false)
    } else {
      if (!isOpen && !showList) {
        await loadRooms()
        setShowList(true)
      }
      setPanelVisible(true)
    }
  }

  const handleClose = () => {
    setPanelVisible(false)
  }

  const handleBack = () => {
    closeRoom()
    setShowList(true)
  }

  const panelOpen = panelVisible && (isOpen || showList)

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {panelOpen && (
        <div style={{ width: '420px', height: '680px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isOpen ? <ChatWindow onBack={handleBack} onClose={handleClose} /> : <ChatRoomList filterMode={filterMode} setFilterMode={setFilterMode} onClose={handleClose} />}
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
