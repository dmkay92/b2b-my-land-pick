import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// GET /api/chat/rooms?requestId=... - 특정 요청의 채팅방 목록 (또는 전체)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const requestId = request.nextUrl.searchParams.get('requestId')

  // profiles join은 RLS에 막히므로 admin client로 조회
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let query = adminClient
    .from('chat_rooms')
    .select('*, request:quote_requests(event_name, destination_country, created_at, status, depart_date, return_date), agency:profiles!chat_rooms_agency_id_fkey(company_name), landco:profiles!chat_rooms_landco_id_fkey(company_name)')
    .order('created_at', { ascending: false })

  if (requestId) {
    query = query.eq('request_id', requestId)
  } else if (profile?.role === 'agency') {
    query = query.eq('agency_id', user.id)
  } else if (profile?.role === 'landco') {
    query = query.eq('landco_id', user.id)
  }
  // admin은 전체 조회

  const { data: rooms, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 각 방의 최신 메시지 정보 조회
  const roomIds = (rooms ?? []).map((r: { id: string }) => r.id)
  let lastMsgMap: Record<string, { created_at: string; sender_id: string; content: string | null; file_name: string | null }> = {}
  if (roomIds.length > 0) {
    const { data: lastMsgs } = await adminClient
      .from('messages')
      .select('room_id, created_at, sender_id, content, file_name')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false })
    for (const msg of (lastMsgs ?? []) as { room_id: string; created_at: string; sender_id: string; content: string | null; file_name: string | null }[]) {
      if (!lastMsgMap[msg.room_id]) lastMsgMap[msg.room_id] = msg
    }
  }

  // 확정된 견적의 선택 랜드사 조회
  const finalizedRooms = (rooms ?? []) as { id: string; request_id: string; landco_id: string; request?: { status: string } }[]
  const finalizedRequestIds = [...new Set(finalizedRooms.filter(r => r.request?.status === 'finalized' || r.request?.status === 'payment_pending').map(r => r.request_id))]
  const selectedSet = new Set<string>() // "request_id:landco_id"
  if (finalizedRequestIds.length > 0) {
    const { data: selections } = await adminClient
      .from('quote_selections')
      .select('request_id, landco_id')
      .in('request_id', finalizedRequestIds)
    for (const s of (selections ?? []) as { request_id: string; landco_id: string }[]) {
      selectedSet.add(`${s.request_id}:${s.landco_id}`)
    }
  }

  const enriched = (rooms ?? []).map((r: { id: string; request_id: string; landco_id: string }) => ({
    ...r,
    last_msg_at: lastMsgMap[r.id]?.created_at ?? null,
    last_msg_sender_id: lastMsgMap[r.id]?.sender_id ?? null,
    last_msg_content: lastMsgMap[r.id]
      ? (lastMsgMap[r.id].file_name ? `📎 ${lastMsgMap[r.id].file_name}` : lastMsgMap[r.id].content)
      : null,
    is_selected: selectedSet.has(`${r.request_id}:${r.landco_id}`),
  }))

  return NextResponse.json({ rooms: enriched })
}

// POST /api/chat/rooms - 채팅방 생성 (없으면 생성, 있으면 기존 반환)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'agency') {
    return NextResponse.json({ error: 'Forbidden: only agencies can create chat rooms' }, { status: 403 })
  }

  const { requestId, landcoId } = await request.json()
  if (!requestId || !landcoId) {
    return NextResponse.json({ error: 'requestId, landcoId required' }, { status: 400 })
  }

  // 요청 소유자 확인
  const { data: qr } = await supabase
    .from('quote_requests').select('agency_id').eq('id', requestId).single()
  if (qr?.agency_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // upsert (request_id, landco_id) unique constraint 활용
  const { data: room, error } = await supabase
    .from('chat_rooms')
    .upsert(
      { request_id: requestId, agency_id: user.id, landco_id: landcoId },
      { onConflict: 'request_id,landco_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ room }, { status: 201 })
}
