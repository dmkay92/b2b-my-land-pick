'use client'

import { useState } from 'react'
import MarkupInput from './MarkupInput'

interface Props {
  landcoTotal: number
  totalPeople: number
  initialPerPerson: number
  initialTotal: number
  landcoName: string
  onConfirm: (markupPerPerson: number, markupTotal: number) => void
  onClose: () => void
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function ConfirmMarkupModal({
  landcoTotal,
  totalPeople,
  initialPerPerson,
  initialTotal,
  landcoName,
  onConfirm,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [markupPerPerson, setMarkupPerPerson] = useState(initialPerPerson)
  const [markupTotal, setMarkupTotal] = useState(initialTotal)

  const finalTotal = landcoTotal + markupTotal
  const finalPerPerson = totalPeople > 0 ? Math.round(finalTotal / totalPeople) : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">
            {step === 1 ? '여행사 커미션 설정' : '최종 금액 확인'}
          </h3>
        </div>

        <div className="px-6 py-5">
          {step === 1 ? (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                고객에게 청구할 여행사 커미션을 설정하세요.
              </p>
              <MarkupInput
                totalPeople={totalPeople}
                initialPerPerson={markupPerPerson}
                initialTotal={markupTotal}
                onChange={(pp, t) => { setMarkupPerPerson(pp); setMarkupTotal(t) }}
              />

              {/* 실시간 합계 */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">랜드사 견적가</span>
                  <span className="text-gray-700">{fmt(landcoTotal)}원</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">여행사 커미션</span>
                  <span className="text-blue-600 font-medium">+{fmt(markupTotal)}원</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="text-sm font-bold text-gray-900">최종 고객가</span>
                  <span className="text-lg font-bold text-gray-900">{fmt(finalTotal)}원</span>
                </div>
                {totalPeople > 0 && (
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>1인당</span>
                    <span>{fmt(finalPerPerson)}원</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">랜드사 견적가</span>
                  <span>{fmt(landcoTotal)}원</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">여행사 커미션</span>
                  <span className="text-blue-600 font-medium">+{fmt(markupTotal)}원</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="text-sm font-bold text-gray-900">최종 고객가</span>
                  <span className="text-lg font-bold text-gray-900">{fmt(finalTotal)}원</span>
                </div>
                {totalPeople > 0 && (
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>1인당</span>
                    <span>{fmt(finalPerPerson)}원</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 text-center">위 금액으로 견적을 확정합니다. 확정 후에는 변경이 어렵습니다.</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              다음
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                이전
              </button>
              <button
                onClick={() => onConfirm(markupPerPerson, markupTotal)}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                확정
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
