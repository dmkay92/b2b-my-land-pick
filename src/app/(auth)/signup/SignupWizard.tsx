'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SignupDraft, UserRole } from '@/lib/supabase/types'
import { Step1Role } from './steps/Step1Role'
import { Step2Documents } from './steps/Step2Documents'
import { Step3BasicInfo } from './steps/Step3BasicInfo'
import { Step4BankInfo } from './steps/Step4BankInfo'
import { Step5Countries } from './steps/Step5Countries'

const DRAFT_KEY = 'signup_draft'

const EMPTY_DRAFT: SignupDraft = { role: null, step: 1, ocr: { biz: null, bank: null }, basicInfo: null, bankInfo: null, countries: [] }

function ProgressBar({ step, role }: { step: number; role: UserRole | null }) {
  const total = role === 'landco' ? 5 : 4
  const pct = Math.round(((step - 1) / total) * 100)
  return (
    <div className="mb-8">
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function SignupWizard() {
  const router = useRouter()
  const [draft, setDraft] = useState<SignupDraft>(EMPTY_DRAFT)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const bizFileRef = useRef<File | null>(null)
  const bankFileRef = useRef<File | null>(null)
  const submitCalledRef = useRef(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) setDraft(JSON.parse(raw))
    } catch {}
  }, [])

  function updateDraft(patch: Partial<SignupDraft>) {
    setDraft(prev => {
      const next = { ...prev, ...patch }
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  async function handleFinalSubmit(countries: string[]) {
    if (submitCalledRef.current) return
    submitCalledRef.current = true

    if (!draft.basicInfo || !draft.bankInfo) return
    setSubmitting(true)
    setSubmitError(null)

    const supabase = createClient()

    // 1. auth.signUp
    const { data, error: signupError } = await supabase.auth.signUp({
      email: draft.basicInfo.email,
      password: draft.basicInfo.password,
      options: {
        data: {
          role: draft.role,
          company_name: draft.basicInfo.company_name,
        },
      },
    })

    if (signupError || !data.user) {
      setSubmitError(signupError?.message ?? '가입에 실패했습니다.')
      setSubmitting(false)
      submitCalledRef.current = false
      return
    }

    const userId = data.user.id

    // 2. Storage 파일 업로드 (공개 URL로 저장)
    let bizUrl: string | null = null
    let bankUrl: string | null = null

    if (bizFileRef.current) {
      const ext = bizFileRef.current.name.split('.').pop() ?? 'jpg'
      const { data: bizData } = await supabase.storage
        .from('signup-documents')
        .upload(`${userId}/biz-registration.${ext}`, bizFileRef.current, { upsert: true })
      if (bizData?.path) {
        bizUrl = supabase.storage.from('signup-documents').getPublicUrl(bizData.path).data.publicUrl
      }
    }

    if (bankFileRef.current) {
      const ext = bankFileRef.current.name.split('.').pop() ?? 'jpg'
      const { data: bankData } = await supabase.storage
        .from('signup-documents')
        .upload(`${userId}/bank-statement.${ext}`, bankFileRef.current, { upsert: true })
      if (bankData?.path) {
        bankUrl = supabase.storage.from('signup-documents').getPublicUrl(bankData.path).data.publicUrl
      }
    }

    // 3. 서버사이드 API로 프로필 업데이트 (service role - RLS 우회, 타이밍 안정)
    const profileRes = await fetch('/api/signup/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        business_registration_number: draft.basicInfo.business_registration_number,
        representative_name: draft.basicInfo.representative_name,
        phone_mobile: draft.basicInfo.phone_mobile,
        phone_landline: draft.basicInfo.phone_landline || null,
        bank_name: draft.bankInfo.bank_name,
        bank_account: draft.bankInfo.bank_account,
        bank_holder: draft.bankInfo.bank_holder,
        document_biz_url: bizUrl,
        document_bank_url: bankUrl,
        ...(draft.role === 'landco' ? { country_codes: countries } : {}),
      }),
    })
    if (!profileRes.ok) {
      const { error } = await profileRes.json()
      console.error('Profile update error:', error)
    }

    // 4. sessionStorage 정리
    try { sessionStorage.removeItem(DRAFT_KEY) } catch {}

    router.push('/pending')
  }

  const { step, role } = draft

  if (step === 1) {
    return (
      <Step1Role
        onSelect={selectedRole => updateDraft({ role: selectedRole, step: 2 })}
      />
    )
  }

  if (step === 2) {
    return (
      <div>
        <ProgressBar step={2} role={role} />
        <Step2Documents
          onComplete={(bizFile, bankFile, biz, bank) => {
            bizFileRef.current = bizFile
            bankFileRef.current = bankFile
            updateDraft({ ocr: { biz, bank }, step: 3 })
          }}
          onBack={() => updateDraft({ step: 1 })}
        />
      </div>
    )
  }

  if (step === 3) {
    return (
      <div>
        <ProgressBar step={3} role={role} />
        <Step3BasicInfo
          ocr={draft.ocr.biz}
          initial={draft.basicInfo}
          onNext={basicInfo => updateDraft({ basicInfo, step: 4 })}
          onBack={() => updateDraft({ step: 2 })}
        />
      </div>
    )
  }

  if (step === 4) {
    const isAgency = role !== 'landco'
    return (
      <div>
        <ProgressBar step={4} role={role} />
        <Step4BankInfo
          ocr={draft.ocr.bank}
          initial={draft.bankInfo}
          onNext={bankInfo => {
            if (isAgency) {
              updateDraft({ bankInfo, step: 99 })
            } else {
              updateDraft({ bankInfo, step: 5 })
            }
          }}
          onBack={() => updateDraft({ step: 3 })}
        />
      </div>
    )
  }

  if (step === 5 && role === 'landco') {
    return (
      <div>
        <ProgressBar step={5} role={role} />
        <Step5Countries
          initial={draft.countries}
          onNext={countries => {
            updateDraft({ countries })
            handleFinalSubmit(countries)
          }}
          onBack={() => updateDraft({ step: 4 })}
        />
        {submitting && <p className="mt-3 text-sm text-gray-400 text-center">가입 처리 중...</p>}
        {submitError && (
          <div className="mt-3 text-center">
            <p className="text-sm text-red-500">{submitError}</p>
            <button
              onClick={() => {
                submitCalledRef.current = false
                setSubmitError(null)
              }}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    )
  }

  // step 99: agency 최종 제출
  if (step === 99) {
    if (!submitting && !submitCalledRef.current) {
      handleFinalSubmit([])
    }
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        {!submitError && (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-500">가입 처리 중...</p>
          </>
        )}
        {submitError && (
          <div className="text-center">
            <p className="text-sm text-red-500">{submitError}</p>
            <button
              onClick={() => {
                submitCalledRef.current = false
                updateDraft({ step: 4 })
              }}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    )
  }

  return null
}
