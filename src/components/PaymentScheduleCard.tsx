'use client'

import { useState } from 'react'
import type { PaymentSchedule, PaymentInstallment, PaymentMethod } from '@/lib/supabase/types'

interface Props {
  schedule: PaymentSchedule
  installments: PaymentInstallment[]
  departDate?: string
  onSwitchToImmediate: () => Promise<void>
  onSwitchToDefault: () => Promise<void>
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

function statusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">결제완료</span>
    case 'partial':
      return <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">부분결제</span>
    case 'overdue':
      return <span className="text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">기한초과</span>
    case 'cancelled':
      return <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">취소됨</span>
    default:
      return <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">결제대기</span>
  }
}

function templateLabel(type: string) {
  switch (type) {
    case 'large_event': return '대형행사 (3단계)'
    case 'immediate': return '즉시완납'
    default: return '일반 (2단계)'
  }
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'virtual_account', label: '가상계좌', icon: '🏦' },
  { value: 'card_link', label: '카드결제 (링크)', icon: '💳' },
  { value: 'card_keyin', label: '카드결제 (수기)', icon: '⌨️' },
]

export default function PaymentScheduleCard({ schedule, installments, departDate, onSwitchToImmediate, onSwitchToDefault }: Props) {
  const [switching, setSwitching] = useState(false)
  const [payingInstallment, setPayingInstallment] = useState<PaymentInstallment | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [payAmount, setPayAmount] = useState('')

  const noPaid = installments.every(i => i.status === 'pending')
  const isImmediate = schedule.template_type === 'immediate'
  const daysUntilDepart = departDate ? Math.ceil((new Date(departDate).getTime() - Date.now()) / 86400000) : 999
  const forceImmediate = daysUntilDepart <= 7

  const handleSwitch = async (toImmediate: boolean) => {
    setSwitching(true)
    try {
      if (toImmediate) await onSwitchToImmediate()
      else await onSwitchToDefault()
    } finally { setSwitching(false) }
  }

  const openPayModal = (inst: PaymentInstallment) => {
    setPayingInstallment(inst)
    setSelectedMethod(null)
    setPayAmount(String(inst.amount - inst.paid_amount))
  }

  const handlePay = async () => {
    if (!payingInstallment || !selectedMethod) return
    // TODO: 플랫폼 PG 연동 시 실제 결제 처리
    alert(`결제 연동 준비 중입니다.\n\n결제 수단: ${PAYMENT_METHODS.find(m => m.value === selectedMethod)?.label}\n결제 금액: ${fmt(Number(payAmount))}원\n\n플랫폼 PG 연동 후 활성화됩니다.`)
    setPayingInstallment(null)
  }

  return (
    <>
      {/* 결제 수단 선택 모달 */}
      {payingInstallment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">결제하기</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {payingInstallment.label} — {fmt(payingInstallment.amount)}원
                {payingInstallment.paid_amount > 0 && (
                  <span className="text-xs text-gray-400 ml-1">({fmt(payingInstallment.paid_amount)}원 결제됨)</span>
                )}
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* 결제 금액 */}
              {payingInstallment.allow_split && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">결제 금액</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right pr-8 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    잔여 금액: {fmt(payingInstallment.amount - payingInstallment.paid_amount)}원 (분할 결제 가능)
                  </p>
                </div>
              )}

              {/* 결제 수단 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">결제 수단</label>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.value}
                      onClick={() => setSelectedMethod(method.value)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                        selectedMethod === method.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-lg">{method.icon}</span>
                      <span className={`text-sm font-medium ${
                        selectedMethod === method.value ? 'text-blue-700' : 'text-gray-700'
                      }`}>{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setPayingInstallment(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handlePay}
                disabled={!selectedMethod}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {fmt(Number(payAmount) || 0)}원 결제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 스케줄 카드 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">결제 스케줄</h3>
            <span className="text-[11px] text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
              {templateLabel(schedule.template_type)}
            </span>
          </div>
          {noPaid && !forceImmediate && (
            <button
              onClick={() => handleSwitch(!isImmediate)}
              disabled={switching}
              className="text-xs text-blue-600 border border-blue-300 px-3 py-1 rounded-full hover:bg-blue-50 disabled:opacity-50"
            >
              {switching ? '변경 중...' : isImmediate ? '분할결제 전환' : '즉시완납 전환'}
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {installments.map((inst, idx) => {
            const remaining = inst.amount - inst.paid_amount
            const canPay = inst.status === 'pending' || inst.status === 'partial' || inst.status === 'overdue'

            return (
              <div key={inst.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                      inst.status === 'partial' ? 'bg-blue-500 text-white' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {inst.status === 'paid' ? '✓' : idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{inst.label}</span>
                        <span className="text-xs text-gray-400">{Math.round(inst.rate * 100)}%</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        기한: {inst.due_date}
                        {inst.allow_split && <span className="ml-2 text-gray-400">(혼합결제 가능)</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-900">{fmt(inst.amount)}원</div>
                      <div className="mt-0.5 flex items-center gap-1.5 justify-end">
                        {inst.paid_amount > 0 && inst.status !== 'paid' && (
                          <span className="text-[10px] text-gray-400">{fmt(inst.paid_amount)}원 결제됨</span>
                        )}
                        {statusBadge(inst.status)}
                      </div>
                      {inst.paid_at && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(inst.paid_at).toLocaleString('ko-KR')}
                        </div>
                      )}
                    </div>
                    {canPay && (
                      <button
                        onClick={() => openPayModal(inst)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition-all whitespace-nowrap"
                      >
                        {remaining < inst.amount ? `${fmt(remaining)}원 결제` : '결제하기'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-500">총 결제금액</span>
          <span className="text-base font-bold text-gray-900">{fmt(schedule.total_amount)}원</span>
        </div>
      </div>
    </>
  )
}
