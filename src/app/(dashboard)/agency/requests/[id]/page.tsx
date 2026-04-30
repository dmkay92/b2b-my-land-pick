'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatDate, formatDateWithDay, calculateTotalPeople, hotelGradeLabel, getCountryName } from '@/lib/utils'
import type { QuoteRequest, Quote, AdditionalSettlement } from '@/lib/supabase/types'
import { useChat } from '@/lib/chat/ChatContext'
import { AttachmentPreviewModal } from '@/components/AttachmentPreviewModal'
import { BackButton } from '@/components/BackButton'
import AdditionalSettlementSection from '@/components/AdditionalSettlementSection'
import MarkupInput from '@/components/MarkupInput'
import ConfirmMarkupModal from '@/components/ConfirmMarkupModal'
import PaymentScheduleCard from '@/components/PaymentScheduleCard'
import type { AgencyCommission, PaymentSchedule, PaymentInstallment } from '@/lib/supabase/types'

interface QuoteWithLandco extends Quote {
  profiles: { company_name: string }
  pricing?: { total: number | null; per_person: number | null }
}

type QuoteWithPricing = Quote & { pricing?: { total: number | null; per_person: number | null }; pricing_mode?: 'detailed' | 'summary' }

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

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  corporate_incentive: '기업 인센티브',
  corporate_workshop: '기업 워크숍/연수',
  academic_government: '학술/관공서',
  association: '협회/단체',
  family: '가족/친목',
  mice: 'MICE',
  religion: '종교',
  other: '기타',
}
const RELIGION_TYPE_LABELS: Record<string, string> = {
  protestant: '기독교',
  catholic: '천주교',
  buddhist: '불교',
  other: '기타',
}

export default function AgencyRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [grouped, setGrouped] = useState<GroupedQuotes>({})
  const [selection, setSelection] = useState<Selection | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ landcoId: string; quoteId: string; total: number; companyName: string } | null>(null)
  const { openOrCreateRoom } = useChat()
  const [markups, setMarkups] = useState<Record<string, AgencyCommission>>({})
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string } | null>(null)
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentSchedule | null>(null)
  const [paymentInstallments, setPaymentInstallments] = useState<PaymentInstallment[]>([])
  const [additionalSettlements, setAdditionalSettlements] = useState<AdditionalSettlement[]>([])

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
      const markupsRes = await fetch(`/api/agency-commissions?requestId=${id}`)
      if (markupsRes.ok) {
        const { markups: markupsList } = await markupsRes.json()
        const markupMap: Record<string, AgencyCommission> = {}
        for (const m of markupsList) { markupMap[m.quote_id] = m }
        setMarkups(markupMap)

        // 글로벌 마크업 초기화: 선택된 견적의 마크업 우선, 없으면 첫 번째
        const selectedMarkup = selectedQuoteId
          ? markupsList.find((m: AgencyCommission) => m.quote_id === selectedQuoteId)
          : null
        const initMarkup = selectedMarkup ?? markupsList[0]
        if (initMarkup) {
          setGlobalMarkup({ perPerson: initMarkup.commission_per_person, total: initMarkup.commission_total })
        }
      }

      // Fetch payment schedule
      const scheduleRes = await fetch(`/api/payment-schedule?requestId=${id}`)
      if (scheduleRes.ok) {
        const { schedule, installments } = await scheduleRes.json()
        setPaymentSchedule(schedule)
        setPaymentInstallments(installments ?? [])
      }

      if (json.request?.status === 'finalized') {
        const addRes = await fetch(`/api/additional-settlements?requestId=${id}`)
        if (addRes.ok) {
          const { settlements } = await addRes.json()
          setAdditionalSettlements(settlements ?? [])
        }
      }
    }
    load()
  }, [id])

  // 승인 대기 중일 때 30초 간격 폴링
  useEffect(() => {
    if (paymentSchedule?.approval_status !== 'pending') return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/payment-schedule?requestId=${id}`)
      if (res.ok) {
        const { schedule, installments } = await res.json()
        setPaymentSchedule(schedule)
        setPaymentInstallments(installments ?? [])
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [id, paymentSchedule?.approval_status])

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

    const newMarkups: Record<string, AgencyCommission> = {}
    for (const qid of allQuoteIds) {
      newMarkups[qid] = { ...markups[qid], quote_id: qid, commission_per_person: perPerson, commission_total: total } as AgencyCommission
      fetch('/api/agency-commissions', {
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
          initialPerPerson={markups[confirmTarget.quoteId]?.commission_per_person ?? 0}
          initialTotal={markups[confirmTarget.quoteId]?.commission_total ?? 0}
          landcoName={confirmTarget.companyName}
          onConfirm={async (markupPerPerson, markupTotal) => {
            const commRes = await fetch('/api/agency-commissions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                quoteId: confirmTarget.quoteId,
                markupPerPerson,
                markupTotal,
              }),
            })
            if (!commRes.ok) {
              alert('커미션 저장에 실패했습니다.')
              return
            }
            setGlobalMarkup({ perPerson: markupPerPerson, total: markupTotal })
            setMarkups(prev => ({
              ...prev,
              [confirmTarget.quoteId]: {
                ...prev[confirmTarget.quoteId],
                commission_per_person: markupPerPerson,
                commission_total: markupTotal,
              },
            }))
            await handleConfirm(confirmTarget.landcoId, confirmTarget.quoteId)
            setConfirmTarget(null)
            window.location.reload()
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
      {request.display_id && (
        <p className="text-xs text-gray-400 mb-1 font-mono">{request.display_id}</p>
      )}
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
      <div className="rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
        {/* 헤더: 목적지 + 마감 */}
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
                {TRAVEL_TYPE_LABELS[request.travel_type] ?? request.travel_type}
                {request.religion_type && ` (${RELIGION_TYPE_LABELS[request.religion_type] ?? request.religion_type})`}
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

      {(request.status === 'payment_pending' || request.status === 'finalized' || request.status === 'closed') && paymentSchedule && (
        <div className="mb-6">
          <PaymentScheduleCard
            schedule={paymentSchedule}
            installments={paymentInstallments}
            departDate={request.depart_date}
            returnDate={request.return_date}
            onSwitchToImmediate={async () => {
              await fetch('/api/payment-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: id, templateType: 'one_time' }),
              })
              const res = await fetch(`/api/payment-schedule?requestId=${id}`)
              if (res.ok) {
                const { schedule, installments } = await res.json()
                setPaymentSchedule(schedule)
                setPaymentInstallments(installments ?? [])
              }
            }}
            onSwitchToDefault={async () => {
              await fetch('/api/payment-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: id, templateType: 'default' }),
              })
              const res = await fetch(`/api/payment-schedule?requestId=${id}`)
              if (res.ok) {
                const { schedule, installments } = await res.json()
                setPaymentSchedule(schedule)
                setPaymentInstallments(installments ?? [])
              }
            }}
            onSwitchToPostTravel={async () => {
              await fetch('/api/payment-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: id, templateType: 'post_travel' }),
              })
              const res = await fetch(`/api/payment-schedule?requestId=${id}`)
              if (res.ok) {
                const { schedule, installments } = await res.json()
                setPaymentSchedule(schedule)
                setPaymentInstallments(installments ?? [])
              }
            }}
            isCancelled={request.status === 'closed'}
          />
        </div>
      )}

      {request.status === 'finalized' && (
        <AdditionalSettlementSection
          requestId={id}
          settlements={additionalSettlements}
          onCreated={async () => {
            const res = await fetch(`/api/additional-settlements?requestId=${id}`)
            if (res.ok) {
              const { settlements } = await res.json()
              setAdditionalSettlements(settlements ?? [])
            }
            const schedRes = await fetch(`/api/payment-schedule?requestId=${id}`)
            if (schedRes.ok) {
              const { schedule, installments } = await schedRes.json()
              setPaymentSchedule(schedule)
              setPaymentInstallments(installments ?? [])
            }
          }}
          role="agency"
        />
      )}

      <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-white">랜드사 견적서</h2>
            {landcoCount > 0 && (
              <span className="text-[10px] font-medium text-gray-300 bg-white/15 px-2 py-0.5 rounded-full">{landcoCount}개 랜드사</span>
            )}
          </div>
          {landcoCount > 0 && (
            <div className="-mr-3">
              <MarkupInput
                totalPeople={total}
                initialPerPerson={globalMarkup.perPerson}
                initialTotal={globalMarkup.total}
                onChange={(pp, t) => handleGlobalMarkupChange(pp, t)}
                disabled={request.status === 'finalized' || request.status === 'payment_pending'}
              />
            </div>
          )}
        </div>

      {landcoCount === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white">
          아직 제출된 견적서가 없습니다.
        </div>
      ) : (
        <div className="bg-white divide-y divide-gray-100">
          {Object.entries(grouped).map(([landcoId, { company_name, quotes }]) => {
            const sortedQuotes = [...quotes].sort((a, b) => b.version - a.version)
            const latestQuote = sortedQuotes[0]
            return (
              <div key={landcoId} className="p-5">
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
                            className="text-xs text-[#009CF0] border border-[#009CF0] px-2.5 py-1 rounded-md hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
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
                            className="text-xs text-gray-600 border border-gray-300 px-2.5 py-1 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap shrink-0"
                          >
                            다운로드
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
                        <div>
                          {selection?.selected_quote_id === q.id && request.status === 'finalized' ? (
                            <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
                              최종 확정됨
                            </span>
                          ) : selection?.selected_quote_id === q.id && request.status === 'payment_pending' ? (
                            <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-medium">
                              결제 대기 중
                            </span>
                          ) : request.status !== 'finalized' && request.status !== 'payment_pending' && request.status !== 'closed' && (
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
    </div>
    </>
  )
}
