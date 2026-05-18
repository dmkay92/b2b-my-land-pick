'use client'

import { useEffect, useState } from 'react'
import { ExcelPreviewModal } from '@/components/ExcelPreviewModal'

interface Props {
  requestId: string
  onClose: () => void
  onSubmitted: () => void
  showSubmit?: boolean
}

interface PreviewResult {
  fileUrl: string
  fileName: string
  filePath: string
  previewHtml?: Record<string, string>
}

export function QuotePreview({ requestId, onClose, onSubmitted, showSubmit = true }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function loadPreview() {
      try {
        const res = await fetch('/api/quotes/draft/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
        })
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json.error ?? '미리보기를 불러올 수 없습니다.')
        }
        const json = await res.json()
        setPreview({ fileUrl: json.fileUrl, fileName: json.fileName, filePath: json.filePath, previewHtml: json.previewHtml })
      } catch (e) {
        setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
      }
      setLoading(false)
    }
    loadPreview()
  }, [requestId])

  async function handleSubmit() {
    if (!preview) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/quotes/draft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          filePath: preview.filePath,
          fileName: preview.fileName,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '제출에 실패했습니다.')
      }
      setSubmitted(true)
      onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : '제출 중 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  // Fullscreen overlay: 로딩/오류/완료 상태는 자체 UI로 처리
  // 미리보기 성공 시 ExcelPreviewModal 위에 제출 버튼 오버레이를 추가
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* 상단바 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            돌아가기
          </button>
          <span className="text-gray-300">|</span>
          <h2 className="text-sm font-semibold text-gray-800">미리보기</h2>
        </div>

        {showSubmit && !submitted && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !preview || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? '제출 중...' : '제출하기'}
          </button>
        )}
      </div>

      {/* 컨텐츠 영역 */}
      <div className="flex-1 overflow-auto relative">
        {/* 로딩 스피너 */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm">미리보기 생성 중...</p>
          </div>
        )}

        {/* 오류 메시지 */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg className="w-10 h-10 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* 제출 완료 메시지 */}
        {submitted && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-800">제출 완료!</p>
              <p className="text-sm text-gray-500">이 탭을 닫아도 됩니다.</p>
            </div>
          </div>
        )}

        {/* 엑셀 미리보기 — ExcelPreviewModal은 fixed 오버레이이므로
            QuotePreview의 상단바 위에 렌더링됨. onClose로 QuotePreview도 함께 닫힘 */}
        {!loading && !error && !submitted && preview && (
          <ExcelPreviewModal
            fileUrl={preview.fileUrl}
            fileName={preview.fileName}
            onClose={onClose}
            previewHtml={preview.previewHtml}
          />
        )}
      </div>
    </div>
  )
}
