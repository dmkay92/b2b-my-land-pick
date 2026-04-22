import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTransaction, calculateInstallmentStatus } from '@/lib/payment/transactions'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { installmentId, amount, paymentMethod, pgTransactionId, pgResponse } = await request.json()
  if (!installmentId || !amount || !paymentMethod) {
    return NextResponse.json({ error: 'installmentId, amount, paymentMethod required' }, { status: 400 })
  }

  const { data: installment } = await supabase
    .from('payment_installments').select('*').eq('id', installmentId).single()
  if (!installment) return NextResponse.json({ error: 'Installment not found' }, { status: 404 })

  const { count } = await supabase
    .from('payment_transactions').select('id', { count: 'exact', head: true })
    .eq('installment_id', installmentId)
    .in('status', ['pending', 'success'])

  const validation = validateTransaction({
    allow_split: installment.allow_split,
    amount: installment.amount,
    paid_amount: installment.paid_amount,
    status: installment.status,
    existingTxCount: count ?? 0,
  }, amount)

  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // Calculate card surcharge
  const isCard = paymentMethod === 'card_link' || paymentMethod === 'card_keyin'
  const CARD_SURCHARGE_RATE = 0.03
  const baseAmount = amount
  const cardSurcharge = isCard ? Math.round(baseAmount * CARD_SURCHARGE_RATE) : 0
  const totalAmount = baseAmount + cardSurcharge

  const { data: tx, error: txError } = await supabase
    .from('payment_transactions').insert({
      installment_id: installmentId,
      base_amount: baseAmount,
      card_surcharge_rate: isCard ? CARD_SURCHARGE_RATE : 0,
      card_surcharge: cardSurcharge,
      amount: totalAmount,
      payment_method: paymentMethod,
      status: 'success',
      pg_transaction_id: pgTransactionId ?? null,
      pg_response: pgResponse ?? null,
    }).select().single()

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

  const newPaidAmount = installment.paid_amount + amount
  const newStatus = calculateInstallmentStatus(installment.amount, newPaidAmount)

  await supabase.from('payment_installments').update({
    paid_amount: newPaidAmount,
    status: newStatus,
    paid_at: newStatus === 'paid' ? new Date().toISOString() : installment.paid_at,
    updated_at: new Date().toISOString(),
  }).eq('id', installmentId)

  const { data: schedule } = await supabase
    .from('payment_schedules').select('request_id')
    .eq('id', installment.schedule_id).single()

  const { data: allInstallments } = await supabase
    .from('payment_installments').select('status')
    .eq('schedule_id', installment.schedule_id)

  const allPaid = (allInstallments ?? []).every(i =>
    i.status === 'paid' || i.status === 'cancelled'
  )

  if (allPaid && schedule) {
    await supabase.from('quote_requests')
      .update({ status: 'finalized' }).eq('id', schedule.request_id)
    await supabase.from('quote_selections')
      .update({ finalized_at: new Date().toISOString() }).eq('request_id', schedule.request_id)
  }

  return NextResponse.json({
    success: true,
    transaction: tx,
    installmentStatus: newStatus,
    allPaid,
  })
}
