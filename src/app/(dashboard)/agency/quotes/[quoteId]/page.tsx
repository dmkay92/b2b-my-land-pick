'use client'

import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ItineraryView from '@/components/quote-view/ItineraryView'
import PricingView from '@/components/quote-view/PricingView'
import QuoteSummaryBar from '@/components/quote-view/QuoteSummaryBar'
import { calculateTotalPeople } from '@/lib/utils'
import { distributeMealExcludedMarkup, calculatePricingTotals } from '@/lib/pricing/markup'
import type { ItineraryDay, PricingData, QuoteRequest } from '@/lib/supabase/types'

interface QuoteDetailData {
  quote: { id: string; request_id: string; landco_id: string; status: string; file_name: string }
  request: QuoteRequest
  draft: { itinerary: ItineraryDay[]; pricing: PricingData }
  markup: { markup_per_person: number; markup_total: number } | null
  isSelected: boolean
  landcoName: string
}

export default function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = use(params)
  const router = useRouter()
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

  // Agency markup (URL param takes priority over DB)
  let pricing = data.draft.pricing
  const markupTotal = urlMarkup > 0 ? urlMarkup : (data.markup?.markup_total ?? 0)
  if (markupTotal > 0) {
    pricing = distributeMealExcludedMarkup(pricing, markupTotal)
  }

  const totals = calculatePricingTotals(pricing)
  const perPerson = totalPeople > 0 ? Math.round(totals.total / totalPeople) : 0

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const params = markupTotal > 0 ? `?markup=${markupTotal}` : ''
      const res = await fetch(`/api/quotes/${quoteId}/download${params}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.quote.file_name || 'quote.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            ← 뒤로가기
          </button>
          <h1 className="text-xl font-bold">{data.request.event_name}</h1>
          <p className="text-sm text-gray-500">{data.landcoName}</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
            downloading
              ? 'bg-gray-400 text-gray-200 cursor-wait'
              : 'bg-gray-900 text-white hover:bg-gray-800 active:scale-95'
          }`}
        >
          {downloading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              다운로드 중...
            </span>
          ) : '엑셀 다운로드'}
        </button>
      </div>

      {/* Summary Bar */}
      <QuoteSummaryBar
        total={totals.total}
        perPerson={perPerson}
        agencyMarkup={markupTotal > 0 ? markupTotal : undefined}
      />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'itinerary'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            일정표
          </button>
          {data.isSelected && (
            <button
              onClick={() => setActiveTab('pricing')}
              className={`pb-2 text-sm font-medium border-b-2 ${
                activeTab === 'pricing'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              견적서
            </button>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'itinerary' && <ItineraryView itinerary={data.draft.itinerary} />}
      {activeTab === 'pricing' && data.isSelected && (
        <PricingView pricing={pricing} totalPeople={totalPeople} />
      )}
    </div>
  )
}
