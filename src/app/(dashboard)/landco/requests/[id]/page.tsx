'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDate, calculateTotalPeople, hotelGradeLabel } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'

export default function LandcoRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [myQuotes, setMyQuotes] = useState<Quote[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/requests/${id}`)
      const json = await res.json()
      setRequest(json.request)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('*')
          .eq('request_id', id)
          .eq('landco_id', user.id)
          .order('version', { ascending: false })
        setMyQuotes(quotes ?? [])
      }
    }
    load()
  }, [id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

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
      setMyQuotes(prev => [json.data, ...prev])
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDownloadTemplate() {
    window.location.href = `/api/excel/template?requestId=${id}`
  }

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const total = calculateTotalPeople(request)

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{request.event_name}</h1>
      <p className="text-gray-500 text-sm mb-6">
        {request.destination_city} ({request.destination_country}) ·
        {formatDate(request.depart_date)} ~ {formatDate(request.return_date)} ·
        총 {total}명 · {hotelGradeLabel(request.hotel_grade)}
      </p>

      {request.notes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <p className="text-sm font-medium text-yellow-800 mb-1">요청사항</p>
          <p className="text-sm text-yellow-700">{request.notes}</p>
        </div>
      )}

      {/* 견적서 제출 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">견적서 제출</h2>
        <div className="flex gap-3 mb-4">
          <button
            onClick={handleDownloadTemplate}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 text-sm"
          >
            템플릿 다운로드 (.xlsx)
          </button>
          <label className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? '업로드 중...' : '견적서 업로드 (.xlsx)'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>
        {uploadError && <p className="text-red-500 text-sm">{uploadError}</p>}
        <p className="text-xs text-gray-400">
          * 템플릿을 다운로드하여 작성 후 업로드해주세요. .xlsx 파일만 허용됩니다.
        </p>
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
              <div key={q.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <span className="font-medium text-sm">v{q.version}</span>
                  <span className="text-gray-500 text-sm ml-2">{q.file_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{new Date(q.submitted_at).toLocaleString('ko-KR')}</span>
                  <a
                    href={q.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-sm hover:underline"
                  >
                    다운로드
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
