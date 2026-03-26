import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/chat/rooms?requestId=... - 특정 요청의 채팅방 목록 (또는 전체)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const requestId = request.nextUrl.searchParams.get('requestId')

  let query = supabase
    .from('chat_rooms')
    .select('*, request:quote_requests(event_name, destination_country), agency:profiles!chat_rooms_agency_id_fkey(company_name), landco:profiles!chat_rooms_landco_id_fkey(company_name)')
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

  return NextResponse.json({ rooms })
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
