'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import type { ItineraryDay, PricingData, QuoteRequest } from '@/lib/supabase/types'
import { ItineraryEditor } from '@/components/quote-editor/ItineraryEditor'
import { PricingEditor } from '@/components/quote-editor/PricingEditor'
import { TemplateModal } from '@/components/quote-editor/TemplateModal'
import { ExcelPreviewModal } from '@/components/ExcelPreviewModal'

const defaultPricing: PricingData = {
  호텔: [], 차량: [], 식사: [], 입장료: [], 가이드비용: [], 기타: [],
}

function makeMockRequest(days: number): QuoteRequest {
  const depart = new Date().toISOString().slice(0, 10)
  const ret = new Date(Date.now() + (days - 1) * 86400000).toISOString().slice(0, 10)
  return {
    id: '__standalone__',
    agency_id: '',
    event_name: '',
    destination_country: '',
    destination_city: '',
    depart_date: depart,
    return_date: ret,
    adults: 1,
    children: 0,
    infants: 0,
    leaders: 0,
    quote_type: 'land',
    hotel_grade: 5,
    shopping_option: null,
    shopping_count: null,
    tip_option: null,
    local_option: null,
    deadline: '',
    notes: null,
    travel_type: null,
    religion_type: null,
    status: 'open',
    created_at: '',
    flight_schedule: null,
  }
}

type ActiveTab = 'itinerary' | 'pricing'

export default function StandaloneQuoteEditor() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [templateId, setTemplateId] = useState<string | null>(searchParams.get('templateId'))

  const [days, setDays] = useState(6)
  const [activeTab, setActiveTab] = useState<ActiveTab>('itinerary')
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([])
  const [pricing, setPricing] = useState<PricingData>(defaultPricing)
  const [pricingMode, setPricingMode] = useState<'detailed' | 'summary'>('detailed')
  const [summaryTotal, setSummaryTotal] = useState(0)
  const [summaryPerPerson, setSummaryPerPerson] = useState(0)
  const [templateMode, setTemplateMode] = useState<'save' | 'load' | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [loading, setLoading] = useState(!!templateId)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [previewData, setPreviewData] = useState<{ fileUrl: string; fileName: string; previewHtml?: Record<string, string> } | null>(null)

  const itineraryRef = useRef(itinerary)
  const pricingRef = useRef(pricing)
  useEffect(() => { itineraryRef.current = itinerary }, [itinerary])
  useEffect(() => { pricingRef.current = pricing }, [pricing])

  // 기존 템플릿 불러오기
  useEffect(() => {
    if (!templateId) return
    fetch(`/api/templates/${templateId}`)
      .then(r => r.json())
      .then(({ template }) => {
        if (!template) return
        setTemplateName(template.name)
        if (template.itinerary?.length > 0) {
          const sorted = [...template.itinerary].sort((a, b) => a.day - b.day)
          setItinerary(sorted)
          setDays(sorted.length)
        }
        if (template.pricing) setPricing(template.pricing)
      })
      .finally(() => setLoading(false))
  }, [templateId])

  // days 변경 시 itinerary 길이 조정
  useEffect(() => {
    setItinerary(prev => {
      if (prev.length === days) return prev
      if (prev.length > days) {
        return prev.slice(0, days).map((d, i) => ({ ...d, day: i + 1 }))
      }
      const added: ItineraryDay[] = []
      for (let i = prev.length; i < days; i++) {
        added.push({
          day: i + 1,
          date: '',
          rows: [],
          overnight: { type: 'hotel', stars: 5, name: '' },
          meals: {
            조식: { active: true, note: '' },
            중식: { active: true, note: '' },
            석식: { active: true, note: '' },
          },
        })
      }
      return [...prev, ...added]
    })
  }, [days])

  const mockRequest = makeMockRequest(days)

  function handleTemplateLoad(newItinerary: ItineraryDay[], newPricing: PricingData) {
    setItinerary(newItinerary)
    setPricing(newPricing)
  }


  async function handlePreviewOrDownload(mode: 'preview' | 'download') {
    if (mode === 'download') setIsDownloading(true)
    try {
      const res = await fetch('/api/quotes/template/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary, pricing, templateName }),
      })
      if (!res.ok) { toast('미리보기 생성에 실패했습니다.', 'error'); return }
      const { fileUrl, fileName, previewHtml } = await res.json()
      if (mode === 'preview') {
        setPreviewData({ fileUrl, fileName, previewHtml })
      } else {
        const a = document.createElement('a')
        a.href = fileUrl
        a.download = fileName
        a.click()
      }
    } finally {
      if (mode === 'download') setIsDownloading(false)
    }
  }

  async function handleSave() {
    if (!templateName.trim()) {
      toast('템플릿 이름을 입력해주세요.', 'error')
      return
    }
    setIsSaving(true)
    try {
      const url = templateId ? `/api/templates/${templateId}` : '/api/templates'
      const method = templateId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, itinerary, pricing }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast(json.error ?? '저장에 실패했습니다.', 'error')
        return
      }
      const json = await res.json()
      if (!templateId && json.template?.id) setTemplateId(json.template.id)
      toast(templateId ? '템플릿이 수정되었습니다.' : '템플릿이 저장되었습니다.', 'success')
      // 창 유지 (새 탭에서 열린 경우)
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">불러오는 중...</div>
  }

  return (
    <>
      {/* 나가기 확인 모달 */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setShowExitConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-bold text-gray-900 mb-2">나가기</h3>
            <p className="text-sm text-gray-500 mb-6">저장하지 않은 변경 사항은 사라집니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowExitConfirm(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">취소</button>
              <button autoFocus onClick={() => window.close()} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">나가기</button>
            </div>
          </div>
        </div>
      )}

      {/* 미리보기 모달 */}
      {previewData && (
        <ExcelPreviewModal
          fileUrl={previewData.fileUrl}
          fileName={previewData.fileName}
          previewHtml={previewData.previewHtml}
          onClose={() => setPreviewData(null)}
        />
      )}

      {templateMode && (
        <TemplateModal
          mode={templateMode}
          itinerary={itinerary}
          pricing={pricing}
          onLoad={handleTemplateLoad}
          onClose={() => setTemplateMode(null)}
        />
      )}

      <div className="flex flex-col h-full">
        {/* 헤더 */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {templateId ? '템플릿 수정' : '새 템플릿 만들기'}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">템플릿으로 저장해두고 나중에 견적 요청에 불러올 수 있습니다.</p>
          </div>

          {/* 일수 설정 */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">총</label>
              <input
                type="number"
                value={days}
                min={1}
                onChange={e => setDays(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500">일</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="템플릿 이름"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {!templateId && (
                <button
                  onClick={() => setTemplateMode('load')}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  템플릿 불러오기
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>

        {/* 탭 + 버튼 */}
        <div className="bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex">
            {(['itinerary', 'pricing'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab === 'itinerary' ? '📅 일정표' : '💰 견적서'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExitConfirm(true)}
              className="flex items-center gap-1.5 border border-red-200 text-red-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
            >
              나가기
            </button>
            <button
              onClick={() => handlePreviewOrDownload('download')}
              disabled={isDownloading}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isDownloading ? '생성 중...' : '엑셀 다운로드'}
            </button>
            <button
              onClick={() => handlePreviewOrDownload('preview')}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              미리보기
            </button>
          </div>
        </div>

        {/* 에디터 */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'itinerary' ? (
            <ItineraryEditor
              request={mockRequest}
              itinerary={itinerary}
              onChange={setItinerary}
            />
          ) : (
            <PricingEditor
              request={mockRequest}
              pricing={pricing}
              onChange={setPricing}
              pricingMode={pricingMode}
              onPricingModeChange={setPricingMode}
              summaryTotal={summaryTotal}
              summaryPerPerson={summaryPerPerson}
              onSummaryTotalChange={setSummaryTotal}
              onSummaryPerPersonChange={setSummaryPerPerson}
            />
          )}
        </div>
      </div>
    </>
  )
}
