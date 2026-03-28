import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// PATCH /api/chat/rooms/[roomId]/read - 현재 유저의 읽음 시각 업데이트
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: room } = await admin
    .from('chat_rooms')
    .select('agency_id, landco_id')
    .eq('id', roomId)
    .single()

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.agency_id !== user.id && room.landco_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const col = room.agency_id === user.id ? 'agency_last_read_at' : 'landco_last_read_at'
  const { error } = await admin
    .from('chat_rooms')
    .update({ [col]: new Date().toISOString() })
    .eq('id', roomId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
