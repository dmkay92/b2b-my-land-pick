'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatDateWithDay, calculateTotalPeople, hotelGradeLabel, getCountryName } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'

type QuoteWithPricing = Quote & { pricing?: { total: number | null; per_person: number | null }; pricing_mode?: 'detailed' | 'summary' }
import { AttachmentPreviewModal } from '@/components/AttachmentPreviewModal'
import { BackButton } from '@/components/BackButton'

export default function LandcoRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [myQuotes, setMyQuotes] = useState<QuoteWithPricing[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectionResult, setSelectionResult] = useState<'selected' | 'lost' | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [showNewQuoteWarning, setShowNewQuoteWarning] = useState(false)
  const [isAbandoned, setIsAbandoned] = useState(false)
  const [paymentMemo, setPaymentMemo] = useState('')
  const [paymentConfirming, setPaymentConfirming] = useState(false)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [savedMemo, setSavedMemo] = useState<string | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string } | null>(null)
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null)
  const [excelParsed, setExcelParsed] = useState(false)
  const [templateModal, setTemplateModal] = useState<{ quoteId: string; defaultName: string } | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [paymentSchedule, setPaymentSchedule] = useState<{ template_type: string; total_amount: number; approval_status: string } | null>(null)
  const [paymentInstallments, setPaymentInstallments] = useState<{ id: string; label: string; rate: number; amount: number; paid_amount: number; due_date: string; status: string }[]>([])
  const [landcoQuoteTotal, setLandcoQuoteTotal] = useState<number | null>(null)

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

        if (json.request?.status === 'finalized' || json.request?.status === 'payment_pending') {
          const selRes = await fetch(`/api/quotes/selection?requestId=${id}`)
          if (selRes.ok) {
            const selJson = await selRes.json()
            if (selJson.selection?.landco_id === user.id) {
              setSelectionResult('selected')
              setSelectedQuoteId(selJson.selection.selected_quote_id)
              if (selJson.selection?.payment_memo) setSavedMemo(selJson.selection.payment_memo)
            } else {
              setSelectionResult('lost')
            }
          } else {
            setSelectionResult('lost')
          }
        }

        // 결제 일정 + 정산 데이터 로드
        if (json.request?.status === 'payment_pending' || json.request?.status === 'finalized') {
          const schedRes = await fetch(`/api/payment-schedule?requestId=${id}`)
          if (schedRes.ok) {
            const { schedule, installments, settlement } = await schedRes.json()
            if (schedule) setPaymentSchedule(schedule)
            if (installments) setPaymentInstallments(installments)
            if (settlement?.landco_quote_total) setLandcoQuoteTotal(settlement.landco_quote_total)
          }
        }

        const { data: abandonmentData } = await supabase
          .from('quote_abandonments')
          .select('id')
          .eq('request_id', id)
          .eq('landco_id', user.id)
          .maybeSingle()
        setIsAbandoned(!!abandonmentData)
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

    try {
      // 1. AI 파싱
      const formData = new FormData()
      formData.append('file', file)
      const parseRes = await fetch('/api/quotes/parse-excel', { method: 'POST', body: formData })
      if (!parseRes.ok) {
        const err = await parseRes.json()
        setUploadError(err.error || '엑셀 분석에 실패했습니다.')
        return
      }
      const { itinerary, pricing } = await parseRes.json()

      // 2. Draft에 저장
      await fetch('/api/quotes/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, itinerary, pricing }),
      })

      // 3. 파싱 완료 표시 — 버튼으로 에디터 열기 유도
      setExcelParsed(true)
      setHasDraft(true)
    } catch {
      setUploadError('엑셀 분석 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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

  async function handlePaymentConfirm() {
    setPaymentConfirming(true)
    const res = await fetch('/api/quotes/payment-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, memo: paymentMemo || undefined }),
    })
    if (res.ok) {
      setPaymentConfirmed(true)
      setRequest(prev => prev ? { ...prev, status: 'finalized' } : prev)
      setSelectionResult('selected')
    }
    setPaymentConfirming(false)
  }

  const hasOverdue = paymentInstallments.some(i => i.status === 'overdue')
  const canCancel = selectionResult === 'selected' && hasOverdue && request?.status !== 'closed' && request?.status !== 'finalized'

  async function handleLandcoCancel() {
    setCancelling(true)
    const res = await fetch(`/api/requests/${id}/landco-cancel`, { method: 'POST' })
    if (res.ok) {
      setRequest(prev => prev ? { ...prev, status: 'closed' as const } : prev)
      setShowCancelModal(false)
    }
    setCancelling(false)
  }

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const isUploadDisabled = request.status === 'finalized' || request.status === 'payment_pending' || isAbandoned

  const total = calculateTotalPeople(request)
  const nights = Math.round((new Date(request.return_date).getTime() - new Date(request.depart_date).getTime()) / 86400000)
  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const deadlineDays = Math.ceil((new Date(request.deadline).getTime() - new Date(todayKST).getTime()) / 86400000)

  return (
    <>
      {templateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">템플릿 저장</h3>
              <p className="text-xs text-gray-500 mt-0.5">이 견적서를 템플릿으로 저장하면 다음 견적 작성 시 불러올 수 있습니다.</p>
            </div>
            <div className="px-5 py-4">
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">템플릿 이름</label>
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setTemplateModal(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                disabled={!templateName.trim() || savingTemplateId === templateModal.quoteId}
                onClick={async () => {
                  setSavingTemplateId(templateModal.quoteId)
                  try {
                    const detailRes = await fetch(`/api/quotes/${templateModal.quoteId}/detail`)
                    if (!detailRes.ok) { alert('견적 데이터를 불러올 수 없습니다.'); return }
                    const detail = await detailRes.json()
                    const saveRes = await fetch('/api/templates', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: templateName.trim(), itinerary: detail.draft.itinerary, pricing: detail.draft.pricing }),
                    })
                    if (saveRes.ok) setTemplateModal(null)
                    else alert('템플릿 저장에 실패했습니다.')
                  } finally { setSavingTemplateId(null) }
                }}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {savingTemplateId === templateModal.quoteId ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
      {attachmentPreview && (
        <AttachmentPreviewModal
          url={attachmentPreview.url}
          name={attachmentPreview.name}
          onClose={() => setAttachmentPreview(null)}
        />
      )}
    <div className="p-8 max-w-3xl mx-auto">
      <BackButton href="/landco" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{request.event_name}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCancelModal(true)}
            disabled={!canCancel}
            className={`border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              canCancel
                ? 'border-red-300 text-red-500 bg-white hover:bg-red-50'
                : 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
            }`}
          >
            견적 취소
          </button>
        </div>
      </div>

      {/* 취소 확인 모달 */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">행사 취소</h3>
            <p className="text-sm text-gray-500 mt-2">결제 미이행으로 이 행사를 취소하시겠습니까?</p>
            <p className="text-xs text-red-500 mt-1">취소 후 복구할 수 없습니다. 이미 결제된 금액은 별도 환불 처리가 필요합니다.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCancelModal(false)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleLandcoCancel}
                disabled={cancelling}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {cancelling ? '처리 중...' : '행사 취소'}
              </button>
            </div>
          </div>
        </div>
      )}

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
      <div className="rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
          <h3 className="text-sm font-bold text-white">견적 정보</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">{formatDate(request.deadline)}</span>
            {deadlineDays >= 0
              ? <span className="text-[10px] font-medium bg-red-500/30 text-red-300 px-2 py-0.5 rounded-full">D-{deadlineDays}</span>
              : <span className="text-[10px] font-medium bg-white/20 text-gray-300 px-2 py-0.5 rounded-full">마감됨</span>
            }
          </div>
        </div>

        {/* 목적지 */}
        <div className="bg-white px-6 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{getCountryName(request.destination_country)}</span>
          <span className="text-gray-300">·</span>
          <span className="text-sm font-semibold text-gray-700">{request.destination_city}</span>
          {request.quote_type === 'land' ? (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">랜드</span>
          ) : (
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">호텔+랜드</span>
          )}
        </div>

        {/* 여행 기간 */}
        <div className="bg-white px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">출발</p>
              <p className="text-sm font-semibold text-gray-900">{formatDateWithDay(request.depart_date)}</p>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <span className="text-xs font-semibold text-[#009CF0] bg-blue-50 px-2.5 py-1 rounded-full">{nights}박 {nights + 1}일</span>
              <span className="text-gray-300 text-xs mt-1">──→</span>
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-xs text-gray-400 mb-0.5">귀국</p>
              <p className="text-sm font-semibold text-gray-900">{formatDateWithDay(request.return_date)}</p>
            </div>
          </div>
        </div>

        {/* 항공 스케줄 */}
        {request.flight_schedule && (request.flight_schedule.outbound || request.flight_schedule.inbound) && (
          <div className="bg-white px-6 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-400 mb-2">항공 스케줄</p>
            <div className="space-y-2">
              {(['outbound', 'inbound'] as const).map(dir => {
                const f = request.flight_schedule![dir]
                if (!f) return null
                return (
                  <div key={dir} className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="text-xs font-semibold text-gray-400 w-10 shrink-0">{dir === 'outbound' ? '출발편' : '귀국편'}</span>
                    {f.code && <span className="font-semibold text-[#009CF0]">{f.code}</span>}
                    <span className="text-gray-500">
                      {f.dep_date && <span>{f.dep_date}</span>}
                      {f.dep_time && <span> {f.dep_time}</span>}
                      {(f.dep_date || f.dep_time) && (f.arr_date || f.arr_time) && <span className="mx-1">→</span>}
                      {f.arr_date && f.arr_date !== f.dep_date && <span>{f.arr_date} </span>}
                      {f.arr_time && <span>{f.arr_time}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 인원 + 호텔 */}
        <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-start gap-8">
          <div>
            <p className="text-xs text-gray-400 mb-1">인원</p>
            <p className="text-lg font-bold text-gray-900">{total}<span className="text-sm font-normal text-gray-500 ml-0.5">명</span></p>
            <p className="text-xs text-gray-400 mt-0.5">성인 {request.adults} · 아동 {request.children} · 유아 {request.infants} · 인솔 {request.leaders}</p>
          </div>
          {request.hotel_grade && (
            <div>
              <p className="text-xs text-gray-400 mb-1">호텔</p>
              <p className="text-lg font-bold text-gray-900">{hotelGradeLabel(request.hotel_grade)}</p>
              <p className="text-xs text-amber-400 mt-0.5">{'★'.repeat(request.hotel_grade)}</p>
            </div>
          )}
        </div>

        {/* 옵션 행 */}
        <div className="bg-white px-6 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">쇼핑 옵션</span>
            {request.shopping_option === true
              ? <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">쇼핑{request.shopping_count != null ? ` ${request.shopping_count}회 이상` : ''}</span>
              : request.shopping_option === false
                ? <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-400 font-medium border border-gray-200">노쇼핑</span>
                : <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-300 font-medium border border-gray-100">미지정</span>
            }
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">팁 옵션</span>
            {request.tip_option === true
              ? <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">포함</span>
              : request.tip_option === false
                ? <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-400 font-medium border border-gray-200">미포함</span>
                : <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-300 font-medium border border-gray-100">미지정</span>
            }
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">현지 옵션</span>
            {request.local_option === true
              ? <span className="text-xs px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-medium border border-purple-100">가능</span>
              : request.local_option === false
                ? <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-400 font-medium border border-gray-200">불가</span>
                : <span className="text-xs px-3 py-1 rounded-full bg-gray-50 text-gray-300 font-medium border border-gray-100">미지정</span>
            }
          </div>
          {request.travel_type && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">여행 유형</span>
              <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">
                {({ corporate_incentive: '기업 인센티브', corporate_workshop: '기업 워크숍/연수', academic_government: '학술/관공서', association: '협회/단체', family: '가족/친목', mice: 'MICE', religion: '종교', other: '기타' })[request.travel_type] ?? request.travel_type}
                {request.religion_type && ` (${({ protestant: '기독교', catholic: '천주교', buddhist: '불교', other: '기타' })[request.religion_type] ?? request.religion_type})`}
              </span>
            </div>
          )}
        </div>

        {/* 요청사항 */}
        {request.notes && (
          <div className="bg-white px-6 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">요청사항</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.notes}</p>
          </div>
        )}
        {/* 첨부파일 */}
        {(request as QuoteRequest & { attachment_url?: string; attachment_name?: string }).attachment_url && (
          <div className="bg-white px-6 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">첨부파일</p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="text-sm text-gray-700 truncate flex-1">
                {(request as QuoteRequest & { attachment_name?: string }).attachment_name ?? '첨부파일'}
              </span>
              <button
                onClick={() => {
                  const url = (request as QuoteRequest & { attachment_url?: string }).attachment_url!
                  const name = (request as QuoteRequest & { attachment_name?: string }).attachment_name ?? '파일'
                  setAttachmentPreview({ url, name })
                }}
                className="text-xs text-[#009CF0] border border-[#009CF0] px-2.5 py-1 rounded-md hover:bg-blue-50 transition-colors shrink-0"
              >
                미리보기
              </button>
              <button
                onClick={async () => {
                  const url = (request as QuoteRequest & { attachment_url?: string }).attachment_url!
                  const name = (request as QuoteRequest & { attachment_name?: string }).attachment_name ?? '파일'
                  const res = await fetch(url)
                  const blob = await res.blob()
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = name
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                className="text-xs text-gray-600 border border-gray-300 px-2.5 py-1 rounded-md hover:bg-gray-100 transition-colors shrink-0"
              >
                다운로드
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 견적서 제출 */}
      <div className={`rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden ${isUploadDisabled ? 'opacity-60' : ''}`}>
        <div className="flex items-center px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
          <h2 className="text-sm font-bold text-white">견적서 제출</h2>
        </div>
        <div className="bg-white p-6">

        {!isUploadDisabled && hasDraft && (
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
          onDragOver={!isUploadDisabled ? handleDragOver : undefined}
          onDragLeave={!isUploadDisabled ? handleDragLeave : undefined}
          onDrop={!isUploadDisabled ? handleDrop : undefined}
          onClick={() => !uploading && !isUploadDisabled && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${
            isUploadDisabled
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : isDragging
                ? 'border-blue-400 bg-blue-50 cursor-pointer'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 cursor-pointer'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {isUploadDisabled ? (
            <>
              <div className="text-3xl mb-2">🔒</div>
              <p className="text-sm text-gray-400 font-medium">추가 견적 제출이 불가합니다</p>
              <p className="text-xs text-gray-300 mt-1">
                {isAbandoned ? '포기한 견적 요청입니다' : '이미 확정된 견적 요청입니다'}
              </p>
            </>
          ) : uploading ? (
            <div className="py-4">
              <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-blue-600 font-medium">AI가 엑셀을 분석 중입니다...</p>
              <p className="text-xs text-gray-400 mt-1">파일 크기에 따라 최대 2분까지 소요될 수 있습니다</p>
            </div>
          ) : excelParsed ? (
            <div className="py-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-emerald-600 font-medium">엑셀 분석이 완료되었습니다!</p>
              <p className="text-xs text-gray-400 mt-1">아래 버튼을 눌러 에디터에서 확인하세요</p>
              <button
                onClick={() => window.open(`/landco/requests/${id}/quote/new`, '_blank')}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                견적서 에디터 열기 ↗
              </button>
            </div>
          ) : isDragging ? (
            <>
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm text-blue-600 font-medium">여기에 놓으세요</p>
            </>
          ) : (
            <>
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm text-gray-600 font-medium">기존 엑셀을 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs text-gray-400 mt-1">AI가 자동으로 분석하여 견적서 에디터에 채워드립니다</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleUpload}
            className="hidden"
            disabled={isUploadDisabled}
          />
        </div>

        {!isUploadDisabled && showNewQuoteWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
              <h3 className="text-base font-bold text-gray-900 mb-1">임시저장 데이터가 있습니다</h3>
              <p className="text-sm text-gray-500 mt-2">새 견적서를 작성하면 기존 임시저장 데이터가 삭제됩니다.</p>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowNewQuoteWarning(false)}
                  className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => { setShowNewQuoteWarning(false); window.open(`/landco/requests/${id}/quote/new?reset=1`, '_blank') }}
                  className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  새로 작성하기
                </button>
                <button
                  onClick={() => { setShowNewQuoteWarning(false); window.open(`/landco/requests/${id}/quote/new`, '_blank') }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  이어서 작성하기
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end">
          <button
            onClick={() => {
              if (hasDraft) { setShowNewQuoteWarning(true) }
              else { window.open(`/landco/requests/${id}/quote/new`, '_blank') }
            }}
            disabled={isUploadDisabled}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isUploadDisabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
            }`}
          >
            ✏️ 견적서 작성 ↗
          </button>
        </div>
        {!isUploadDisabled && uploadError && <p className="text-red-500 text-sm mt-3">{uploadError}</p>}
        </div>
      </div>

      {/* 결제 현황 */}
      {(request.status === 'payment_pending' || request.status === 'finalized') && paymentSchedule && (
        <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-white">결제 현황</h3>
              <span className="text-[10px] font-medium text-gray-300 bg-white/15 px-2 py-0.5 rounded-full">
                {paymentSchedule.template_type === 'large_event' ? '대형행사 (3단계)' :
                 paymentSchedule.template_type === 'immediate' ? '한번에 결제' :
                 paymentSchedule.template_type === 'post_travel' ? '여행 후 정산' : '일반 (2단계)'}
              </span>
            </div>
          </div>
          <div className="bg-white">
            {paymentInstallments.map((inst, idx) => {
              const displayTotal = landcoQuoteTotal ?? paymentSchedule.total_amount
              const landcoAmount = Math.round(displayTotal * inst.rate)
              const landcoPaidAmount = paymentSchedule.total_amount > 0 ? Math.round(inst.paid_amount * (displayTotal / paymentSchedule.total_amount)) : 0
              const progressPct = landcoAmount > 0 ? Math.min(100, Math.round((landcoPaidAmount / landcoAmount) * 100)) : 0
              return (
                <div key={inst.id} className={`px-5 py-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                        inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                        inst.status === 'partial' ? 'bg-blue-500 text-white' :
                        inst.status === 'overdue' ? 'bg-red-500 text-white' :
                        'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}>
                        {inst.status === 'paid' ? '✓' : idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-gray-900">{inst.label}</span>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{Math.round(inst.rate * 100)}%</span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            inst.status === 'paid' ? 'text-emerald-700 bg-emerald-50' :
                            inst.status === 'partial' ? 'text-blue-700 bg-blue-50' :
                            inst.status === 'overdue' ? 'text-red-700 bg-red-50' :
                            'text-amber-700 bg-amber-50'
                          }`}>
                            {inst.status === 'paid' ? '결제완료' : inst.status === 'partial' ? '부분결제' : inst.status === 'overdue' ? '기한초과' : '결제대기'}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500">{inst.due_date}까지</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-gray-900">{landcoAmount.toLocaleString('ko-KR')}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></div>
                      {landcoPaidAmount > 0 && inst.status !== 'paid' && (
                        <div className="text-[10px] text-blue-500">{landcoPaidAmount.toLocaleString('ko-KR')}원 결제됨</div>
                      )}
                    </div>
                  </div>
                  {inst.paid_amount > 0 && (
                    <div className="mt-2 ml-10">
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${inst.status === 'paid' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {(() => {
            const displayTotal = landcoQuoteTotal ?? paymentSchedule.total_amount
            const totalPaid = paymentInstallments.reduce((sum, i) => sum + i.paid_amount, 0)
            const paidRatio = paymentSchedule.total_amount > 0 ? totalPaid / paymentSchedule.total_amount : 0
            const landcoPaid = Math.round(displayTotal * paidRatio)
            const landcoRemaining = displayTotal - landcoPaid
            const paidPct = Math.round(paidRatio * 100)
            return (
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">랜드사 견적가</span>
                  <span className="text-xs text-gray-500">{displayTotal.toLocaleString('ko-KR')}원</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">결제완료 {landcoPaid.toLocaleString('ko-KR')}원 ({paidPct}%)</span>
                  <span className={`text-sm font-bold ${landcoRemaining > 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
                    {landcoRemaining > 0 ? `잔여 ${landcoRemaining.toLocaleString('ko-KR')}원` : '전액 결제완료'}
                  </span>
                </div>
              </div>
            )
          })()}
          {request.status === 'payment_pending' && !paymentConfirmed && (
            <div className="px-5 py-4 border-t border-gray-100">
              <textarea
                value={paymentMemo}
                onChange={e => setPaymentMemo(e.target.value)}
                placeholder="메모 입력 (선택사항, 내부 기록용)"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-blue-400 mb-3"
              />
              <div className="flex justify-end">
                <button
                  onClick={handlePaymentConfirm}
                  disabled={paymentConfirming}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {paymentConfirming ? '처리 중...' : '결제확인 완료'}
                </button>
              </div>
            </div>
          )}
          {paymentConfirmed && (
            <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100">
              <p className="text-xs text-emerald-700 font-medium">결제 확인이 완료되었습니다. 최종 확정 처리되었습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 결제확인 — paymentSchedule이 없을 때 fallback */}
      {request.status === 'payment_pending' && !paymentSchedule && !paymentConfirmed && (
        <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="flex items-center px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
            <h3 className="text-sm font-bold text-white">결제 확인</h3>
          </div>
          <div className="px-5 py-4 bg-white">
            <p className="text-sm text-gray-500 mb-3">입금이 확인되면 아래 버튼을 눌러 최종 확정 처리해주세요.</p>
            <textarea
              value={paymentMemo}
              onChange={e => setPaymentMemo(e.target.value)}
              placeholder="메모 입력 (선택사항, 내부 기록용)"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-blue-400 mb-3"
            />
            <div className="flex justify-end">
              <button
                onClick={handlePaymentConfirm}
                disabled={paymentConfirming}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {paymentConfirming ? '처리 중...' : '결제확인 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
      {!paymentSchedule && paymentConfirmed && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-6">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-semibold text-emerald-700">결제 확인이 완료되었습니다.</p>
            <p className="text-xs text-emerald-600 mt-0.5">최종 확정 처리가 완료되었습니다.</p>
          </div>
        </div>
      )}

      {/* 입금 메모 */}
      {request.status === 'finalized' && selectionResult === 'selected' && savedMemo && (
        <div className="bg-white rounded-lg shadow-sm p-5 mb-6 border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">입금 메모</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{savedMemo}</p>
        </div>
      )}

      {/* 제출 이력 */}
      <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
          <h2 className="text-sm font-bold text-white">제출 이력</h2>
          <span className="text-[10px] font-medium text-gray-300 bg-white/15 px-2 py-0.5 rounded-full">{myQuotes.length}개 버전</span>
        </div>
        <div className="bg-white p-6">
        {myQuotes.length === 0 ? (
          <p className="text-gray-400 text-sm">아직 제출된 견적서가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {myQuotes.map(q => (
              <div key={q.id} className="py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                    selectedQuoteId === q.id
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    v{q.version}
                  </span>
                  <span className="text-sm text-gray-600 truncate min-w-0 flex-1">{q.file_name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(q.submitted_at).toLocaleString('ko-KR')}</span>
                    <button
                      onClick={() => window.open(`/landco/quotes/${q.id}`, '_blank')}
                      className="text-xs text-[#009CF0] border border-[#009CF0] px-2.5 py-1 rounded-md hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      미리보기
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/quotes/${q.id}/download`)
                        if (!res.ok) return
                        const blob = await res.blob()
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = q.file_name
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="text-xs text-gray-600 border border-gray-300 px-2.5 py-1 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      다운로드
                    </button>
                    <button
                      onClick={() => {
                        setTemplateModal({ quoteId: q.id, defaultName: q.file_name.replace('.xlsx', '') })
                        setTemplateName(q.file_name.replace('.xlsx', ''))
                      }}
                      className="text-xs text-purple-600 border border-purple-300 px-2.5 py-1 rounded-md hover:bg-purple-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      템플릿 저장
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex gap-4 ml-1">
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
                    {q.pricing_mode === 'summary' ? (
                      <span className="text-xs font-medium text-amber-500">항목별 내역 없음</span>
                    ) : (
                      <span className="text-xs font-medium text-emerald-500">항목별 내역 포함</span>
                    )}
                  </div>
                  {selectedQuoteId === q.id && (
                    <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
                      최종 확정됨
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
    </>
  )
}
