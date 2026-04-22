'use client'

import { useRef, useEffect, useState } from 'react'
import { useChat } from '@/lib/chat/ChatContext'
import { createClient } from '@/lib/supabase/client'

type FilterMode = 'request' | 'landco'

type RequestPhase = 'pre' | 'mid' | 'end' | 'payment_pending'

function getRequestPhase(req: { status: string; depart_date: string; return_date: string } | undefined): RequestPhase | null {
  if (!req) return null
  const today = new Date().toISOString().slice(0, 10)
  if (req.status === 'payment_pending') return 'payment_pending'
  if (req.status === 'finalized') {
    if (today < req.depart_date) return 'pre'
    if (today <= req.return_date) return 'mid'
    return 'end'
  }
  return null
}

const PHASE_TAG: Record<RequestPhase, { label: string; style: React.CSSProperties }> = {
  payment_pending: { label: '결제대기', style: { backgroundColor: '#fef3c7', color: '#b45309' } },
  pre: { label: '출발전', style: { backgroundColor: '#ede9fe', color: '#6d28d9' } },
  mid: { label: '여행중', style: { backgroundColor: '#fef3c7', color: '#b45309' } },
  end: { label: '여행완료', style: { backgroundColor: '#d1fae5', color: '#065f46' } },
}

function ApprovalRequestCard({ msg, currentUserId, onAction, resolved }: {
  msg: { sender_id: string; content: string | null; metadata?: Record<string, unknown> | null }
  currentUserId: string
  onAction: (action: 'approve' | 'reject') => Promise<void>
  resolved: boolean
}) {
  const [acting, setActing] = useState(false)
  const isLandco = msg.sender_id !== currentUserId
  const showButtons = isLandco && !resolved

  return (
    <div style={{
      width: '90%', padding: '12px 16px', borderRadius: '12px',
      backgroundColor: '#fffbeb', border: '1px solid #fde68a',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 600, marginBottom: '6px' }}>여행 후 정산 승인 요청</div>
      <div style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.5 }}>{msg.content ?? ''}</div>
      {showButtons && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={async () => { setActing(true); await onAction('reject'); setActing(false) }}
            disabled={acting}
            style={{
              padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
              border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#dc2626',
              cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.5 : 1,
            }}
          >
            거부
          </button>
          <button
            onClick={async () => { setActing(true); await onAction('approve'); setActing(false) }}
            disabled={acting}
            style={{
              padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
              border: 'none', backgroundColor: '#2563eb', color: '#fff',
              cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.5 : 1,
            }}
          >
            승인
          </button>
        </div>
      )}
    </div>
  )
}

function ApprovalResultCard({ msg }: { msg: { content: string | null; metadata?: Record<string, unknown> | null } }) {
  const action = (msg.metadata as { action?: string } | undefined)?.action
  const isApproved = action === 'approve'
  return (
    <div style={{
      width: '90%', padding: '10px 14px', borderRadius: '12px',
      backgroundColor: isApproved ? '#ecfdf5' : '#fef2f2',
      border: `1px solid ${isApproved ? '#a7f3d0' : '#fecaca'}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontSize: '11px', color: isApproved ? '#065f46' : '#991b1b', fontWeight: 600, marginBottom: '4px' }}>
        {isApproved ? '승인 완료' : '승인 거부'}
      </div>
      <div style={{ fontSize: '13px', color: isApproved ? '#047857' : '#b91c1c', lineHeight: 1.5 }}>{msg.content ?? ''}</div>
    </div>
  )
}

function FileBubble({ isMine, fileName, onDownload }: { isMine: boolean; fileName: string; onDownload: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onDownload}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        maxWidth: '72%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        backgroundColor: isMine
          ? (hovered ? '#1d4ed8' : '#2563eb')
          : (hovered ? '#f0f9ff' : '#ffffff'),
        color: isMine ? '#ffffff' : '#1f2937',
        fontSize: '13px',
        boxShadow: hovered
          ? '0 4px 12px rgba(0,0,0,0.15)'
          : '0 1px 2px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        border: isMine ? 'none' : `1px solid ${hovered ? '#bfdbfe' : '#e5e7eb'}`,
        transition: 'background-color 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* 파일 아이콘 */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: hovered ? 1 : 0.7, transition: 'opacity 0.15s' }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px', flex: 1, textAlign: 'left' }}>
        {fileName}
      </span>
      {/* hover 시 다운로드 아이콘 */}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        style={{ flexShrink: 0, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', color: isMine ? '#bfdbfe' : '#3b82f6' }}
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function ChatWindow({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { messages, sendMessage, activeRoomId, rooms, currentUserId, openRoom } = useChat()
  const [input, setInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

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

  const otherLastReadAt = activeRoom
    ? (currentUserId === activeRoom.agency_id
        ? activeRoom.landco_last_read_at
        : activeRoom.agency_last_read_at)
    : null

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed && !pendingFile) return
    setInput('')
    setPendingFile(null)
    await sendMessage(trimmed, pendingFile ?? undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleDownload(url: string, fileName: string) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      // 파일명 특수문자 제거 (공백 → _, 한글·영문·숫자·점·하이픈만 허용)
      const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
      const path = `chat/${activeRoomId}/${Date.now()}_${safeName}`
      const { error } = await supabase.storage.from('quotes').upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (error) {
        alert(`파일 업로드에 실패했습니다.\n${error.message}`)
        return
      }
      const { data: urlData } = await supabase.storage.from('quotes').createSignedUrl(path, 60 * 60 * 24 * 365)
      setPendingFile({ url: urlData?.signedUrl ?? path, name: file.name })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    dragCounter.current = 0
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  if (!activeRoomId) return null

  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-blue-50/90 border-2 border-dashed border-blue-400 rounded-xl pointer-events-none">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-blue-400 mb-2"><path d="M12 4v12m0-12L8 8m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          <p className="text-sm font-semibold text-blue-600">파일을 여기에 놓으세요</p>
        </div>
      )}

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
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.message_type === 'approval_request' || msg.message_type === 'approval_result' ? 'center' : isMine ? 'flex-end' : 'flex-start' }}>
              {msg.message_type === 'approval_request' ? (
                <ApprovalRequestCard msg={msg} currentUserId={currentUserId ?? ''} resolved={
                  messages.some(m => m.message_type === 'approval_result' && (m.metadata as { schedule_id?: string } | undefined)?.schedule_id === (msg.metadata as { schedule_id?: string } | undefined)?.schedule_id)
                } onAction={async (action) => {
                  const meta = msg.metadata as { schedule_id?: string } | undefined
                  if (!meta?.schedule_id) return
                  await fetch('/api/payment-schedule/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scheduleId: meta.schedule_id, action }),
                  })
                  if (activeRoomId) openRoom(activeRoomId)
                }} />
              ) : msg.message_type === 'approval_result' ? (
                <ApprovalResultCard msg={msg} />
              ) : msg.file_url ? (
                <FileBubble
                  isMine={isMine}
                  fileName={msg.file_name ?? '파일'}
                  onDownload={() => handleDownload(msg.file_url!, msg.file_name ?? '파일')}
                />
              ) : (
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
              )}
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

      <div style={{ borderTop: '1px solid #e5e7eb', backgroundColor: 'white', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', flexShrink: 0 }}>
        {/* 업로드 대기 파일 미리보기 */}
        {(uploading || pendingFile) && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '5px 10px', flex: 1, minWidth: 0 }}>
              {uploading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#3b82f6' }} className="animate-spin"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round"/></svg>
                  <span style={{ fontSize: '12px', color: '#3b82f6' }}>업로드 중...</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#3b82f6' }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: '12px', color: '#1d4ed8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile?.name}</span>
                </>
              )}
            </div>
            {pendingFile && !uploading && (
              <button
                onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                style={{ flexShrink: 0, color: '#9ca3af', cursor: 'pointer', display: 'flex', padding: '2px' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                title="취소"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', padding: '10px 12px', alignItems: 'center' }}>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !!pendingFile}
          title="파일 첨부"
          style={{ padding: '6px', borderRadius: '9999px', color: '#9ca3af', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) setPanelVisible(true)
  }, [isOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelVisible) setPanelVisible(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [panelVisible])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!panelVisible) return
      if (containerRef.current?.contains(e.target as Node)) return
      // 인터랙티브 요소(버튼, 링크, 카드 등) 클릭 시 닫지 않음
      let el = e.target as Element | null
      while (el && el !== document.documentElement) {
        const tag = el.tagName
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
        const cursor = window.getComputedStyle(el).cursor
        if (cursor === 'pointer' || cursor === 'text') return
        el = el.parentElement
      }
      setPanelVisible(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelVisible])

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
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
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
