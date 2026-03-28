'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import type { QuoteRequest, ItineraryDay, PricingData } from '@/lib/supabase/types'
import { ItineraryEditor } from './ItineraryEditor'
import { PricingEditor } from './PricingEditor'
import { QuotePreview } from './QuotePreview'

interface Props {
  requestId: string
}

const defaultPricing: PricingData = {
  호텔: [],
  차량: [],
  식사: [],
  입장료: [],
  가이드비용: [],
  기타: [],
}

type ActiveTab = 'itinerary' | 'pricing'
type SaveStatus = 'saved' | 'saving' | 'unsaved'

export function QuoteEditorShell({ requestId }: Props) {
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('itinerary')
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([])
  const [pricing, setPricing] = useState<PricingData>(defaultPricing)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [showPreview, setShowPreview] = useState(false)

  const isDirtyRef = useRef(false)
  const itineraryRef = useRef(itinerary)
  const pricingRef = useRef(pricing)

  // keep refs in sync
  useEffect(() => { itineraryRef.current = itinerary }, [itinerary])
  useEffect(() => { pricingRef.current = pricing }, [pricing])

  // request + draft 로드
  useEffect(() => {
    async function load() {
      try {
        const [reqRes, draftRes] = await Promise.all([
          fetch(`/api/requests/${requestId}`),
          fetch(`/api/quotes/draft?requestId=${requestId}`),
        ])
        if (reqRes.ok) {
          const { request: req } = await reqRes.json()
          setRequest(req)
        }
        if (draftRes.ok) {
          const { draft } = await draftRes.json()
          if (draft) {
            if (draft.itinerary?.length > 0) setItinerary(draft.itinerary)
            if (draft.pricing) setPricing(draft.pricing)
          }
        }
      } catch {
        // 로드 실패 시 무시
      }
    }
    load()
  }, [requestId])

  const saveDraft = useCallback(async () => {
    setSaveStatus('saving')
    try {
      await fetch('/api/quotes/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          itinerary: itineraryRef.current,
          pricing: pricingRef.current,
        }),
      })
    } finally {
      setSaveStatus('saved')
      isDirtyRef.current = false
    }
  }, [requestId])

  // 30초마다 자동저장 (변경사항 있을 때만)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirtyRef.current) {
        saveDraft()
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [saveDraft])

  function handleItineraryChange(next: ItineraryDay[]) {
    setItinerary(next)
    isDirtyRef.current = true
    setSaveStatus('unsaved')
  }

  function handlePricingChange(next: PricingData) {
    setPricing(next)
    isDirtyRef.current = true
    setSaveStatus('unsaved')
  }

  async function handleTabChange(tab: ActiveTab) {
    if (tab === activeTab) return
    await saveDraft()
    setActiveTab(tab)
  }

  const saveStatusLabel =
    saveStatus === 'saving'
      ? '저장 중...'
      : saveStatus === 'unsaved'
      ? '저장되지 않은 변경사항'
      : '자동저장됨 ✓'

  const saveStatusColor =
    saveStatus === 'saving'
      ? 'text-blue-500'
      : saveStatus === 'unsaved'
      ? 'text-amber-500'
      : 'text-green-600'

  if (!request) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">
        로딩 중...
      </div>
    )
  }

  return (
    <>
      {showPreview && (
        <QuotePreview
          requestId={requestId}
          onClose={() => setShowPreview(false)}
          onSubmitted={() => {
            setSaveStatus('saved')
          }}
        />
      )}

      <div className="flex flex-col h-full">
        {/* 상단 헤더 */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {request.event_name} 견적서 작성
              </h1>
            </div>
            <span className={`text-xs font-medium ${saveStatusColor}`}>
              {saveStatusLabel}
            </span>
          </div>
        </div>

        {/* 탭 + 미리보기 버튼 */}
        <div className="bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex">
            <button
              onClick={() => handleTabChange('itinerary')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'itinerary'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📅 일정표
            </button>
            <button
              onClick={() => handleTabChange('pricing')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pricing'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              💰 견적서
            </button>
          </div>
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            미리보기 · 제출
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 탭 컨텐츠 */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'itinerary' ? (
            <ItineraryEditor
              request={request}
              itinerary={itinerary}
              onChange={handleItineraryChange}
            />
          ) : (
            <PricingEditor
              request={request}
              pricing={pricing}
              onChange={handlePricingChange}
            />
          )}

        </div>
      </div>
    </>
  )
}
