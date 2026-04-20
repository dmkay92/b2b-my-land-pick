'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import ItineraryView from '@/components/quote-view/ItineraryView'
import PricingView from '@/components/quote-view/PricingView'
import QuoteSummaryBar from '@/components/quote-view/QuoteSummaryBar'
import { calculateTotalPeople } from '@/lib/utils'
import { calculatePricingTotals } from '@/lib/pricing/markup'
import type { ItineraryDay, PricingData, QuoteRequest } from '@/lib/supabase/types'

interface QuoteDetailData {
  quote: { id: string; request_id: string; landco_id: string; status: string; file_name: string }
  request: QuoteRequest
  draft: { itinerary: ItineraryDay[]; pricing: PricingData }
  landcoName: string
}

export default function LandcoQuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<QuoteDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'itinerary' | 'pricing'>('itinerary')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/quotes/${quoteId}/detail`)
      if (!res.ok) { setLoading(false); return }
      const json = await res.json()
      setData(json)
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

  const pricing = data.draft.pricing
  const totals = calculatePricingTotals(pricing)
  const perPerson = totalPeople > 0 ? Math.round(totals.total / totalPeople) : 0

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-2">
            &larr; 뒤로가기
          </button>
          <h1 className="text-xl font-bold">{data.request.event_name}</h1>
          <p className="text-sm text-gray-500">{data.landcoName}</p>
        </div>
      </div>

      <QuoteSummaryBar total={totals.total} perPerson={perPerson} />

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
          <button
            onClick={() => setActiveTab('pricing')}
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'pricing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            견적서
          </button>
        </nav>
      </div>

      {activeTab === 'itinerary' && <ItineraryView itinerary={data.draft.itinerary} />}
      {activeTab === 'pricing' && <PricingView pricing={pricing} totalPeople={totalPeople} />}
    </div>
  )
}
