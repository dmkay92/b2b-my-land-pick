'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDate, calculateTotalPeople, hotelGradeLabel, getCountryName } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'

type QuoteWithPricing = Quote & { pricing?: { total: number | null; per_person: number | null } }
import { ExcelPreviewModal } from '@/components/ExcelPreviewModal'

export default function LandcoRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [myQuotes, setMyQuotes] = useState<QuoteWithPricing[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const [selectionResult, setSelectionResult] = useState<'selected' | 'lost' | null>(null)
  const [hasDraft, setHasDraft] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/requests/${id}`)
      const json = await res.json()
      setRequest(json.request)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const allQuotes: QuoteWithPricing[] = json.quotes ?? []
        const myOnly = allQuotes
          .filter(q => q.landco_id === user.id)
          .sort((a, b) => b.version - a.version)
        setMyQuotes(myOnly)

        if (json.request?.status === 'finalized') {
          const selRes = await fetch(`/api/quotes/selection?requestId=${id}`)
          if (selRes.ok) {
            const selJson = await selRes.json()
            if (selJson.selection?.landco_id === user.id) {
              setSelectionResult('selected')
            } else {
              setSelectionResult('lost')
            }
          } else {
            setSelectionResult('lost')
          }
        }
      }
    }
    async function loadDraft() {
      const draftRes = await fetch(`/api/quotes/draft?requestId=${id}`)
      if (draftRes.ok) {
        const { draft } = await draftRes.json()
        setHasDraft(!!draft)
      }
    }
    load()
    loadDraft()
  }, [id])

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('requestId', id)

    const res = await fetch('/api/quotes', { method: 'POST', body: formData })
    const json = await res.json()

    if (!res.ok) {
      setUploadError(json.error)
    } else {
      // pricing 포함 전체 reload
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const refreshRes = await fetch(`/api/requests/${id}`)
        const refreshJson = await refreshRes.json()
        const allQuotes: QuoteWithPricing[] = refreshJson.quotes ?? []
        setMyQuotes(allQuotes.filter(q => q.landco_id === user.id).sort((a, b) => b.version - a.version))
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.xlsx')) {
      setUploadError('.xlsx 파일만 업로드 가능합니다.')
      return
    }
    await uploadFile(file)
  }

  function handleDownloadTemplate() {
    window.location.href = `/api/excel/template?requestId=${id}`
  }

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const total = calculateTotalPeople(request)

  return (
    <>
      {preview && (
        <ExcelPreviewModal
          fileUrl={preview.url}
          fileName={preview.name}
          onClose={() => setPreview(null)}
        />
      )}
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{request.event_name}</h1>

      {/* 선택 결과 배너 */}
      {selectionResult === 'selected' && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-6">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="text-sm font-semibold text-emerald-700">축하합니다! 귀사의 견적이 선택되었습니다.</p>
            <p className="text-xs text-emerald-600 mt-0.5">여행사와 채팅으로 세부 사항을 조율해보세요.</p>
          </div>
        </div>
      )}
      {selectionResult === 'lost' && (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 mb-6">
          <span className="text-2xl">📋</span>
          <div>
            <p className="text-sm font-semibold text-gray-600">이번 견적 요청은 다른 랜드사가 선택되었습니다.</p>
            <p className="text-xs text-gray-400 mt-0.5">다음 기회를 노려보세요.</p>
          </div>
        </div>
      )}

      {/* 견적 조건 카드 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">견적 조건</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">목적지</p>
            <p className="text-sm font-medium text-gray-800">{getCountryName(request.destination_country)} {request.destination_city}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">출발일</p>
            <p className="text-sm font-medium text-gray-800">{formatDate(request.depart_date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">귀국일</p>
            <p className="text-sm font-medium text-gray-800">{formatDate(request.return_date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">총 인원</p>
            <p className="text-sm font-medium text-gray-800">{total}명
              <span className="text-xs text-gray-400 font-normal ml-1">
                (성인 {request.adults} · 아동 {request.children} · 유아 {request.infants} · 인솔 {request.leaders})
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">호텔 등급</p>
            <p className="text-sm font-medium text-gray-800">{hotelGradeLabel(request.hotel_grade)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">견적 마감</p>
            <p className="text-sm font-medium text-red-500">{formatDate(request.deadline)}</p>
          </div>
        </div>
        {request.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">요청사항</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.notes}</p>
          </div>
        )}
      </div>

      {/* 견적서 제출 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">견적서 제출</h2>

        {hasDraft && (
          <div className="flex items-center justify-between mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
            <span className="text-sm text-amber-700">💾 임시저장된 작업이 있습니다</span>
            <a
              href={`/landco/requests/${id}/quote/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-amber-700 underline"
            >
              이어서 작성하기 ↗
            </a>
          </div>
        )}

        {/* 드래그앤드롭 업로드 영역 */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4 ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="text-3xl mb-2">📂</div>
          {uploading ? (
            <p className="text-sm text-blue-600 font-medium">업로드 중...</p>
          ) : isDragging ? (
            <p className="text-sm text-blue-600 font-medium">여기에 놓으세요</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 font-medium">파일을 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx 파일만 허용됩니다</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleDownloadTemplate}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium bg-white"
          >
            ↓ 템플릿 다운로드 (.xlsx)
          </button>
          <a
            href={`/landco/requests/${id}/quote/new`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            ✏️ 웹에서 직접 작성 ↗
          </a>
        </div>
        {uploadError && <p className="text-red-500 text-sm mt-3">{uploadError}</p>}
      </div>

      {/* 제출 이력 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="font-semibold text-lg mb-4">
          제출 이력 <span className="text-gray-400 font-normal text-sm">({myQuotes.length}개 버전)</span>
        </h2>
        {myQuotes.length === 0 ? (
          <p className="text-gray-400 text-sm">아직 제출된 견적서가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {myQuotes.map(q => (
              <div key={q.id} className="py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-medium shrink-0">
                    v{q.version}
                  </span>
                  <span className="text-sm text-gray-600 truncate min-w-0 flex-1">{q.file_name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(q.submitted_at).toLocaleString('ko-KR')}</span>
                    <button
                      onClick={() => setPreview({ url: q.file_url, name: q.file_name })}
                      className="border border-gray-300 text-gray-600 rounded-lg px-3 py-1 text-xs font-medium bg-white hover:bg-gray-50 whitespace-nowrap"
                    >
                      미리보기
                    </button>
                    <a
                      href={q.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#009CF0] text-white rounded-lg px-3 py-1 text-xs font-medium hover:bg-[#0088D9] whitespace-nowrap"
                    >
                      ↓ 다운로드
                    </a>
                  </div>
                </div>
                {(q.pricing?.total != null || q.pricing?.per_person != null) && (
                  <div className="flex gap-4 mt-1.5 ml-1">
                    {q.pricing?.total != null && (
                      <span className="text-xs text-gray-500">
                        총 합계 <span className="font-semibold text-gray-800">{q.pricing.total.toLocaleString('ko-KR')}원</span>
                      </span>
                    )}
                    {q.pricing?.per_person != null && (
                      <span className="text-xs text-gray-500">
                        1인당 <span className="font-semibold text-blue-600">{Math.ceil(q.pricing.per_person).toLocaleString('ko-KR')}원</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
