'use client'

import { useState } from 'react'
import type { SignupOcrResult } from '@/lib/supabase/types'

interface BasicInfoValues {
  business_registration_number: string
  company_name: string
  representative_name: string
  email: string
  password: string
  phone_mobile: string
  phone_landline: string
}

interface Props {
  ocr: SignupOcrResult | null
  initial: BasicInfoValues | null
  onNext: (values: BasicInfoValues) => void
  onBack: () => void
}

type BrnStatus = 'idle' | 'loading' | 'valid' | 'invalid'

export function Step3BasicInfo({ ocr, initial, onNext, onBack }: Props) {
  const [values, setValues] = useState<BasicInfoValues>({
    business_registration_number: initial?.business_registration_number ?? ocr?.business_registration_number ?? '',
    company_name: initial?.company_name ?? ocr?.company_name ?? '',
    representative_name: initial?.representative_name ?? ocr?.representative_name ?? '',
    email: initial?.email ?? '',
    password: initial?.password ?? '',
    phone_mobile: initial?.phone_mobile ?? '',
    phone_landline: initial?.phone_landline ?? '',
  })
  const [brnStatus, setBrnStatus] = useState<BrnStatus>('idle')
  const [brnMessage, setBrnMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function set(key: keyof BasicInfoValues, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
    if (key === 'business_registration_number') {
      setBrnStatus('idle')
      setBrnMessage('')
    }
  }

  async function validateBrn() {
    const brn = values.business_registration_number.replace(/[^0-9]/g, '')
    if (brn.length !== 10) {
      setBrnStatus('invalid')
      setBrnMessage('사업자등록번호는 10자리입니다.')
      return
    }
    setBrnStatus('loading')
    const res = await fetch('/api/signup/validate-brn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brn }),
    })
    const data = await res.json()
    setBrnStatus(data.valid ? 'valid' : 'invalid')
    setBrnMessage(data.message ?? '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (brnStatus !== 'valid') {
      setBrnMessage('사업자등록번호를 먼저 검증해주세요.')
      return
    }
    if (values.password.length < 8) return
    onNext(values)
  }

  const ocrFields: { key: keyof BasicInfoValues; label: string }[] = [
    { key: 'business_registration_number', label: '사업자등록번호' },
    { key: 'company_name', label: '사업자명(상호)' },
    { key: 'representative_name', label: '대표자명' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">AI가 채워드렸어요</h2>
        <p className="mt-1 text-sm text-gray-500">내용을 확인하고 연락처를 입력해주세요.</p>
      </div>

      {/* AI 채움 섹션 */}
      <div className="rounded-xl bg-green-50 border border-green-100 p-4 space-y-3">
        <p className="text-xs font-medium text-green-700 flex items-center gap-1">
          <span>✅</span> AI가 채워드렸어요 — 수정이 필요하면 변경해주세요
        </p>
        {ocrFields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={values[key]}
                onChange={e => set(key, e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {key === 'business_registration_number' && (
                <button
                  type="button"
                  onClick={validateBrn}
                  disabled={brnStatus === 'loading'}
                  className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {brnStatus === 'loading' ? '확인 중' : '검증'}
                </button>
              )}
            </div>
            {key === 'business_registration_number' && brnMessage && (
              <p className={`mt-1 text-xs ${brnStatus === 'valid' ? 'text-green-600' : 'text-red-500'}`}>
                {brnStatus === 'valid' ? '✓ ' : '✗ '}{brnMessage}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 수동 입력 섹션 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 border-t border-gray-200" />
          <p className="text-xs font-medium text-gray-400 whitespace-nowrap">직접 입력해주세요</p>
          <div className="flex-1 border-t border-gray-200" />
        </div>
        <p className="text-xs text-gray-400">아래 항목은 로그인 및 연락에 사용되니 직접 입력해주세요.</p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">대표 이메일 <span className="text-red-400">*</span></label>
          <input
            type="email"
            required
            value={values.email}
            onChange={e => set('email', e.target.value)}
            placeholder="로그인 계정으로 사용됩니다"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호 <span className="text-red-400">*</span></label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={values.password}
              onChange={e => set('password', e.target.value)}
              placeholder="8자 이상"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
            >
              {showPassword ? '숨기기' : '보기'}
            </button>
          </div>
          {values.password.length > 0 && values.password.length < 8 && (
            <p className="mt-1 text-xs text-red-500">8자 이상 입력해주세요.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">대표 무선 연락처 <span className="text-red-400">*</span></label>
          <input
            type="tel"
            required
            value={values.phone_mobile}
            onChange={e => set('phone_mobile', e.target.value)}
            placeholder="010-0000-0000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            대표 유선 연락처 <span className="text-gray-400 font-normal">(선택)</span>
          </label>
          <input
            type="tel"
            value={values.phone_landline}
            onChange={e => set('phone_landline', e.target.value)}
            placeholder="02-0000-0000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
          disabled={brnStatus !== 'valid'}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          다음
        </button>
      </div>
    </form>
  )
}
