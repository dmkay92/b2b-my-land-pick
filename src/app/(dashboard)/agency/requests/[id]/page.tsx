'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatDate, calculateTotalPeople, hotelGradeLabel, getCountryName } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'
import { useChat } from '@/lib/chat/ChatContext'
import { ExcelPreviewModal } from '@/components/ExcelPreviewModal'

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
  const { openOrCreateRoom } = useChat()
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [canceling, setCanceling] = useState(false)

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
      const selRes = await fetch(`/api/quotes/selection?requestId=${id}`)
      if (selRes.ok) {
        const selJson = await selRes.json()
        setSelection(selJson.selection ?? null)
      }
    }
    load()
  }, [id])

  async function handleConfirm(landcoId: string, quoteId: string) {
    if (!confirm('이 견적서로 최종 확정하시겠습니까? 확정 후에는 변경이 어렵습니다.')) return
    const res = await fetch('/api/quotes/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, landcoId, quoteId }),
    })
    if (res.ok) {
      setSelection({ landco_id: landcoId, selected_quote_id: quoteId, finalized_at: new Date().toISOString() })
    }
  }

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const total = calculateTotalPeople(request)
  const landcoCount = Object.keys(grouped).length

  return (
    <>
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
      {preview && (
        <ExcelPreviewModal
          fileUrl={preview.url}
          fileName={preview.name}
          onClose={() => setPreview(null)}
        />
      )}
      <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{request.event_name}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCopyModal(true)}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-gray-50"
          >
            견적 복사
          </button>
          {request.status !== 'finalized' && request.status !== 'closed' && (
            <>
              <button
                onClick={() => router.push(`/agency/requests/${id}/edit`)}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-gray-50"
              >
                ✏️ 수정
              </button>
              <button
                onClick={() => setShowCancelModal(true)}
                className="border border-red-300 text-red-500 px-4 py-2 rounded-lg text-sm font-medium bg-white hover:bg-red-50"
              >
                견적 취소
              </button>
            </>
          )}
        </div>
      </div>

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

      <h2 className="text-lg font-semibold mb-4">
        랜드사 견적서
        <span className="text-gray-400 font-normal text-sm ml-2">{landcoCount}개 랜드사 제출</span>
      </h2>

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
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-medium shrink-0">
                          v{q.version}
                        </span>
                        <span className="text-sm text-gray-600 truncate min-w-0 flex-1">{q.file_name}</span>
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {new Date(q.submitted_at).toLocaleString('ko-KR')}
                          </span>
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
                          {selection?.selected_quote_id === q.id && selection.finalized_at ? (
                            <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
                              최종 확정됨
                            </span>
                          ) : !selection?.finalized_at && (
                            <button
                              onClick={() => handleConfirm(landcoId, q.id)}
                              className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-blue-700"
                            >
                              최종 확정
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
