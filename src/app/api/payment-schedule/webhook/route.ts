import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// This endpoint is called by KCP when a deposit is confirmed
// No auth required (KCP calls this server-to-server)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { transactionId, pgTransactionId, status } = body

  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId required' }, { status: 400 })
  }

  // Use admin client (no user auth for webhooks)
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Update transaction status
  const { data: tx } = await supabase
    .from('payment_transactions').select('*').eq('id', transactionId).single()
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  const newStatus = status === 'success' ? 'success' : 'failed'
  await supabase.from('payment_transactions').update({
    status: newStatus,
    pg_transaction_id: pgTransactionId ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', transactionId)

  // If success, update installment
  if (newStatus === 'success') {
    const { data: installment } = await supabase
      .from('payment_installments').select('*').eq('id', tx.installment_id).single()

    if (installment) {
      const newPaidAmount = installment.paid_amount + tx.amount
      const isPaid = newPaidAmount >= installment.amount

      await supabase.from('payment_installments').update({
        paid_amount: newPaidAmount,
        status: isPaid ? 'paid' : 'partial',
        paid_at: isPaid ? new Date().toISOString() : installment.paid_at,
        updated_at: new Date().toISOString(),
      }).eq('id', tx.installment_id)

      // Check if all installments are paid -> finalize
      const { data: schedule } = await supabase
        .from('payment_schedules').select('request_id')
        .eq('id', installment.schedule_id).single()

      if (schedule) {
        const { data: allInst } = await supabase
          .from('payment_installments').select('status')
          .eq('schedule_id', installment.schedule_id)

        const allPaid = (allInst ?? []).every(i => i.status === 'paid' || i.status === 'cancelled')
        if (allPaid) {
          await supabase.from('quote_requests')
            .update({ status: 'finalized' }).eq('id', schedule.request_id)
          await supabase.from('quote_selections')
            .update({ finalized_at: new Date().toISOString() }).eq('request_id', schedule.request_id)
        }
      }
    }
  }

  return NextResponse.json({ success: true })
}
