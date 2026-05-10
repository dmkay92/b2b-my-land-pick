import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/chat/rooms/[roomId]/messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS가 참여자만 조회 허용
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(company_name)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ messages })
}

// POST /api/chat/rooms/[roomId]/messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content, file_url, file_name } = await request.json()
  if (!content?.trim() && !file_url) {
    return NextResponse.json({ error: 'content or file required' }, { status: 400 })
  }

  // 채팅방 참여자 확인 (RLS + 명시적 조회)
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('*, request:quote_requests(event_name)')
    .eq('id', roomId)
    .single()

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.agency_id !== user.id && room.landco_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_id: user.id,
      content: content?.trim() || null,
      file_url: file_url ?? null,
      file_name: file_name ?? null,
    })
    .select('*, sender:profiles!messages_sender_id_fkey(company_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message }, { status: 201 })
}
