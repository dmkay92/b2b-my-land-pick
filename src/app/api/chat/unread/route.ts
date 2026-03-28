import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// POST /api/chat/unread
// body: { lastReadAt: { [roomId]: isoString } }
// returns: { counts: { [roomId]: number } }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lastReadAt } = await request.json() as { lastReadAt: Record<string, string> }
  const roomIds = Object.keys(lastReadAt)
  if (roomIds.length === 0) return NextResponse.json({ counts: {} })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 각 방의 lastReadAt 이후 상대방 메시지 수 계산
  const counts: Record<string, number> = {}
  await Promise.all(
    roomIds.map(async (roomId) => {
      const since = lastReadAt[roomId] ?? ''
      const query = admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .neq('sender_id', user.id)
      if (since) query.gt('created_at', since)
      const { count } = await query
      counts[roomId] = count ?? 0
    })
  )

  return NextResponse.json({ counts })
}
