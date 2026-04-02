'use client'

import { useState } from 'react'
import type { BankOcrResult } from '@/lib/supabase/types'

const BANK_OPTIONS = [
  '국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행',
  'IBK기업은행', '카카오뱅크', '토스뱅크', 'SC제일은행', '씨티은행',
  '케이뱅크', '수협은행', '대구은행', '부산은행', '경남은행',
  '광주은행', '전북은행', '제주은행', '산업은행', '우체국',
]

interface Props {
  ocr: BankOcrResult | null
  initial: BankOcrResult | null
  onNext: (values: BankOcrResult) => void
  onBack: () => void
}

export function Step4BankInfo({ ocr, initial, onNext, onBack }: Props) {
  const [values, setValues] = useState<BankOcrResult>({
    bank_name: initial?.bank_name ?? ocr?.bank_name ?? '',
    bank_account: initial?.bank_account ?? ocr?.bank_account ?? '',
    bank_holder: initial?.bank_holder ?? ocr?.bank_holder ?? '',
  })

  function set(key: keyof BankOcrResult, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.bank_name || !values.bank_account || !values.bank_holder) return
    onNext(values)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">거의 다 왔어요!</h2>
        <p className="mt-1 text-sm text-gray-500">정산 계좌를 확인해주세요. 통장 사본에서 자동으로 채워드렸어요.</p>
      </div>

      <div className="rounded-xl bg-green-50 border border-green-100 p-4 space-y-3">
        <p className="text-xs font-medium text-green-700 flex items-center gap-1">
          <span>✅</span> AI가 채워드렸어요 — 수정이 필요하면 변경해주세요
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">은행명 <span className="text-red-400">*</span></label>
          <select
            required
            value={values.bank_name}
            onChange={e => set('bank_name', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">은행을 선택해주세요</option>
            {BANK_OPTIONS.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">계좌번호 <span className="text-red-400">*</span></label>
          <input
            type="text"
            required
            value={values.bank_account}
            onChange={e => set('bank_account', e.target.value)}
            placeholder="계좌번호를 입력해주세요"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">예금주명 <span className="text-red-400">*</span></label>
          <input
            type="text"
            required
            value={values.bank_holder}
            onChange={e => set('bank_holder', e.target.value)}
            placeholder="예금주명을 입력해주세요"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ← 이전
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          다음
        </button>
      </div>
    </form>
  )
}
