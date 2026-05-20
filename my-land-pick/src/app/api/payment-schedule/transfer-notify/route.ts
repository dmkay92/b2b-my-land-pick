import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { decryptField } from '@/lib/privacy'
import { sendTransferNotifyEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { installmentId } = await request.json()
  if (!installmentId) {
    return NextResponse.json({ error: 'installmentId required' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Fetch installment
  const { data: installment } = await admin
    .from('payment_installments').select('*, payment_schedules!inner(request_id)')
    .eq('id', installmentId).single()
  if (!installment) return NextResponse.json({ error: 'Installment not found' }, { status: 404 })

  // Prevent duplicate notifications
  if (installment.status === 'verifying') {
    return NextResponse.json({ error: '이미 입금 완료 알림이 전송되었습니다.' }, { status: 400 })
  }
  if (installment.status === 'paid') {
    return NextResponse.json({ error: '이미 결제 완료된 항목입니다.' }, { status: 400 })
  }

  const requestId = installment.payment_schedules.request_id

  // Update installment status to verifying
  await admin.from('payment_installments').update({
    status: 'verifying',
    updated_at: new Date().toISOString(),
  }).eq('id', installmentId)

  // Get request info for notification
  const { data: req } = await admin
    .from('quote_requests').select('event_name, display_id')
    .eq('id', requestId).single()

  // Get agency profile
  const { data: agencyProfile } = await admin
    .from('profiles').select('company_name')
    .eq('id', user.id).single()

  // Notify all admins
  const { data: admins } = await admin.from('profiles').select('id, email').eq('role', 'admin')
  for (const a of (admins ?? [])) {
    await admin.from('notifications').insert({
      user_id: a.id,
      type: 'transfer_notify',
      payload: {
        request_id: requestId,
        installment_id: installmentId,
        event_name: req?.event_name ?? '',
        agency_name: agencyProfile?.company_name ?? '',
        label: installment.label,
        amount: installment.amount,
      },
    })

    // Send email to admin
    try {
      const decryptedEmail = await decryptField(a.email)
      await sendTransferNotifyEmail({
        to: decryptedEmail,
        event_name: req?.event_name ?? '',
        agency_name: agencyProfile?.company_name ?? '',
        label: installment.label,
        amount: installment.amount,
        request_id: requestId,
      })
    } catch { /* email failure is non-blocking */ }
  }

  return NextResponse.json({ success: true })
}
