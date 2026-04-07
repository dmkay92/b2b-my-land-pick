'use client'

import { useState, useEffect } from 'react'
import type { SignupOcrResult } from '@/lib/supabase/types'
import { formatPhoneByCountry } from '@/lib/phoneFormat'
import { PhoneCountrySelect } from './PhoneCountrySelect'

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

const COUNTRY_CODES = [
  { code: '+82',  label: '한국 +82' },
  { code: '+31',  label: '네덜란드 +31' },
  { code: '+977', label: '네팔 +977' },
  { code: '+64',  label: '뉴질랜드 +64' },
  { code: '+49',  label: '독일 +49' },
  { code: '+853', label: '마카오 +853' },
  { code: '+60',  label: '말레이시아 +60' },
  { code: '+52',  label: '멕시코 +52' },
  { code: '+960', label: '몰디브 +960' },
  { code: '+95',  label: '미얀마 +95' },
  { code: '+1',   label: '미국·캐나다 +1' },
  { code: '+856', label: '라오스 +856' },
  { code: '+855', label: '캄보디아 +855' },
  { code: '+886', label: '대만 +886' },
  { code: '+33',  label: '프랑스 +33' },
  { code: '+63',  label: '필리핀 +63' },
  { code: '+48',  label: '폴란드 +48' },
  { code: '+351', label: '포르투갈 +351' },
  { code: '+679', label: '피지 +679' },
  { code: '+30',  label: '그리스 +30' },
  { code: '+65',  label: '싱가포르 +65' },
  { code: '+34',  label: '스페인 +34' },
  { code: '+41',  label: '스위스 +41' },
  { code: '+43',  label: '오스트리아 +43' },
  { code: '+971', label: 'UAE +971' },
  { code: '+44',  label: '영국 +44' },
  { code: '+39',  label: '이탈리아 +39' },
  { code: '+62',  label: '인도네시아 +62' },
  { code: '+91',  label: '인도 +91' },
  { code: '+81',  label: '일본 +81' },
  { code: '+86',  label: '중국 +86' },
  { code: '+420', label: '체코 +420' },
  { code: '+385', label: '크로아티아 +385' },
  { code: '+66',  label: '태국 +66' },
  { code: '+90',  label: '터키 +90' },
  { code: '+84',  label: '베트남 +84' },
  { code: '+36',  label: '헝가리 +36' },
  { code: '+852', label: '홍콩 +852' },
  { code: '+61',  label: '호주 +61' },
]

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
  // initial이 있으면 이미 검증 통과 후 돌아온 것이므로 'valid'로 초기화
  const [brnStatus, setBrnStatus] = useState<BrnStatus>(initial ? 'valid' : 'idle')
  const [brnMessage, setBrnMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordConfirm, setPasswordConfirm] = useState('')

  // 국가코드
  const [mobileCc, setMobileCc] = useState('+82')
  const [landlineCc, setLandlineCc] = useState('+82')

  function handleMobileCcChange(code: string) {
    setMobileCc(code)
    setValues(prev => ({ ...prev, phone_mobile: '' }))
  }

  function handleLandlineCcChange(code: string) {
    setLandlineCc(code)
    setValues(prev => ({ ...prev, phone_landline: '' }))
  }

  useEffect(() => {
    const brn = (ocr?.business_registration_number ?? '').replace(/[^0-9]/g, '')
    if (brn.length === 10 && !initial) {
      setBrnStatus('loading')
      fetch('/api/signup/validate-brn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brn }),
      })
        .then(r => r.json())
        .then(data => {
          setBrnStatus(data.valid ? 'valid' : 'invalid')
          setBrnMessage(data.message ?? '')
        })
        .catch(() => setBrnStatus('idle'))
    }
  }, [])

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
    const pwValid =
      values.password.length >= 8 &&
      /[A-Z]/.test(values.password) &&
      /[a-z]/.test(values.password) &&
      /[0-9]/.test(values.password) &&
      /[^A-Za-z0-9]/.test(values.password)
    if (!pwValid) return
    if (values.password !== passwordConfirm) return
    onNext({
      ...values,
      phone_mobile: values.phone_mobile ? `${mobileCc} ${values.phone_mobile}` : '',
      phone_landline: values.phone_landline ? `${landlineCc} ${values.phone_landline}` : '',
    })
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
                brnStatus === 'valid' ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 text-xs font-medium text-green-600 border border-green-200 whitespace-nowrap">
                    ✓ 검증됨
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={validateBrn}
                    disabled={brnStatus === 'loading'}
                    className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {brnStatus === 'loading' ? '확인 중' : '검증'}
                  </button>
                )
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
              tabIndex={-1}
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
            >
              {showPassword ? '숨기기' : '보기'}
            </button>
          </div>
          {values.password.length > 0 && (() => {
            const checks = [
              { label: '영문 대문자', ok: /[A-Z]/.test(values.password) },
              { label: '영문 소문자', ok: /[a-z]/.test(values.password) },
              { label: '숫자', ok: /[0-9]/.test(values.password) },
              { label: '특수문자', ok: /[^A-Za-z0-9]/.test(values.password) },
              { label: '8자 이상', ok: values.password.length >= 8 },
            ]
            const passed = checks.filter(c => c.ok).length
            const allPassed = passed === checks.length
            const strengthLabel = allPassed ? '적합' : '부적합'
            const strengthColor = allPassed ? 'bg-green-500' : passed <= 2 ? 'bg-red-400' : passed <= 3 ? 'bg-orange-400' : 'bg-blue-400'
            const strengthTextColor = allPassed ? 'text-green-600' : 'text-red-500'
            return (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= passed ? strengthColor : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${strengthTextColor}`}>{strengthLabel}</span>
                </div>
                <div className="flex gap-1">
                  {checks.map(({ label, ok }) => (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors duration-200 ${
                        ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <span className="text-[10px]">{ok ? '✓' : '○'}</span>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호 확인 <span className="text-red-400">*</span></label>
          <input
            type="password"
            required
            value={passwordConfirm}
            onChange={e => setPasswordConfirm(e.target.value)}
            placeholder="비밀번호를 다시 입력해주세요"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              passwordConfirm.length > 0 && values.password !== passwordConfirm
                ? 'border-red-300'
                : 'border-gray-300'
            }`}
          />
          {passwordConfirm.length > 0 && values.password !== passwordConfirm && (
            <p className="mt-1 text-xs text-red-500">비밀번호가 일치하지 않습니다.</p>
          )}
          {passwordConfirm.length > 0 && values.password === passwordConfirm && values.password.length >= 8 && (
            <p className="mt-1 text-xs text-green-600">✓ 비밀번호가 일치합니다.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">대표 무선 연락처 <span className="text-red-400">*</span></label>
          <div className="flex gap-2">
            <PhoneCountrySelect
              codes={COUNTRY_CODES}
              value={mobileCc}
              onChange={handleMobileCcChange}
            />
            <input
              type="tel"
              required
              value={values.phone_mobile}
              onChange={e => set('phone_mobile', formatPhoneByCountry(mobileCc, e.target.value))}
              placeholder={mobileCc === '+82' ? '010-0000-0000' : '번호 입력'}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            대표 유선 연락처 <span className="text-gray-400 font-normal">(선택)</span>
          </label>
          <div className="flex gap-2">
            <PhoneCountrySelect
              codes={COUNTRY_CODES}
              value={landlineCc}
              onChange={handleLandlineCcChange}
            />
            <input
              type="tel"
              value={values.phone_landline}
              onChange={e => set('phone_landline', formatPhoneByCountry(landlineCc, e.target.value))}
              placeholder={landlineCc === '+82' ? '02-000-0000' : '번호 입력'}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
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
          disabled={
            brnStatus !== 'valid' ||
            values.password.length < 8 ||
            !/[A-Z]/.test(values.password) ||
            !/[a-z]/.test(values.password) ||
            !/[0-9]/.test(values.password) ||
            !/[^A-Za-z0-9]/.test(values.password) ||
            values.password !== passwordConfirm
          }
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          다음
        </button>
      </div>
    </form>
  )
}
