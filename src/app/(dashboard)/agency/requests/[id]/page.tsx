'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatDate, formatDateWithDay, calculateTotalPeople, hotelGradeLabel, getCountryName } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'
import { useChat } from '@/lib/chat/ChatContext'
import { AttachmentPreviewModal } from '@/components/AttachmentPreviewModal'
import { BackButton } from '@/components/BackButton'
import MarkupInput from '@/components/MarkupInput'
import ConfirmMarkupModal from '@/components/ConfirmMarkupModal'
import type { AgencyMarkup } from '@/lib/supabase/types'

interface QuoteWithLandco extends Quote {
  profiles: { company_name: string }
  pricing?: { total: number | null; per_person: number | null }
}

type QuoteWithPricing = Quote & { pricing?: { total: number | null; per_person: number | null } }

interface GroupedQuotes {
  [landcoId: string]: {
    company_name: string
    quotes: QuoteWithPricing[]
  }
}

interface Selection {
  landco_id: string
  selected_quote_id: string
  finalized_at: string | null
}

export default function AgencyRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [grouped, setGrouped] = useState<GroupedQuotes>({})
  const [selection, setSelection] = useState<Selection | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ landcoId: string; quoteId: string; total: number; companyName: string } | null>(null)
  const { openOrCreateRoom } = useChat()
  const [markups, setMarkups] = useState<Record<string, AgencyMarkup>>({})
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string } | null>(null)

  async function handleCancel() {
    setCanceling(true)
    await fetch(`/api/requests/${id}/cancel`, { method: 'POST' })
    setCanceling(false)
    setShowCancelModal(false)
    router.push('/agency')
  }

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/requests/${id}`)
      const json = await res.json()
      setRequest(json.request)

      const quotes: QuoteWithLandco[] = json.quotes ?? []
      const groups: GroupedQuotes = {}
      quotes.forEach(q => {
        if (!groups[q.landco_id]) {
          groups[q.landco_id] = {
            company_name: q.profiles?.company_name ?? '알 수 없음',
            quotes: [],
          }
        }
        groups[q.landco_id].quotes.push(q)
      })
      setGrouped(groups)

      // 현재 선택 상태 조회
      let selectedQuoteId: string | null = null
      const selRes = await fetch(`/api/quotes/selection?requestId=${id}`)
      if (selRes.ok) {
        const selJson = await selRes.json()
        setSelection(selJson.selection ?? null)
        selectedQuoteId = selJson.selection?.selected_quote_id ?? null
      }

      // Fetch agency markups
      const markupsRes = await fetch(`/api/agency-markups?requestId=${id}`)
      if (markupsRes.ok) {
        const { markups: markupsList } = await markupsRes.json()
        const markupMap: Record<string, AgencyMarkup> = {}
        for (const m of markupsList) { markupMap[m.quote_id] = m }
        setMarkups(markupMap)

        // 글로벌 마크업 초기화: 선택된 견적의 마크업 우선, 없으면 첫 번째
        const selectedMarkup = selectedQuoteId
          ? markupsList.find((m: AgencyMarkup) => m.quote_id === selectedQuoteId)
          : null
        const initMarkup = selectedMarkup ?? markupsList[0]
        if (initMarkup) {
          setGlobalMarkup({ perPerson: initMarkup.markup_per_person, total: initMarkup.markup_total })
        }
      }
    }
    load()
  }, [id])

  async function handleConfirm(landcoId: string, quoteId: string) {
    const res = await fetch('/api/quotes/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, landcoId, quoteId }),
    })
    if (res.ok) {
      setSelection({ landco_id: landcoId, selected_quote_id: quoteId, finalized_at: null })
      setRequest(prev => prev ? { ...prev, status: 'payment_pending' } : prev)
    }
  }

  const [globalMarkup, setGlobalMarkup] = useState<{ perPerson: number; total: number }>({ perPerson: 0, total: 0 })

  async function handleGlobalMarkupChange(perPerson: number, total: number) {
    setGlobalMarkup({ perPerson, total })
    // 모든 견적의 최신 버전에 동일 마크업 저장
    const allQuoteIds = Object.values(grouped).map(g => {
      const sorted = [...g.quotes].sort((a, b) => b.version - a.version)
      return sorted[0]?.id
    }).filter(Boolean) as string[]

    const newMarkups: Record<string, AgencyMarkup> = {}
    for (const qid of allQuoteIds) {
      newMarkups[qid] = { ...markups[qid], quote_id: qid, markup_per_person: perPerson, markup_total: total } as AgencyMarkup
      fetch('/api/agency-markups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: qid, markupPerPerson: perPerson, markupTotal: total }),
      })
    }
    setMarkups(prev => ({ ...prev, ...newMarkups }))
  }

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const total = calculateTotalPeople(request)
  const landcoCount = Object.keys(grouped).length

  const nights = Math.round((new Date(request.return_date).getTime() - new Date(request.depart_date).getTime()) / 86400000)
  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const deadlineDays = Math.ceil((new Date(request.deadline).getTime() - new Date(todayKST).getTime()) / 86400000)

  return (
    <>
      {confirmTarget && (
        <ConfirmMarkupModal
          landcoTotal={confirmTarget.total}
          totalPeople={total}
          initialPerPerson={markups[confirmTarget.quoteId]?.markup_per_person ?? 0}
          initialTotal={markups[confirmTarget.quoteId]?.markup_total ?? 0}
          landcoName={confirmTarget.companyName}
          onConfirm={async (markupPerPerson, markupTotal) => {
            await fetch('/api/agency-markups', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                quoteId: confirmTarget.quoteId,
                markupPerPerson,
                markupTotal,
              }),
            })
            await handleConfirm(confirmTarget.landcoId, confirmTarget.quoteId)
            setConfirmTarget(null)
          }}
          onClose={() => setConfirmTarget(null)}
        />
      )}
      {showCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="text-base font-bold text-gray-900 mb-2">견적을 복사하시겠습니까?</h3>
            <p className="text-sm text-gray-500 mb-6">해당 견적의 내용을 복사해 새 견적 요청 작성 페이지로 이동합니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCopyModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => { setShowCopyModal(false); router.push(`/agency/requests/new?copy=${id}`) }}
                className="flex-1 bg-[#009CF0] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#0088D9]"
              >
                복사하기
              </button>
            </div>
          </div>
        </div>
      )}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="text-base font-bold text-gray-900 mb-2">견적 요청을 취소하시겠습니까?</h3>
            <p className="text-sm text-gray-500 mb-6">취소된 견적은 되돌릴 수 없습니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                돌아가기
              </button>
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {canceling ? '처리 중...' : '취소 확인'}
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
      <div className="p-8 max-w-4xl mx-auto">
      <BackButton href="/agency" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{request.event_name}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCopyModal(true)}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-gray-50"
          >
            견적 복사
          </button>
          {request.status !== 'finalized' && request.status !== 'closed' && request.status !== 'payment_pending' && (
            <button
              onClick={() => router.push(`/agency/requests/${id}/edit`)}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-gray-50"
            >
              ✏️ 수정
            </button>
          )}
          {request.status !== 'finalized' && request.status !== 'closed' && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="border border-red-300 text-red-500 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-red-50"
            >
              견적 취소
            </button>
          )}
        </div>
      </div>

      {/* 견적 조건 카드 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
        {/* 헤더: 목적지 + 마감 */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-900">{getCountryName(request.destination_country)}</span>
            <span className="text-gray-300">·</span>
            <span className="text-base font-semibold text-gray-700">{request.destination_city}</span>
            {request.quote_type === 'land' ? (
              <span className="ml-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">랜드</span>
            ) : (
              <span className="ml-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">호텔+랜드</span>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">견적 마감</p>
            <p className="text-sm font-semibold text-red-500">
              {formatDate(request.deadline)}
              {deadlineDays >= 0
                ? <span className="ml-1.5 text-xs font-medium bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">D-{deadlineDays}</span>
                : <span className="ml-1.5 text-xs font-medium bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">마감됨</span>
              }
            </p>
          </div>
        </div>

        {/* 여행 기간 */}
        <div className="px-6 py-4 border-b border-gray-100">
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
          <div className="px-6 py-4 border-b border-gray-100">
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
        <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-8">
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
        <div className="px-6 py-3 space-y-2">
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
        </div>

        {/* 요청사항 */}
        {request.notes && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">요청사항</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.notes}</p>
          </div>
        )}
        {/* 첨부파일 */}
        {(request as QuoteRequest & { attachment_url?: string; attachment_name?: string }).attachment_url && (
          <div className="px-6 py-4 border-t border-gray-100">
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

      {request.status === 'payment_pending' && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
          <span className="text-2xl">⏳</span>
          <div>
            <p className="text-sm font-semibold text-amber-700">입금 대기 중입니다</p>
            <p className="text-xs text-amber-600 mt-0.5">랜드사의 입금 확인을 기다리고 있습니다.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          랜드사 견적서
          <span className="text-gray-400 font-normal text-sm ml-2">{landcoCount}개 랜드사 제출</span>
        </h2>
        {landcoCount > 0 && (
          <MarkupInput
            totalPeople={total}
            initialPerPerson={globalMarkup.perPerson}
            initialTotal={globalMarkup.total}
            onChange={(pp, t) => handleGlobalMarkupChange(pp, t)}
            disabled={request.status === 'finalized' || request.status === 'payment_pending'}
          />
        )}
      </div>

      {landcoCount === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-lg shadow-sm">
          아직 제출된 견적서가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([landcoId, { company_name, quotes }]) => {
            const sortedQuotes = [...quotes].sort((a, b) => b.version - a.version)
            const latestQuote = sortedQuotes[0]
            return (
              <div key={landcoId} className="bg-white rounded-lg shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{company_name}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openOrCreateRoom(id, landcoId)}
                      className="text-xs text-blue-600 border border-blue-300 px-2.5 py-1 rounded-full hover:bg-blue-50"
                    >
                      💬 랜드사와 채팅하기
                    </button>
                    <span className="text-xs text-gray-400">{quotes.length}개 버전</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {(sortedQuotes as QuoteWithPricing[]).map(q => (
                    <div key={q.id} className="py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                          selection?.selected_quote_id === q.id && selection.finalized_at
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          v{q.version}
                        </span>
                        <span className="text-sm text-gray-600 truncate min-w-0 flex-1">{q.file_name}</span>
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {new Date(q.submitted_at).toLocaleString('ko-KR')}
                          </span>
                          <button
                            onClick={() => {
                              const params = globalMarkup.total > 0 ? `?markup=${globalMarkup.total}` : ''
                              window.open(`/agency/quotes/${q.id}${params}`, '_blank')
                            }}
                            className="border border-gray-300 text-gray-600 rounded-lg px-3 py-1 text-xs font-medium bg-white hover:bg-gray-50 whitespace-nowrap"
                          >
                            미리보기
                          </button>
                          <button
                            onClick={async () => {
                              const params = globalMarkup.total > 0 ? `?markup=${globalMarkup.total}` : ''
                              const res = await fetch(`/api/quotes/${q.id}/download${params}`)
                              if (!res.ok) return
                              const blob = await res.blob()
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = q.file_name
                              a.click()
                              URL.revokeObjectURL(url)
                            }}
                            className="bg-[#009CF0] text-white rounded-lg px-3 py-1 text-xs font-medium hover:bg-[#0088D9] whitespace-nowrap"
                          >
                            ↓ 다운로드
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
                        </div>
                        <div>
                          {selection?.selected_quote_id === q.id && request.status === 'finalized' ? (
                            <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
                              최종 확정됨
                            </span>
                          ) : selection?.selected_quote_id === q.id && request.status === 'payment_pending' ? (
                            <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-medium">
                              입금 대기 중
                            </span>
                          ) : request.status !== 'finalized' && request.status !== 'payment_pending' && (
                            <button
                              onClick={() => setConfirmTarget({
                                landcoId,
                                quoteId: q.id,
                                total: q.pricing?.total ?? 0,
                                companyName: company_name,
                              })}
                              className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-blue-700"
                            >
                              이 견적서로 확정
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
    </>
  )
}
