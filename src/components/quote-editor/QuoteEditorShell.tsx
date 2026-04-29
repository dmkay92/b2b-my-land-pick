'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from '@/lib/toast'
import type { QuoteRequest, ItineraryDay, PricingData, PricingRow } from '@/lib/supabase/types'
import { ItineraryEditor } from './ItineraryEditor'
import { PricingEditor } from './PricingEditor'
import { QuotePreview } from './QuotePreview'
import { TemplateModal } from './TemplateModal'

interface Props {
  requestId: string
}

const emptyPricingRow = () => ({ date: '', detail: '', price: 0, count: 1, quantity: 1 })

const defaultPricing: PricingData = {
  호텔: [emptyPricingRow()],
  차량: [emptyPricingRow()],
  식사: [emptyPricingRow()],
  입장료: [emptyPricingRow()],
  가이드비용: [emptyPricingRow()],
  기타: [emptyPricingRow()],
}

type ActiveTab = 'itinerary' | 'pricing'
type SaveStatus = 'saved' | 'saving' | 'unsaved'

export function QuoteEditorShell({ requestId }: Props) {
  const searchParams = useSearchParams()
  const resetDraft = searchParams.get('reset') === '1'
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('itinerary')
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([])
  const [pricing, setPricing] = useState<PricingData>(defaultPricing)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [previewMode, setPreviewMode] = useState<'hidden' | 'preview' | 'submit'>('hidden')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [submitMode, setSubmitMode] = useState<'detailed' | 'summary'>('detailed')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [templateMode, setTemplateMode] = useState<'save' | 'load' | null>(null)
  const [pricingMode, setPricingMode] = useState<'detailed' | 'summary'>('detailed')
  const [summaryTotal, setSummaryTotal] = useState(0)
  const [summaryPerPerson, setSummaryPerPerson] = useState(0)
  const [isParsingExcel, setIsParsingExcel] = useState(false)
  const [includes, setIncludes] = useState('')
  const [excludes, setExcludes] = useState('')
  const [previousVersions, setPreviousVersions] = useState<{ id: string; version: number; submitted_at: string }[]>([])
  const [showVersionDropdown, setShowVersionDropdown] = useState(false)
  const [loadingVersion, setLoadingVersion] = useState(false)
  const closeAfterTemplateSaveRef = useRef(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  const isDirtyRef = useRef(false)
  const itineraryRef = useRef(itinerary)
  const pricingRef = useRef(pricing)
  const pricingModeRef = useRef(pricingMode)
  const summaryTotalRef = useRef(summaryTotal)
  const summaryPerPersonRef = useRef(summaryPerPerson)
  const includesRef = useRef('')
  const excludesRef = useRef('')

  // keep refs in sync
  useEffect(() => { itineraryRef.current = itinerary }, [itinerary])
  useEffect(() => { pricingRef.current = pricing }, [pricing])
  useEffect(() => { pricingModeRef.current = pricingMode }, [pricingMode])
  useEffect(() => { summaryTotalRef.current = summaryTotal }, [summaryTotal])
  useEffect(() => { summaryPerPersonRef.current = summaryPerPerson }, [summaryPerPerson])
  useEffect(() => { includesRef.current = includes }, [includes])
  useEffect(() => { excludesRef.current = excludes }, [excludes])

  // request + draft 로드
  useEffect(() => {
    async function load() {
      try {
        const [reqRes, draftRes] = await Promise.all([
          fetch(`/api/requests/${requestId}`),
          fetch(`/api/quotes/draft?requestId=${requestId}`),
        ])
        let req: QuoteRequest | null = null
        if (reqRes.ok) {
          const json = await reqRes.json()
          req = json.request
          setRequest(req)
        }
        let draftLoaded = false
        if (draftRes.ok) {
          const { draft } = await draftRes.json()
          if (draft) {
            if (resetDraft) {
              // 새로 작성 요청: 기존 임시저장 삭제
              await fetch(`/api/quotes/draft?requestId=${requestId}`, { method: 'DELETE' })
            } else {
              if (draft.itinerary?.length > 0) setItinerary(draft.itinerary)
              if (draft.pricing) setPricing(draft.pricing)
              if (draft.pricing_mode) setPricingMode(draft.pricing_mode)
              if (draft.summary_total) setSummaryTotal(draft.summary_total)
              if (draft.summary_per_person) setSummaryPerPerson(draft.summary_per_person)
              setIncludes(draft.includes ?? '')
              setExcludes(draft.excludes ?? '')
              draftLoaded = true
            }
          }
        }
        // draft 없음(또는 reset): 날짜 범위로 기본 일정 생성 (각 날짜에 빈 row 1개)
        if (req && !draftLoaded) {
          const [dy, dm, dd] = req.depart_date.split('-').map(Number)
          const [ry, rm, rd] = req.return_date.split('-').map(Number)
          const departMs = Date.UTC(dy, dm - 1, dd)
          const returnMs = Date.UTC(ry, rm - 1, rd)
          const totalDays = Math.max(1, Math.ceil((returnMs - departMs) / (1000 * 60 * 60 * 24)) + 1)
          const defaultItinerary: ItineraryDay[] = Array.from({ length: totalDays }, (_, i) => {            const ms = departMs + i * 86400000
            const d = new Date(ms)
            const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            return {
              day: i + 1,
              date,
              rows: [
                { area: '', transport: '', time: '', content: '', meal: '' },
                { area: '', transport: '', time: '', content: '', meal: '' },
                { area: '', transport: '', time: '', content: '', meal: '' },
              ],
              overnight: { type: 'hotel', stars: (req!.hotel_grade as 3 | 4 | 5) ?? 4 },
            }
          })
          setItinerary(defaultItinerary)
        }
      } catch {
        // 로드 실패 시 무시
      }

      // 이전 제출 버전 목록 로드
      try {
        const versionsRes = await fetch(`/api/requests/${requestId}`)
        if (versionsRes.ok) {
          const { quotes } = await versionsRes.json()
          const myQuotes = (quotes ?? [])
            .map((q: { id: string; version: number; submitted_at: string }) => ({
              id: q.id, version: q.version, submitted_at: q.submitted_at,
            }))
            .sort((a: { version: number }, b: { version: number }) => b.version - a.version)
          setPreviousVersions(myQuotes)
        }
      } catch { /* ignore */ }
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
          pricing_mode: pricingModeRef.current,
          summary_total: summaryTotalRef.current,
          summary_per_person: summaryPerPersonRef.current,
          includes: includesRef.current || null,
          excludes: excludesRef.current || null,
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

  async function handleDownload() {
    setIsDownloading(true)
    try {
      await saveDraft()
      const res = await fetch('/api/quotes/draft/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      if (!res.ok) return
      const { fileUrl, fileName } = await res.json()
      const a = document.createElement('a')
      a.href = fileUrl
      a.download = fileName
      a.click()
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleSubmit(mode: 'detailed' | 'summary') {
    if (!includesRef.current.trim()) {
      toast('포함사항을 입력해주세요.', 'error')
      return
    }
    if (!excludesRef.current.trim()) {
      toast('불포함사항을 입력해주세요.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      await saveDraft()
      const res = await fetch('/api/quotes/draft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, pricing_mode: mode }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast(json.error ?? '제출에 실패했습니다.', 'error')
        return
      }
      setSaveStatus('saved')
      toast('견적서가 제출되었습니다.', 'success')
      window.opener?.location.reload()
      window.close()
    } catch {
      toast('제출 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteDraft() {
    setIsDeleting(true)
    try {
      await fetch(`/api/quotes/draft?requestId=${requestId}`, { method: 'DELETE' })
      window.opener?.location.reload()
      window.close()
    } finally {
      setIsDeleting(false)
    }
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

  async function handleExcelImport(file: File) {
    setIsParsingExcel(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/quotes/parse-excel', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || '엑셀 파싱에 실패했습니다.')
        return
      }
      const { itinerary: newItinerary, pricing: newPricing } = await res.json()
      setItinerary(newItinerary)
      setPricing(newPricing)
      isDirtyRef.current = true
      setSaveStatus('unsaved')
    } catch {
      alert('엑셀 파싱 중 오류가 발생했습니다.')
    } finally {
      setIsParsingExcel(false)
    }
  }

  async function handleLoadVersion(quoteId: string) {
    setLoadingVersion(true)
    setShowVersionDropdown(false)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/detail`)
      if (!res.ok) { alert('버전 데이터를 불러올 수 없습니다.'); return }
      const json = await res.json()
      if (json.draft?.itinerary) setItinerary(json.draft.itinerary)
      if (json.draft?.pricing) setPricing(json.draft.pricing)
      if (json.pricing_mode) setPricingMode(json.pricing_mode)
      if (json.summary_total) setSummaryTotal(json.summary_total)
      if (json.summary_per_person) setSummaryPerPerson(json.summary_per_person)
      setIncludes(json.draft?.includes ?? '')
      setExcludes(json.draft?.excludes ?? '')
      isDirtyRef.current = true
      setSaveStatus('unsaved')
    } catch {
      alert('버전 불러오기에 실패했습니다.')
    } finally {
      setLoadingVersion(false)
    }
  }

  function handleTemplateLoad(newItinerary: ItineraryDay[], newPricing: PricingData) {
    setItinerary(newItinerary)
    setPricing(newPricing)
    isDirtyRef.current = true
    setSaveStatus('unsaved')
  }

  return (
    <>
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleExcelImport(file)
          e.target.value = ''
        }}
      />
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setShowExitConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">에디터 나가기</h3>
            <p className="text-sm text-gray-500 mt-2">작성 중인 내용은 자동저장되어 있습니다.</p>
            <p className="text-xs text-gray-400 mt-1">나가도 임시저장된 내용은 유지됩니다.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                autoFocus
                onClick={() => { setShowExitConfirm(false); window.opener?.location.reload(); window.close() }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                나가기
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">임시저장 삭제</h3>
            <p className="text-sm text-gray-500 mt-2">임시저장된 내용을 삭제하시겠습니까?</p>
            <p className="text-xs text-gray-400 mt-1">삭제 후 복구할 수 없습니다.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                autoFocus
                onClick={() => { setShowDeleteConfirm(false); handleDeleteDraft() }}
                disabled={isDeleting}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
      {showSubmitConfirm && (() => {
        const categories: (keyof PricingData)[] = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타']
        const hasPricingItems = categories.some(cat =>
          (pricing[cat] as PricingRow[])?.some((r: PricingRow) => r.detail || r.price > 0)
        )
        const hasSummaryTotal = summaryTotal > 0
        const canSubmit = submitMode === 'detailed' ? hasPricingItems : hasSummaryTotal
        const warningMessage = submitMode === 'detailed'
          ? '항목별 견적 데이터가 입력되지 않았습니다.'
          : '합계 금액이 입력되지 않았습니다.'
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setShowSubmitConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">견적 제출 방식 선택</h3>
            <p className="text-xs text-gray-400 mt-1">제출 후에는 수정할 수 없습니다.</p>
            <div className="mt-4 space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${submitMode === 'summary' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="submitMode" checked={submitMode === 'summary'} onChange={() => setSubmitMode('summary')} className="accent-blue-600" />
                <div>
                  <span className="text-sm font-medium text-gray-900">합계만</span>
                  <p className="text-xs text-gray-500">총액만 전달합니다</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${submitMode === 'detailed' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="submitMode" checked={submitMode === 'detailed'} onChange={() => setSubmitMode('detailed')} className="accent-blue-600" />
                <div>
                  <span className="text-sm font-medium text-gray-900">항목별</span>
                  <p className="text-xs text-gray-500">상세 내역을 포함합니다</p>
                </div>
              </label>
            </div>
            {!canSubmit && (
              <p className="text-sm text-amber-600 mt-3 flex items-center gap-1">
                <span>&#9888;</span> {warningMessage}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => { setShowSubmitConfirm(false); handleSubmit(submitMode) }}
                disabled={isSubmitting || !canSubmit}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                제출하기
              </button>
            </div>
          </div>
        </div>
        )
      })()}
      {templateMode && (
        <TemplateModal
          mode={templateMode}
          itinerary={itinerary}
          pricing={pricing}
          onLoad={handleTemplateLoad}
          onClose={() => {
            setTemplateMode(null)
            if (closeAfterTemplateSaveRef.current) {
              closeAfterTemplateSaveRef.current = false
              window.opener?.location.reload()
              window.close()
            }
          }}
        />
      )}
      {previewMode !== 'hidden' && (
        <QuotePreview
          requestId={requestId}
          onClose={() => setPreviewMode('hidden')}
          onSubmitted={() => {
            setSaveStatus('saved')
          }}
          showSubmit={previewMode === 'submit'}
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
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${saveStatusColor}`}>
                {saveStatusLabel}
              </span>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="border border-red-200 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isDeleting ? '삭제 중...' : '임시저장 삭제'}
              </button>
            </div>
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
                  : 'border-transparent text-gray-400 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              📅 일정표
            </button>
            <button
              onClick={() => handleTabChange('pricing')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pricing'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              💰 견적서
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExitConfirm(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              나가기
            </button>
            <button
              onClick={() => excelInputRef.current?.click()}
              disabled={isParsingExcel}
              className="border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isParsingExcel ? '분석 중...' : '📄 엑셀 불러오기'}
            </button>
            {previousVersions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                  disabled={loadingVersion}
                  className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {loadingVersion ? '불러오는 중...' : '이전 버전 ▼'}
                </button>
                {showVersionDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowVersionDropdown(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[220px] py-1">
                      {previousVersions.map(v => (
                        <button
                          key={v.id}
                          onClick={() => handleLoadVersion(v.id)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span className="font-medium text-gray-900">v{v.version}</span>
                          <span className="text-xs text-gray-400">{new Date(v.submitted_at).toLocaleString('ko-KR')}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => setTemplateMode('load')}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              템플릿 불러오기
            </button>
            <button
              onClick={() => setTemplateMode('save')}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              템플릿 저장
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isDownloading ? '생성 중...' : '엑셀 다운로드'}
            </button>
            <button
              onClick={() => setPreviewMode('preview')}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              미리보기
            </button>
            <button
              onClick={() => { setSubmitMode(pricingMode); setShowSubmitConfirm(true) }}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? '제출 중...' : '제출하기'}
            </button>
          </div>
        </div>

        {/* 견적서 서브탭 */}
        {activeTab === 'pricing' && (
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-2 flex-shrink-0">
            <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit">
              <button
                onClick={() => { setPricingMode('detailed'); isDirtyRef.current = true; setSaveStatus('unsaved') }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  pricingMode === 'detailed'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                항목별
              </button>
              <button
                onClick={() => { setPricingMode('summary'); isDirtyRef.current = true; setSaveStatus('unsaved') }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  pricingMode === 'summary'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                합계만
              </button>
            </div>
          </div>
        )}

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
              pricingMode={pricingMode}
              onPricingModeChange={mode => { setPricingMode(mode); isDirtyRef.current = true; setSaveStatus('unsaved') }}
              summaryTotal={summaryTotal}
              summaryPerPerson={summaryPerPerson}
              onSummaryTotalChange={v => { setSummaryTotal(v); isDirtyRef.current = true; setSaveStatus('unsaved') }}
              onSummaryPerPersonChange={v => { setSummaryPerPerson(v); isDirtyRef.current = true; setSaveStatus('unsaved') }}
            />
          )}

        </div>

        {/* 포함사항 / 불포함사항 */}
        <div className="bg-slate-50 border-t-2 border-slate-300 px-6 py-5 flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-800">포함 / 불포함 사항</h3>
            <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">필수</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1">
                <span className="text-emerald-500">+</span> 포함사항
              </label>
              <textarea
                value={includes}
                onChange={e => { setIncludes(e.target.value); isDirtyRef.current = true }}
                placeholder="예: 호텔, 식사, 가이드비 등"
                rows={3}
                className="w-full border-2 border-emerald-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-red-600 mb-1.5 flex items-center gap-1">
                <span className="text-red-400">-</span> 불포함사항
              </label>
              <textarea
                value={excludes}
                onChange={e => { setExcludes(e.target.value); isDirtyRef.current = true }}
                placeholder="예: 입장료, 개인경비, 여행자보험 등"
                rows={3}
                className="w-full border-2 border-red-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-red-400"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
