'use client'

import { useState } from 'react'
import type { PaymentSchedule, PaymentInstallment, PaymentMethod } from '@/lib/supabase/types'

interface Props {
  schedule: PaymentSchedule
  installments: PaymentInstallment[]
  departDate?: string
  returnDate?: string
  onSwitchToImmediate: () => Promise<void>
  onSwitchToDefault: () => Promise<void>
  onSwitchToPostTravel: () => Promise<void>
  onRefresh?: () => void
  isCancelled?: boolean
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
    case 'one_time': return '한번에 결제'
    case 'post_travel': return '여행 후 정산'
    default: return '나눠서 결제'
  }
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'virtual_account', label: '가상계좌', icon: '🏦' },
  { value: 'card_link', label: '카드결제 (링크)', icon: '💳' },
  { value: 'card_keyin', label: '카드결제 (수기)', icon: '⌨️' },
]

export default function PaymentScheduleCard({ schedule, installments, departDate, returnDate, onSwitchToImmediate, onSwitchToDefault, onSwitchToPostTravel, onRefresh, isCancelled }: Props) {
  const [switching, setSwitching] = useState(false)
  const [payingInstallment, setPayingInstallment] = useState<PaymentInstallment | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [isSplitModal, setIsSplitModal] = useState(false)
  const [showPostTravelModal, setShowPostTravelModal] = useState(false)
  const [issuedVirtualAccount, setIssuedVirtualAccount] = useState<{
    bank: string; account_number: string; holder: string; expires_at: string;
    transactionId: string; amount: number;
  } | null>(null)

  const noPaid = installments.every(i => i.status === 'pending')
  const isImmediate = schedule.template_type === 'one_time'
  const isPostTravel = schedule.template_type === 'post_travel'
  const isPending = schedule.approval_status === 'pending'
  const isRejected = schedule.approval_status === 'rejected'
  const daysUntilDepart = departDate ? Math.ceil((new Date(departDate).getTime() - Date.now()) / 86400000) : 999
  const forceImmediate = daysUntilDepart <= 7

  const handleSwitch = async (toImmediate: boolean) => {
    setSwitching(true)
    try {
      if (toImmediate) await onSwitchToImmediate()
      else await onSwitchToDefault()
    } finally { setSwitching(false) }
  }

  const handlePostTravelRequest = async () => {
    setSwitching(true)
    try {
      await onSwitchToPostTravel()
      setShowPostTravelModal(false)
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
      {/* 계좌이체 안내 모달 */}
      {payingInstallment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">계좌이체 안내</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {payingInstallment.label} — {fmt(payingInstallment.amount - payingInstallment.paid_amount)}원
              </p>
            </div>

            <div className="px-5 py-5 space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">은행</span>
                  <span className="text-sm font-semibold text-gray-900">우리은행</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">계좌번호</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-700 tracking-wide">1005-604-520904</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText('1005604520904'); alert('계좌번호가 복사되었습니다.') }}
                      className="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded hover:bg-blue-200"
                    >
                      복사
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">예금주</span>
                  <span className="text-sm font-semibold text-gray-900">(주)마이리얼트립</span>
                </div>
                <div className="flex justify-between items-center border-t border-blue-200 pt-2.5">
                  <span className="text-xs font-medium text-gray-600">입금 금액</span>
                  <span className="text-base font-bold text-blue-700">{fmt(payingInstallment.amount - payingInstallment.paid_amount)}원</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                입금 후 확인까지 영업일 기준 1~2일 소요됩니다.<br />
                입금자명은 회사명으로 기재해주세요.
              </p>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💳</span>
                    <span className="text-sm text-gray-400">카드결제</span>
                  </div>
                  <span className="text-[11px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">서비스 준비중</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setPayingInstallment(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                확인
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

      {/* 여행 후 정산 안내 모달 */}
      {showPostTravelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">여행 후 정산 플랜</h3>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">계약금</span>
                  <span className="font-semibold">10% — 확정 후 7일 이내</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">중도금</span>
                  <span className="font-semibold">40% — 출발 7일 전</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">잔금</span>
                  <span className="font-semibold">50% — 귀국 후 30일 이내</span>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
                <p className="text-xs text-amber-800 font-medium">안내사항</p>
                <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                  <li>여행 후 정산 플랜은 <strong>랜드사 승인이 필요</strong>합니다.</li>
                  <li>승인 전까지 결제 일정이 확정되지 않습니다.</li>
                  <li>랜드사가 거부할 경우 다른 플랜을 선택해야 합니다.</li>
                </ul>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowPostTravelModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handlePostTravelRequest}
                disabled={switching}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {switching ? '요청 중...' : '승인 요청'}
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
            {isPending && (
              <span className="text-[10px] font-medium text-amber-300 bg-amber-500/20 border border-amber-400/30 px-2 py-0.5 rounded-full">
                랜드사 승인 대기중
              </span>
            )}
            {noPaid && !isPending && (
              <div className="flex items-center gap-1.5">
                {!forceImmediate && !isPostTravel && (
                  <button
                    onClick={() => handleSwitch(isImmediate ? false : true)}
                    disabled={switching}
                    className="text-[10px] text-gray-300 bg-white/10 border border-white/20 px-2 py-0.5 rounded-full hover:bg-white/20 disabled:opacity-50 transition-colors"
                  >
                    {switching ? '변경 중...' : isImmediate ? '나눠서 결제하기' : '한번에 결제하기'}
                  </button>
                )}
                {!forceImmediate && isPostTravel && (
                  <button
                    onClick={() => handleSwitch(false)}
                    disabled={switching}
                    className="text-[10px] text-gray-300 bg-white/10 border border-white/20 px-2 py-0.5 rounded-full hover:bg-white/20 disabled:opacity-50 transition-colors"
                  >
                    {switching ? '변경 중...' : '일반 플랜으로 변경'}
                  </button>
                )}
                {!isPostTravel && (
                  <button
                    onClick={() => setShowPostTravelModal(true)}
                    disabled={switching}
                    className="text-[10px] text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 rounded-full hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                  >
                    여행 후 정산
                  </button>
                )}
              </div>
            )}
            <button
              onClick={() => window.open(`/api/invoice?requestId=${schedule.request_id}`, '_blank')}
              className="text-[10px] text-white bg-white/15 border border-white/25 px-2.5 py-0.5 rounded-full hover:bg-white/25 transition-colors"
            >
              인보이스
            </button>
          </div>
        </div>

        {/* Installments — 기본 회차 (rate > 0) */}
        <div className="bg-white">
          {installments.filter(i => i.rate > 0).map((inst, idx) => {
            const remaining = inst.amount - inst.paid_amount
            const canPay = (inst.status === 'pending' || inst.status === 'partial' || inst.status === 'overdue') && schedule.approval_status === 'approved'
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
                    {canPay && !isCancelled && (
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
                    {(inst.status === 'paid' || inst.status === 'partial') && inst.paid_amount > 0 && (
                      <button
                        className="px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-all active:scale-95 whitespace-nowrap"
                      >
                        환불요청
                      </button>
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

        {/* 결제 요약 */}
        {(() => {
          const totalPaid = installments.reduce((sum, i) => sum + i.paid_amount, 0)
          const totalRemaining = schedule.total_amount - totalPaid
          const paidPct = schedule.total_amount > 0 ? Math.round((totalPaid / schedule.total_amount) * 100) : 0
          return (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">총 결제금액</span>
                <span className="text-xs text-gray-500">{fmt(schedule.total_amount)}원</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">결제완료 {fmt(totalPaid)}원 ({paidPct}%)</span>
                <span className={`text-sm font-bold ${totalRemaining > 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
                  {totalRemaining > 0 ? `잔여 ${fmt(totalRemaining)}원` : '전액 결제완료'}
                </span>
              </div>
            </div>
          )
        })()}

        {/* 추가 정산 회차 (rate === 0) */}
        {installments.some(i => i.rate === 0) && (
          <>
            <div className="px-5 py-2.5 bg-gray-100 border-t border-gray-200">
              <span className="text-[11px] font-bold text-gray-500">추가 정산</span>
            </div>
            <div className="bg-white">
              {installments.filter(i => i.rate === 0).map((inst) => {
                const remaining = inst.amount - inst.paid_amount
                const canPay = (inst.status === 'pending' || inst.status === 'partial' || inst.status === 'overdue') && schedule.approval_status === 'approved'
                const progressPct = inst.amount > 0 ? Math.min(100, Math.round((inst.paid_amount / inst.amount) * 100)) : 0
                return (
                  <div key={inst.id} className="px-5 py-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                          inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                          inst.status === 'cancelled' ? 'bg-gray-200 text-gray-400' :
                          inst.status === 'partial' ? 'bg-blue-500 text-white' :
                          inst.status === 'overdue' ? 'bg-red-500 text-white' :
                          'bg-amber-100 text-amber-600 border border-amber-200'
                        }`}>
                          {inst.status === 'paid' ? '✓' : inst.status === 'cancelled' ? '✕' : '+'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-gray-900">{inst.label}</span>
                            {statusBadge(inst.status)}
                          </div>
                          <span className="text-[11px] text-gray-500">{inst.due_date}까지</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900">{fmt(inst.amount)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></span>
                        {!isCancelled && canPay && remaining > 0 && (
                          <button onClick={() => openPayModal(inst, false)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">결제하기</button>
                        )}
                      </div>
                    </div>
                    {inst.paid_amount > 0 && (
                      <div className="mt-2 ml-10">
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${inst.status === 'paid' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* 승인 상태 안내 */}
        {isPending && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-700">랜드사의 승인을 기다리고 있습니다. 승인 완료 후 결제가 가능합니다.</p>
          </div>
        )}
        {isRejected && (
          <div className="px-5 py-3 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-700">여행 후 정산 플랜이 거부되었습니다. 다른 결제 플랜을 선택해주세요.</p>
          </div>
        )}
      </div>
    </>
  )
}
