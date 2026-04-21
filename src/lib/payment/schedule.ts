import type { PaymentTemplateType } from '@/lib/supabase/types'

export const LARGE_EVENT_THRESHOLD = 50

export function getDefaultTemplateType(totalPeople: number): PaymentTemplateType {
  return totalPeople >= LARGE_EVENT_THRESHOLD ? 'large_event' : 'standard'
}

function daysBeforeDeparture(departDate: string, days: number): string {
  const d = new Date(departDate)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function daysAfterToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function depositDueDate(departDate: string): string {
  const sevenDaysLater = daysAfterToday(7)
  const sevenBeforeDepart = daysBeforeDeparture(departDate, 7)
  // 출발 7일 전보다 이후면 즉시 (여유 없음)
  return sevenDaysLater <= sevenBeforeDepart ? sevenDaysLater : new Date().toISOString().slice(0, 10)
}

interface InstallmentDraft {
  label: string
  rate: number
  amount: number
  due_date: string
  allow_split: boolean
}

export function buildInstallments(
  templateType: PaymentTemplateType,
  totalAmount: number,
  departDate: string,
): InstallmentDraft[] {
  const today = new Date().toISOString().slice(0, 10)

  if (templateType === 'immediate') {
    return [{
      label: '전액',
      rate: 1.0,
      amount: totalAmount,
      due_date: today,
      allow_split: true,
    }]
  }

  if (templateType === 'large_event') {
    const deposit = Math.round(totalAmount * 0.1)
    const interim = Math.round(totalAmount * 0.4)
    const balance = totalAmount - deposit - interim
    return [
      { label: '계약금', rate: 0.1, amount: deposit, due_date: depositDueDate(departDate), allow_split: false },
      { label: '중도금', rate: 0.4, amount: interim, due_date: daysBeforeDeparture(departDate, 30), allow_split: true },
      { label: '잔금', rate: 0.5, amount: balance, due_date: daysBeforeDeparture(departDate, 7), allow_split: true },
    ]
  }

  // standard (2-step)
  const deposit = Math.round(totalAmount * 0.1)
  const balance = totalAmount - deposit
  return [
    { label: '계약금', rate: 0.1, amount: deposit, due_date: depositDueDate(departDate), allow_split: false },
    { label: '잔금', rate: 0.9, amount: balance, due_date: daysBeforeDeparture(departDate, 7), allow_split: true },
  ]
}
