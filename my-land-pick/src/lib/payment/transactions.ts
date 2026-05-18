import type { PaymentInstallmentStatus } from '@/lib/supabase/types'

interface InstallmentContext {
  allow_split: boolean
  amount: number
  paid_amount: number
  status: PaymentInstallmentStatus
  existingTxCount: number
}

export function validateTransaction(
  installment: InstallmentContext,
  txAmount: number,
): { valid: boolean; error?: string } {
  if (installment.status === 'paid') {
    return { valid: false, error: '이미 결제 완료된 단계입니다.' }
  }
  if (installment.status === 'cancelled') {
    return { valid: false, error: '취소된 결제 단계입니다.' }
  }
  if (!installment.allow_split && installment.existingTxCount > 0) {
    return { valid: false, error: '단일 결제만 가능한 단계입니다. (혼합 결제 불가)' }
  }
  const remaining = installment.amount - installment.paid_amount
  if (txAmount > remaining) {
    return { valid: false, error: `결제 금액이 잔여 금액(${remaining}원)을 초과합니다.` }
  }
  return { valid: true }
}

export function calculateInstallmentStatus(
  amount: number,
  paidAmount: number,
): PaymentInstallmentStatus {
  if (paidAmount >= amount) return 'paid'
  if (paidAmount > 0) return 'partial'
  return 'pending'
}
