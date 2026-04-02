'use client'

import { useState, useRef } from 'react'
import type { SignupOcrResult, BankOcrResult } from '@/lib/supabase/types'

interface Props {
  onComplete: (bizFile: File, bankFile: File, biz: SignupOcrResult, bank: BankOcrResult) => void
  onBack: () => void
}

function DropZone({
  label,
  hint,
  file,
  onFile,
}: {
  label: string
  hint: string
  file: File | null
  onFile: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
        file ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]) }}
      />
      {file ? (
        <>
          <span className="text-2xl">✅</span>
          <p className="text-sm font-medium text-green-700">{file.name}</p>
          <p className="text-xs text-green-500">클릭하여 파일 변경</p>
        </>
      ) : (
        <>
          <span className="text-2xl">📄</span>
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">{hint}</p>
          <p className="text-xs text-gray-300">JPG, PNG, PDF</p>
        </>
      )}
    </div>
  )
}

async function runOcr(file: File, type: 'biz' | 'bank') {
  const form = new FormData()
  form.append('file', file)
  form.append('type', type)
  const res = await fetch('/api/signup/ocr', { method: 'POST', body: form })
  if (!res.ok) throw new Error('OCR 처리 실패')
  const { result } = await res.json()
  return result
}

export function Step2Documents({ onComplete, onBack }: Props) {
  const [bizFile, setBizFile] = useState<File | null>(null)
  const [bankFile, setBankFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canProceed = bizFile && bankFile

  async function handleNext() {
    if (!bizFile || !bankFile) return
    setLoading(true)
    setError(null)
    try {
      const [biz, bank] = await Promise.all([
        runOcr(bizFile, 'biz'),
        runOcr(bankFile, 'bank'),
      ])
      onComplete(bizFile, bankFile, biz, bank)
    } catch {
      setError('서류 읽기에 실패했습니다. 이미지가 선명한지 확인 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">서류를 올리면 나머지는 자동으로 채워드릴게요</h2>
        <p className="mt-1 text-sm text-gray-500">선명한 이미지나 PDF를 올려주세요. AI가 내용을 읽어 자동으로 입력해드려요.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DropZone
          label="사업자등록증"
          hint="사업자 정보 자동 입력에 사용"
          file={bizFile}
          onFile={setBizFile}
        />
        <DropZone
          label="통장 사본"
          hint="계좌 정보 자동 입력에 사용"
          file={bankFile}
          onFile={setBankFile}
        />
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500">AI가 서류를 읽고 있어요...</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ← 이전
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed || loading}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {loading ? '읽는 중...' : '다음'}
        </button>
      </div>
    </div>
  )
}
