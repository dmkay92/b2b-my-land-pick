'use client'

import { useEffect, useState, use } from 'react'
import { useSearchParams } from 'next/navigation'
import ItineraryView from '@/components/quote-view/ItineraryView'
import PricingView from '@/components/quote-view/PricingView'
import QuoteSummaryBar from '@/components/quote-view/QuoteSummaryBar'
import { calculateTotalPeople } from '@/lib/utils'
import { distributeMealExcludedMarkup } from '@/lib/pricing/markup'
import type { ItineraryDay, PricingData, QuoteRequest } from '@/lib/supabase/types'

interface QuoteDetailData {
  quote: { id: string; request_id: string; landco_id: string; status: string; file_name: string }
  request: QuoteRequest
  draft: { itinerary: ItineraryDay[]; pricing: PricingData }
  markup: { commission_per_person: number; commission_total: number } | null
  includes: string | null
  excludes: string | null
  isSelected: boolean
  landcoName: string
  pricing_mode: 'detailed' | 'summary'
  summary_total: number
  summary_per_person: number
}

export default function AdminQuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = use(params)
  const searchParams = useSearchParams()
  const urlMarkup = Number(searchParams.get('markup')) || 0
  const [data, setData] = useState<QuoteDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [activeTab, setActiveTab] = useState<'itinerary' | 'pricing'>('itinerary')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/quotes/${quoteId}/detail`)
      if (!res.ok) { setLoading(false); return }
      setData(await res.json())
      setLoading(false)
    }
    load()
  }, [quoteId])

  if (loading) return <div className="flex items-center justify-center h-64"><p>로딩 중...</p></div>
  if (!data) return <div className="p-8"><p>견적을 찾을 수 없습니다.</p></div>

  const totalPeople = calculateTotalPeople({
    adults: data.request.adults, children: data.request.children,
    infants: data.request.infants, leaders: data.request.leaders,
  })

  const isSummaryMode = data.pricing_mode === 'summary'
  const markupTotal = urlMarkup > 0 ? urlMarkup : (data.markup?.commission_total ?? 0)
  const exchangeRates = data.draft.pricing.exchangeRates ?? {}

  let baseTotal: number
  if (isSummaryMode) {
    const summaryCurrency = data.draft.pricing.currencies?.['summary'] ?? 'KRW'
    const summaryExRate = exchangeRates[summaryCurrency] ?? 0
    const rawTotal = data.summary_total || 0
    baseTotal = summaryCurrency === 'KRW' ? rawTotal : (summaryExRate > 0 ? Math.round(rawTotal * summaryExRate) : rawTotal)
  } else {
    const categories = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
    let krwTotal = 0
    for (const cat of categories) {
      for (const r of (data.draft.pricing[cat] ?? [])) {
        const cur = r.currency ?? 'KRW'
        const rowTotal = r.price * r.count * r.quantity
        if (cur === 'KRW') {
          krwTotal += rowTotal
        } else {
          const rate = exchangeRates[cur] ?? 0
          krwTotal += rate > 0 ? Math.round(rowTotal * rate) : 0
        }
      }
    }
    baseTotal = krwTotal
  }

  const totals = { total: baseTotal + markupTotal }
  const perPerson = totalPeople > 0 ? Math.round(totals.total / totalPeople) : 0

  let pricing = data.draft.pricing
  if (!isSummaryMode && markupTotal > 0) {
    const categories = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
    const allKrw = categories.every(cat =>
      (data.draft.pricing[cat] ?? []).every(r => (r.currency ?? 'KRW') === 'KRW')
    )
    if (allKrw) {
      pricing = distributeMealExcludedMarkup(pricing, markupTotal)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const params = markupTotal > 0 ? `?markup=${markupTotal}` : ''
      const res = await fetch(`/api/quotes/${quoteId}/download${params}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = data.quote.file_name || 'quote.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  // Admin은 선택 여부 관계없이 견적서 탭 볼 수 있음
  const showPricingTab = !isSummaryMode

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{data.request.event_name}</h1>
          <p className="text-sm text-gray-500">{data.landcoName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
              downloading ? 'bg-gray-400 text-gray-200 cursor-wait' : 'bg-gray-900 text-white hover:bg-gray-800 active:scale-95'
            }`}
          >
            {downloading ? '다운로드 중...' : '엑셀 다운로드'}
          </button>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 text-sm rounded-lg font-medium bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all duration-200"
          >
            닫기
          </button>
        </div>
      </div>

      <QuoteSummaryBar
        total={totals.total}
        perPerson={perPerson}
        agencyMarkup={markupTotal > 0 ? markupTotal : undefined}
        totalPeople={totalPeople}
      />

      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'itinerary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            일정표
          </button>
          {showPricingTab && (
            <button
              onClick={() => setActiveTab('pricing')}
              className={`pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'pricing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              견적서
            </button>
          )}
          {isSummaryMode && (
            <span className="pb-2 text-sm font-medium text-gray-300 border-b-2 border-transparent cursor-default relative group">
              견적서
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                항목별 내역이 포함되지 않은 견적입니다
              </span>
            </span>
          )}
        </nav>
      </div>

      {activeTab === 'itinerary' && (
        <>
          {(data.includes || data.excludes) && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              {data.includes && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-emerald-700 mb-2">포함사항</h4>
                  <ul className="space-y-1">
                    {data.includes.split('\n').filter(Boolean).map((item, i) => (
                      <li key={i} className="text-sm text-emerald-800 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5">+</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.excludes && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-red-700 mb-2">불포함사항</h4>
                  <ul className="space-y-1">
                    {data.excludes.split('\n').filter(Boolean).map((item, i) => (
                      <li key={i} className="text-sm text-red-800 flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5">-</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <ItineraryView itinerary={data.draft.itinerary} />
        </>
      )}
      {activeTab === 'pricing' && showPricingTab && (
        <PricingView pricing={pricing} totalPeople={totalPeople} />
      )}
    </div>
  )
}
