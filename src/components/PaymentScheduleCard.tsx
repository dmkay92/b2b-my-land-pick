'use client'

import { useState } from 'react'
import type { PaymentSchedule, PaymentInstallment } from '@/lib/supabase/types'

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

export default function PaymentScheduleCard({ schedule, installments, departDate, onSwitchToImmediate, onSwitchToDefault }: Props) {
  const [switching, setSwitching] = useState(false)
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

  return (
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
        {installments.map((inst, idx) => (
          <div key={inst.id} className="px-5 py-3 flex items-center justify-between">
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
          </div>
        ))}
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
        <span className="text-xs text-gray-500">총 결제금액</span>
        <span className="text-base font-bold text-gray-900">{fmt(schedule.total_amount)}원</span>
      </div>
    </div>
  )
}
