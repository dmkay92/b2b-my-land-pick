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
    case 'immediate': return '한번에 결제'
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
  const [isSplitModal, setIsSplitModal] = useState(false)
  const [issuedVirtualAccount, setIssuedVirtualAccount] = useState<{
    bank: string; account_number: string; holder: string; expires_at: string;
    transactionId: string; amount: number;
  } | null>(null)

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

  const openPayModal = (inst: PaymentInstallment, split: boolean) => {
    setPayingInstallment(inst)
    setSelectedMethod(null)
    setIsSplitModal(split)
    setPayAmount(split ? '' : String(inst.amount - inst.paid_amount))
  }

  const handlePay = async () => {
    if (!payingInstallment || !selectedMethod) return

    if (selectedMethod === 'virtual_account') {
      // Issue virtual account
      const res = await fetch('/api/payment-schedule/virtual-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: payingInstallment.id, amount: Number(payAmount) }),
      })
      if (!res.ok) { alert('가상계좌 발급 실패'); return }
      const { virtualAccount, transaction } = await res.json()
      setIssuedVirtualAccount({
        ...virtualAccount,
        transactionId: transaction.id,
        amount: Number(payAmount),
      })
      setPayingInstallment(null)
      return
    }

    // Card payments — placeholder
    alert(`카드결제 연동 준비 중입니다.\n\n결제 수단: ${PAYMENT_METHODS.find(m => m.value === selectedMethod)?.label}\n결제 금액: ${fmt(Number(payAmount))}원\n\n플랫폼 PG 연동 후 활성화됩니다.`)
    setPayingInstallment(null)
  }

  return (
    <>
      {/* 결제 수단 선택 모달 */}
      {payingInstallment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {isSplitModal ? '카드+현금 결제' : '결제하기'}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {payingInstallment.label} — {fmt(payingInstallment.amount)}원
                {payingInstallment.paid_amount > 0 && (
                  <span className="text-xs text-gray-400 ml-1">({fmt(payingInstallment.paid_amount)}원 결제됨, 잔여 {fmt(payingInstallment.amount - payingInstallment.paid_amount)}원)</span>
                )}
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* 결제 금액 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">결제 금액</label>
                {isSplitModal ? (
                  <>
                    <div className="relative">
                      <input
                        type="number"
                        value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                        placeholder="결제할 금액을 입력하세요"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right pr-8 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      잔여 {fmt(payingInstallment.amount - payingInstallment.paid_amount)}원 중 일부를 결제합니다. 나머지는 다른 수단으로 결제할 수 있습니다.
                    </p>
                  </>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right font-semibold text-gray-900">
                    {fmt(Number(payAmount))}원
                  </div>
                )}
              </div>

              {/* 결제 수단 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">결제 수단</label>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.value}
                      onClick={() => setSelectedMethod(method.value)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
                        selectedMethod === method.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{method.icon}</span>
                        <span className={`text-sm font-medium ${
                          selectedMethod === method.value ? 'text-blue-700' : 'text-gray-700'
                        }`}>{method.label}</span>
                      </div>
                      {method.value !== 'virtual_account' && (
                        <span className="text-[10px] text-gray-400">수수료 3%</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 카드 수수료 안내 */}
              {selectedMethod && selectedMethod !== 'virtual_account' && Number(payAmount) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">결제 금액</span>
                    <span>{fmt(Number(payAmount))}원</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">카드 수수료 (3%)</span>
                    <span className="text-amber-600">+{fmt(Math.round(Number(payAmount) * 0.03))}원</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-amber-200 pt-1">
                    <span>실 결제금액</span>
                    <span>{fmt(Number(payAmount) + Math.round(Number(payAmount) * 0.03))}원</span>
                  </div>
                </div>
              )}
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
                disabled={!selectedMethod || !Number(payAmount)}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {selectedMethod && selectedMethod !== 'virtual_account'
                  ? `${fmt(Number(payAmount) + Math.round(Number(payAmount) * 0.03))}원 결제`
                  : `${fmt(Number(payAmount) || 0)}원 결제`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 가상계좌 발급 완료 모달 */}
      {issuedVirtualAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">가상계좌 발급 완료</h3>
              <p className="text-xs text-gray-500 mt-0.5">아래 계좌로 입금해주세요.</p>
            </div>
            <div className="px-5 py-5 space-y-3">
              <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">은행</span>
                  <span className="text-sm font-semibold text-gray-900">{issuedVirtualAccount.bank}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">계좌번호</span>
                  <span className="text-sm font-semibold text-gray-900 font-mono">{issuedVirtualAccount.account_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">예금주</span>
                  <span className="text-sm font-semibold text-gray-900">{issuedVirtualAccount.holder}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">입금금액</span>
                  <span className="text-sm font-bold text-blue-600">{fmt(issuedVirtualAccount.amount)}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">입금기한</span>
                  <span className="text-sm text-red-500">{new Date(issuedVirtualAccount.expires_at).toLocaleString('ko-KR')}</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 text-center">입금이 확인되면 자동으로 결제 상태가 업데이트됩니다.</p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setIssuedVirtualAccount(null)}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 스케줄 카드 */}
      <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-white">결제하기</h3>
            <span className="text-[10px] font-medium text-gray-300 bg-white/15 px-2 py-0.5 rounded-full">
              {templateLabel(schedule.template_type)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{fmt(schedule.total_amount)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></span>
            {noPaid && !forceImmediate && (
              <button
                onClick={() => handleSwitch(!isImmediate)}
                disabled={switching}
                className="text-[10px] text-gray-300 bg-white/10 border border-white/20 px-2 py-0.5 rounded-full hover:bg-white/20 disabled:opacity-50 transition-colors"
              >
                {switching ? '변경 중...' : isImmediate ? '나눠서 결제하기' : '한번에 결제하기'}
              </button>
            )}
          </div>
        </div>

        {/* Installments */}
        <div className="bg-white">
          {installments.map((inst, idx) => {
            const remaining = inst.amount - inst.paid_amount
            const canPay = inst.status === 'pending' || inst.status === 'partial' || inst.status === 'overdue'
            const progressPct = inst.amount > 0 ? Math.min(100, Math.round((inst.paid_amount / inst.amount) * 100)) : 0

            return (
              <div key={inst.id} className={`px-5 py-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                <div className="flex items-center justify-between">
                  {/* 좌: 넘버 + 정보 */}
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                      inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                      inst.status === 'partial' ? 'bg-blue-500 text-white' :
                      inst.status === 'overdue' ? 'bg-red-500 text-white' :
                      'bg-gray-100 text-gray-500 border border-gray-200'
                    }`}>
                      {inst.status === 'paid' ? '✓' : idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-gray-900">{inst.label}</span>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{Math.round(inst.rate * 100)}%</span>
                        {statusBadge(inst.status)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-500">{inst.due_date}까지</span>
                      </div>
                    </div>
                  </div>

                  {/* 우: 금액 + 버튼 */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-base font-bold text-gray-900">{fmt(inst.amount)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></div>
                      {inst.paid_at && (
                        <div className="text-[10px] text-gray-400">{new Date(inst.paid_at).toLocaleDateString('ko-KR')} 결제</div>
                      )}
                      {inst.paid_amount > 0 && inst.status !== 'paid' && (
                        <div className="text-[10px] text-blue-500">{fmt(inst.paid_amount)}원 결제됨</div>
                      )}
                    </div>
                    {canPay && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openPayModal(inst, false)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 whitespace-nowrap ${
                            inst.status === 'overdue'
                              ? 'bg-red-500 text-white hover:bg-red-600'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {remaining < inst.amount ? `${fmt(remaining)}원 결제` : '결제하기'}
                        </button>
                        {inst.allow_split && (
                          <button
                            onClick={() => openPayModal(inst, true)}
                            className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all active:scale-95 whitespace-nowrap"
                          >
                            카드+현금
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {inst.paid_amount > 0 && (
                  <div className="mt-2 ml-10">
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${inst.status === 'paid' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
