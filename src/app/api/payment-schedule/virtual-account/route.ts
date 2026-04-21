import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { installmentId, amount } = await request.json()
  if (!installmentId || !amount) {
    return NextResponse.json({ error: 'installmentId, amount required' }, { status: 400 })
  }

  // Verify installment exists and is payable
  const { data: installment } = await supabase
    .from('payment_installments').select('*').eq('id', installmentId).single()
  if (!installment) return NextResponse.json({ error: 'Installment not found' }, { status: 404 })
  if (installment.status === 'paid' || installment.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot pay this installment' }, { status: 400 })
  }

  // TODO: Call KCP API to issue virtual account
  // For now, generate mock virtual account info
  const mockBanks = ['신한은행', 'KB국민은행', '우리은행', 'NH농협', '하나은행']
  const mockBank = mockBanks[Math.floor(Math.random() * mockBanks.length)]
  const mockAccountNumber = String(Math.floor(Math.random() * 9000000000000) + 1000000000000)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h from now

  const virtualAccountInfo = {
    bank: mockBank,
    account_number: mockAccountNumber,
    holder: '마이랜드픽',
    expires_at: expiresAt,
  }

  // Create pending transaction
  const { data: tx, error } = await supabase
    .from('payment_transactions').insert({
      installment_id: installmentId,
      amount,
      payment_method: 'virtual_account',
      status: 'pending',
      virtual_account_info: virtualAccountInfo,
    }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transaction: tx, virtualAccount: virtualAccountInfo })
}
