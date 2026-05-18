'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatDateWithDay, calculateTotalPeople, hotelGradeLabel, getCountryName } from '@/lib/utils'
import type { QuoteRequest, Quote, PaymentSchedule, PaymentInstallment } from '@/lib/supabase/types'
import { BackButton } from '@/components/BackButton'
import MarkupInput from '@/components/MarkupInput'
import DeductionClaimSection from '@/components/DeductionClaimSection'
import { useChat } from '@/lib/chat/ChatContext'
import type { DeductionClaim } from '@/lib/supabase/types'

type QuoteWithLandco = Quote & { profiles: { company_name: string }; pricing_mode?: 'detailed' | 'summary' }

function fmt(n: number) { return n.toLocaleString('ko-KR') }

function statusLabel(s: string) {
  switch (s) {
    case 'open': return '모집중'
    case 'in_progress': return '견적접수'
    case 'payment_pending': return '결제대기'
    case 'finalized': return '확정'
    case 'closed': return '취소'
    default: return s
  }
}

function statusColor(s: string) {
  switch (s) {
    case 'open': return 'bg-green-100 text-green-700'
    case 'in_progress': return 'bg-blue-100 text-blue-700'
    case 'payment_pending': return 'bg-amber-100 text-amber-700'
    case 'finalized': return 'bg-gray-100 text-gray-500'
    case 'closed': return 'bg-red-100 text-red-600'
    default: return 'bg-gray-100 text-gray-500'
  }
}

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  incentive: '인센티브', workshop: '워크숍', conference: '컨퍼런스',
  exhibition: '전시/박람회', religion: '종교', sports: '스포츠',
  education: '교육/연수', corporate_workshop: '기업 워크숍/연수',
}
const RELIGION_TYPE_LABELS: Record<string, string> = {
  christian: '기독교', catholic: '천주교', buddhist: '불교', other: '기타',
}

export default function AdminRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { openRoom, loadRooms, rooms } = useChat()
  const [chatRooms, setChatRooms] = useState<{ id: string; landco_id: string; landco_name: string; agency_name: string }[]>([])
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [quotes, setQuotes] = useState<QuoteWithLandco[]>([])
  const [selection, setSelection] = useState<{ selected_quote_id: string; landco_id: string; finalized_at: string | null } | null>(null)
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null)
  const [installments, setInstallments] = useState<PaymentInstallment[]>([])
  const [agencyName, setAgencyName] = useState('')
  const [markupPerPerson, setMarkupPerPerson] = useState(0)
  const [markupTotal, setMarkupTotal] = useState(0)
  const [deductionClaims, setDeductionClaims] = useState<DeductionClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'paid' | 'pending'; label: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/'); return }

      const res = await fetch(`/api/requests/${id}`)
      if (!res.ok) { setLoading(false); return }
      const json = await res.json()
      setRequest(json.request)
      setQuotes(json.quotes ?? [])

      if (json.request?.agency_id) {
        const { data: agency } = await supabase.from('profiles').select('company_name').eq('id', json.request.agency_id).single()
        setAgencyName(agency?.company_name ?? '-')
      }

      const selRes = await fetch(`/api/quotes/selection?requestId=${id}`)
      if (selRes.ok) {
        const selJson = await selRes.json()
        setSelection(selJson.selection ?? null)
      }

      const schedRes = await fetch(`/api/payment-schedule?requestId=${id}`)
      if (schedRes.ok) {
        const schedJson = await schedRes.json()
        setSchedule(schedJson.schedule)
        setInstallments(schedJson.installments ?? [])
      }

      // 공제 신청
      if (json.request?.status === 'closed') {
        const dcRes = await fetch(`/api/deduction-claims?requestId=${id}`)
        if (dcRes.ok) {
          const { claims } = await dcRes.json()
          setDeductionClaims(claims ?? [])
        }
      }

      // 채팅방 조회
      const chatRes = await fetch(`/api/chat/rooms?requestId=${id}`)
      if (chatRes.ok) {
        const { rooms: chatData } = await chatRes.json()
        setChatRooms((chatData ?? []).map((r: { id: string; landco_id: string; landco?: { company_name: string }; agency?: { company_name: string } }) => ({
          id: r.id,
          landco_id: r.landco_id,
          landco_name: r.landco?.company_name ?? '-',
          agency_name: r.agency?.company_name ?? '-',
        })))
      }

      // 여행사 커미션
      const markupRes = await fetch(`/api/agency-commissions?requestId=${id}`)
      if (markupRes.ok) {
        const { markups } = await markupRes.json()
        if (markups && markups.length > 0) {
          const m = markups[0]
          setMarkupPerPerson(m.commission_per_person ?? 0)
          setMarkupTotal(m.commission_total ?? 0)
        }
      }

      setLoading(false)
    }
    load()
  }, [id])

  async function handlePaymentAction(installmentId: string, action: 'paid' | 'pending') {
    setProcessingId(installmentId)
    const res = await fetch('/api/admin/payments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId, action }),
    })
    if (res.ok) {
      // 결제 데이터 리로드
      const schedRes = await fetch(`/api/payment-schedule?requestId=${id}`)
      if (schedRes.ok) {
        const schedJson = await schedRes.json()
        setSchedule(schedJson.schedule)
        setInstallments(schedJson.installments ?? [])
      }
    }
    setProcessingId(null)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
  if (!request) return <div className="text-center py-20 text-gray-400">견적 요청을 찾을 수 없습니다.</div>

  const total = calculateTotalPeople({ adults: request.adults, children: request.children, infants: request.infants, leaders: request.leaders })
  const nights = Math.max(0, Math.ceil((new Date(request.return_date).getTime() - new Date(request.depart_date).getTime()) / 86400000))
  const deadlineDays = Math.ceil((new Date(request.deadline).getTime() - new Date().getTime()) / 86400000)

  // 랜드사별 그룹핑
  const grouped: Record<string, { company_name: string; quotes: QuoteWithLandco[] }> = {}
  quotes.forEach(q => {
    if (!grouped[q.landco_id]) grouped[q.landco_id] = { company_name: q.profiles?.company_name ?? '알 수 없음', quotes: [] }
    grouped[q.landco_id].quotes.push(q)
  })
  const landcoCount = Object.keys(grouped).length

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <BackButton href="/admin/quotes" />
      {request.display_id && (
        <p className="text-xs text-gray-400 mb-1 font-mono">{request.display_id}</p>
      )}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{request.event_name}</h1>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColor(request.status)}`}>
          {statusLabel(request.status)}
        </span>
      </div>

      {/* 견적 정보 — agency와 동일 */}
      <div className="rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
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

        {/* 여행사 */}
        <div className="bg-white px-6 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-xs text-gray-400">여행사</span>
          <span className="text-sm font-medium text-gray-800">{agencyName}</span>
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

        {/* 옵션 */}
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
      </div>

      {/* 랜드사 견적서 — agency와 동일 */}
      <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-white">랜드사 견적서</h2>
            {landcoCount > 0 && (
              <span className="text-[10px] font-medium text-gray-300 bg-white/15 px-2 py-0.5 rounded-full">{landcoCount}개 랜드사</span>
            )}
          </div>
          <div className="-mr-3">
            <MarkupInput
              totalPeople={total}
              initialPerPerson={markupPerPerson}
              initialTotal={markupTotal}
              onChange={() => {}}
              disabled
            />
          </div>
        </div>
        <div className="bg-white divide-y divide-gray-100">
          {landcoCount === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">아직 제출된 견적이 없습니다.</p>
          ) : Object.entries(grouped).map(([landcoId, { company_name, quotes: lQuotes }]) => {
            const sorted = [...lQuotes].sort((a, b) => b.version - a.version)
            const isSelected = selection?.landco_id === landcoId
            const latest = sorted[0]
            const pricingTotal = latest?.summary_total ?? 0
            const pricingPerPerson = latest?.summary_per_person ?? 0
            return (
              <div key={landcoId} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{company_name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const room = chatRooms.find(r => r.landco_id === landcoId)
                      if (room) {
                        return (
                          <button
                            onClick={() => { loadRooms(); openRoom(room.id) }}
                            className="text-xs text-blue-600 border border-blue-300 px-2.5 py-1 rounded-full hover:bg-blue-50"
                          >
                            💬 채팅 보기
                          </button>
                        )
                      }
                      return null
                    })()}
                    <span className="text-xs text-gray-400">{lQuotes.length}개 버전</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {sorted.map(q => {
                    const isFinalized = selection?.selected_quote_id === q.id && selection.finalized_at
                    const isSelectedQuote = selection?.selected_quote_id === q.id
                    const qPricing = q as QuoteWithLandco & { pricing?: { total: number | null; per_person: number | null } }
                    return (
                      <div key={q.id} className="py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                            isFinalized ? 'bg-purple-100 text-purple-700' :
                            isSelectedQuote ? 'bg-blue-100 text-blue-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>v{q.version}</span>
                          <span className="text-sm text-gray-600 truncate min-w-0 flex-1">{q.file_name}</span>
                          <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(q.submitted_at)}</span>
                            <a
                              href={`/api/quotes/${q.id}/preview`}
                              target="_blank"
                              className="text-xs text-[#009CF0] border border-[#009CF0] px-2.5 py-1 rounded-md hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
                            >
                              미리보기
                            </a>
                            <a
                              href={`/api/quotes/${q.id}/download`}
                              className="text-xs text-gray-600 border border-gray-300 px-2.5 py-1 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap shrink-0"
                            >
                              다운로드
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex gap-4 ml-1">
                            {qPricing.pricing?.total != null && (
                              <span className="text-xs text-gray-500">
                                총 합계 <span className="font-semibold text-gray-800">{fmt(qPricing.pricing.total)}원</span>
                              </span>
                            )}
                            {qPricing.pricing?.per_person != null && (
                              <span className="text-xs text-gray-500">
                                1인당 <span className="font-semibold text-blue-600">{fmt(Math.ceil(qPricing.pricing.per_person))}원</span>
                              </span>
                            )}
                            {q.pricing_mode === 'summary' ? (
                              <span className="text-xs font-medium text-amber-500">항목별 내역 없음</span>
                            ) : (
                              <span className="text-xs font-medium text-emerald-500">항목별 내역 포함</span>
                            )}
                          </div>
                          <div>
                            {isFinalized ? (
                              <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">최종 확정됨</span>
                            ) : isSelectedQuote && request.status === 'payment_pending' ? (
                              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-medium">결제 대기 중</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 결제 현황 — agency PaymentScheduleCard와 동일한 UI */}
      {schedule && (() => {
        const mainInstallments = installments.filter(i => i.rate > 0)
        const additionalInstallments = installments.filter(i => i.rate === 0 && i.label !== '공제 추가 청구')
        const deductionInstallments = installments.filter(i => i.label === '공제 추가 청구')
        const mainTotal = mainInstallments.reduce((s, i) => s + i.amount, 0)
        const mainPaid = mainInstallments.reduce((s, i) => s + i.paid_amount, 0)
        const mainPct = mainTotal > 0 ? Math.round(mainPaid / mainTotal * 100) : 0
        const mainRemaining = mainTotal - mainPaid

        function statusBadge(status: string) {
          switch (status) {
            case 'paid': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">결제완료</span>
            case 'partial': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">부분결제</span>
            case 'overdue': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">연체</span>
            case 'cancelled': return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">취소됨</span>
            default: return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">결제대기</span>
          }
        }

        function actionButton(inst: PaymentInstallment) {
          const isPaid = inst.status === 'paid'
          const isCancelled = inst.status === 'cancelled'
          if (isCancelled) return null
          return isPaid ? (
            <button onClick={() => setConfirmAction({ id: inst.id, action: 'pending', label: inst.label })} disabled={processingId === inst.id} className="px-2.5 py-1 text-[10px] font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">{processingId === inst.id ? '...' : '되돌리기'}</button>
          ) : (
            <button onClick={() => setConfirmAction({ id: inst.id, action: 'paid', label: inst.label })} disabled={processingId === inst.id} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{processingId === inst.id ? '...' : '결제완료'}</button>
          )
        }

        return (
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
            <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
              <h2 className="text-sm font-bold text-white">결제 현황</h2>
              <span className="text-[10px] font-medium text-gray-300 bg-white/15 px-2 py-0.5 rounded-full">
                {schedule.template_type === 'large_event' ? '대형행사 (3단계)' :
                 schedule.template_type === 'one_time' ? '한번에 결제' :
                 schedule.template_type === 'post_travel' ? '여행 후 정산' : '나눠서 결제'}
              </span>
            </div>

            {/* 기본 결제 회차 */}
            <div className="bg-white">
              {mainInstallments.map((inst, idx) => {
                const progressPct = inst.amount > 0 ? Math.min(100, Math.round((inst.paid_amount / inst.amount) * 100)) : 0
                return (
                  <div key={inst.id} className={`px-5 py-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                          inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                          inst.status === 'partial' ? 'bg-blue-500 text-white' :
                          inst.status === 'overdue' ? 'bg-red-500 text-white' :
                          inst.status === 'cancelled' ? 'bg-gray-200 text-gray-400' :
                          'bg-gray-100 text-gray-500 border border-gray-200'
                        }`}>
                          {inst.status === 'paid' ? '✓' : inst.status === 'cancelled' ? '✕' : idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-gray-900">{inst.label}</span>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{Math.round(inst.rate * 100)}%</span>
                            {statusBadge(inst.status)}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-gray-500">{inst.due_date}까지</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-base font-bold text-gray-900">{fmt(inst.amount)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></div>
                        </div>
                        {actionButton(inst)}
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

            {/* 총 결제금액 요약 */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">총 결제금액</span>
                <span className="text-xs text-gray-500">{fmt(mainTotal)}원</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${mainPct}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">결제완료 {fmt(mainPaid)}원 ({mainPct}%)</span>
                <span className={`text-sm font-bold ${mainRemaining > 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
                  {mainRemaining > 0 ? `잔여 ${fmt(mainRemaining)}원` : '전액 결제완료'}
                </span>
              </div>
            </div>

            {/* 추가 정산 */}
            {additionalInstallments.length > 0 && (
              <>
                <div className="px-5 py-2.5 bg-gray-100 border-t border-gray-200">
                  <span className="text-[11px] font-bold text-gray-500">추가 정산</span>
                </div>
                <div className="bg-white">
                  {additionalInstallments.map((inst) => {
                    const progressPct = inst.amount > 0 ? Math.min(100, Math.round((inst.paid_amount / inst.amount) * 100)) : 0
                    return (
                      <div key={inst.id} className="px-5 py-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                              inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                              inst.status === 'cancelled' ? 'bg-gray-200 text-gray-400' :
                              inst.status === 'partial' ? 'bg-blue-500 text-white' :
                              inst.status === 'overdue' ? 'bg-red-500 text-white' :
                              'bg-amber-100 text-amber-600 border border-amber-200'
                            }`}>
                              {inst.status === 'paid' ? '✓' : inst.status === 'cancelled' ? '✕' : '+'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{inst.label}</span>
                                {statusBadge(inst.status)}
                              </div>
                              <span className="text-[11px] text-gray-500">{inst.due_date}까지</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-gray-900">{fmt(inst.amount)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></span>
                            {actionButton(inst)}
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
                  const active = additionalInstallments.filter(i => i.status !== 'cancelled')
                  const addTotal = active.reduce((s, i) => s + i.amount, 0)
                  const addPaid = active.reduce((s, i) => s + i.paid_amount, 0)
                  const addPct = addTotal > 0 ? Math.round((addPaid / addTotal) * 100) : 0
                  const addRemaining = addTotal - addPaid
                  return (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">추가 정산 합계</span>
                        <span className="text-xs text-gray-500">{fmt(addTotal)}원</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${addPct}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">결제완료 {fmt(addPaid)}원 ({addPct}%)</span>
                        <span className={`text-xs font-bold ${addRemaining > 0 ? 'text-gray-700' : 'text-emerald-600'}`}>
                          {addRemaining > 0 ? `잔여 ${fmt(addRemaining)}원` : '전액 결제완료'}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            {/* 공제 추가 청구 */}
            {deductionInstallments.length > 0 && (
              <>
                <div className="px-5 py-2.5 bg-red-50 border-t border-red-200">
                  <span className="text-[11px] font-bold text-red-600">공제 추가 청구</span>
                </div>
                <div className="bg-white">
                  {deductionInstallments.map((inst) => {
                    const progressPct = inst.amount > 0 ? Math.min(100, Math.round((inst.paid_amount / inst.amount) * 100)) : 0
                    return (
                      <div key={inst.id} className="px-5 py-4 border-t border-red-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                              inst.status === 'paid' ? 'bg-emerald-500 text-white' :
                              inst.status === 'cancelled' ? 'bg-gray-200 text-gray-400' :
                              'bg-red-100 text-red-600 border border-red-200'
                            }`}>
                              {inst.status === 'paid' ? '✓' : inst.status === 'cancelled' ? '✕' : '!'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{inst.label}</span>
                                {statusBadge(inst.status)}
                              </div>
                              <span className="text-[11px] text-gray-500">{inst.due_date}까지</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-red-600">{fmt(inst.amount)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></span>
                            {actionButton(inst)}
                          </div>
                        </div>
                        {inst.paid_amount > 0 && (
                          <div className="mt-2 ml-10">
                            <div className="h-1 bg-red-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${inst.status === 'paid' ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${progressPct}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {(() => {
                  const dedTotal = deductionInstallments.reduce((s, i) => s + i.amount, 0)
                  const dedPaid = deductionInstallments.reduce((s, i) => s + i.paid_amount, 0)
                  const dedPct = dedTotal > 0 ? Math.round((dedPaid / dedTotal) * 100) : 0
                  const dedRemaining = dedTotal - dedPaid
                  return (
                    <div className="px-5 py-3 bg-red-50/50 border-t border-red-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-red-500">공제 추가 청구 합계</span>
                        <span className="text-xs text-red-500">{fmt(dedTotal)}원</span>
                      </div>
                      <div className="h-1.5 bg-red-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${dedPct}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">결제완료 {fmt(dedPaid)}원 ({dedPct}%)</span>
                        <span className={`text-xs font-bold ${dedRemaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {dedRemaining > 0 ? `잔여 ${fmt(dedRemaining)}원` : '전액 결제완료'}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )
      })()}

      {/* 공제 신청 (행사 취소) */}
      {request.status === 'closed' && (
        <DeductionClaimSection
          requestId={id}
          claims={deductionClaims}
          onUpdated={async () => {
            const res = await fetch(`/api/deduction-claims?requestId=${id}`)
            if (res.ok) {
              const { claims } = await res.json()
              setDeductionClaims(claims ?? [])
            }
            // 결제 데이터도 리로드 (공제 추가 청구 installment 반영)
            const schedRes = await fetch(`/api/payment-schedule?requestId=${id}`)
            if (schedRes.ok) {
              const schedJson = await schedRes.json()
              setSchedule(schedJson.schedule)
              setInstallments(schedJson.installments ?? [])
            }
          }}
          role="admin"
          paidTotal={installments.reduce((sum, i) => sum + i.paid_amount, 0)}
          totalCustomerPrice={schedule?.total_amount}
        />
      )}

      {/* 결제 확인 모달 */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {confirmAction.action === 'paid' ? '결제완료 처리' : '결제 되돌리기'}
              </h3>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className="text-sm text-gray-700">
                <strong>{confirmAction.label}</strong>을(를) {confirmAction.action === 'paid' ? '결제완료 처리' : '결제대기 상태로 되돌리'}하시겠습니까?
              </p>
              {confirmAction.action === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700">결제완료 상태를 되돌리면 결제대기 상태로 변경됩니다.</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const { id: instId, action } = confirmAction
                  setConfirmAction(null)
                  await handlePaymentAction(instId, action)
                }}
                disabled={!!processingId}
                className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
                  confirmAction.action === 'paid'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {processingId ? '처리 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
