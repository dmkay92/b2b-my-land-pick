import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendUnreadMessageEmail } from '@/lib/email/notifications'
import { UNREAD_THRESHOLD_MINUTES } from '@/lib/email/constants'

export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const thresholdDate = new Date(Date.now() - UNREAD_THRESHOLD_MINUTES * 60 * 1000).toISOString()

  // 모든 채팅방 조회 (email_sent_at이 NULL인 것만)
  const { data: rooms } = await admin
    .from('chat_rooms')
    .select('id, request_id, agency_id, landco_id, agency_last_read_at, landco_last_read_at, agency_email_sent_at, landco_email_sent_at')

  if (!rooms || rooms.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sentCount = 0

  for (const room of rooms) {
    // 여행사 측 미확인 체크: landco가 보낸 메시지 중 여행사가 안읽은 것
    if (!room.agency_email_sent_at) {
      const { data: unreadForAgency } = await admin
        .from('messages')
        .select('id, created_at, sender:profiles!messages_sender_id_fkey(company_name)')
        .eq('room_id', room.id)
        .eq('sender_id', room.landco_id)
        .lt('created_at', thresholdDate)
        .order('created_at', { ascending: true })
        .limit(1)

      if (unreadForAgency && unreadForAgency.length > 0) {
        const msg = unreadForAgency[0]
        // 여행사의 마지막 읽음 시각 이후의 메시지인지 확인
        if (!room.agency_last_read_at || msg.created_at > room.agency_last_read_at) {
          const { data: agency } = await admin
            .from('profiles').select('email').eq('id', room.agency_id).single()
          const { data: qr } = await admin
            .from('quote_requests').select('event_name').eq('id', room.request_id).single()

          if (agency?.email) {
            const senderProfile = msg.sender as { company_name: string } | null
            await sendUnreadMessageEmail({
              to: agency.email,
              sender_name: senderProfile?.company_name ?? '',
              event_name: qr?.event_name ?? '',
              request_id: room.request_id,
            })
            await admin.from('chat_rooms')
              .update({ agency_email_sent_at: new Date().toISOString() })
              .eq('id', room.id)
            sentCount++
          }
        }
      }
    }

    // 랜드사 측 미확인 체크: agency가 보낸 메시지 중 랜드사가 안읽은 것
    if (!room.landco_email_sent_at) {
      const { data: unreadForLandco } = await admin
        .from('messages')
        .select('id, created_at, sender:profiles!messages_sender_id_fkey(company_name)')
        .eq('room_id', room.id)
        .eq('sender_id', room.agency_id)
        .lt('created_at', thresholdDate)
        .order('created_at', { ascending: true })
        .limit(1)

      if (unreadForLandco && unreadForLandco.length > 0) {
        const msg = unreadForLandco[0]
        if (!room.landco_last_read_at || msg.created_at > room.landco_last_read_at) {
          const { data: landco } = await admin
            .from('profiles').select('email').eq('id', room.landco_id).single()
          const { data: qr } = await admin
            .from('quote_requests').select('event_name').eq('id', room.request_id).single()

          if (landco?.email) {
            const senderProfile = msg.sender as { company_name: string } | null
            await sendUnreadMessageEmail({
              to: landco.email,
              sender_name: senderProfile?.company_name ?? '',
              event_name: qr?.event_name ?? '',
              request_id: room.request_id,
            })
            await admin.from('chat_rooms')
              .update({ landco_email_sent_at: new Date().toISOString() })
              .eq('id', room.id)
            sentCount++
          }
        }
      }
    }
  }

  return NextResponse.json({ sent: sentCount })
}
