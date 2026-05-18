'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDate, calculateTotalPeople, getCountryName } from '@/lib/utils'
import { ExcelPreviewModal } from '@/components/ExcelPreviewModal'
import { BackButton } from '@/components/BackButton'
import type { QuoteRequest } from '@/lib/supabase/types'

type RequestInfo = Pick<
  QuoteRequest,
  'id' | 'event_name' | 'destination_country' | 'destination_city' |
  'depart_date' | 'return_date' | 'adults' | 'children' | 'infants' | 'leaders' | 'status'
>

interface DraftItem {
  request_id: string
  updated_at: string
  quote_requests: RequestInfo
}

interface QuoteItem {
  id: string
  request_id: string
  version: number
  file_url: string
  file_name: string
  status: string
  submitted_at: string
  quote_requests: RequestInfo
}

interface GroupedQuote {
  request_id: string
  quote_requests: RequestInfo
  quotes: QuoteItem[]
  selectedQuoteId?: string
}

interface Template {
  id: string
  name: string
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  open: '모집중',
  in_progress: '진행중',
  closed: '마감',
  finalized: '확정',
}

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
  finalized: 'bg-purple-100 text-purple-700',
}

function RequestMeta({ req }: { req: RequestInfo }) {
  const total = calculateTotalPeople({
    adults: req.adults, children: req.children,
    infants: req.infants, leaders: req.leaders,
  })
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-xs text-gray-500">
      <span>{getCountryName(req.destination_country)} {req.destination_city}</span>
      <span>·</span>
      <span>{formatDate(req.depart_date)} ~ {formatDate(req.return_date)}</span>
      <span>·</span>
      <span>총 {total}명</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export default function LandcoQuotesPage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [grouped, setGrouped] = useState<GroupedQuote[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [copyingTemplateId, setCopyingTemplateId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; url: string; name: string; previewHtml?: Record<string, string> } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const [draftData, quoteData, templateData] = await Promise.all([
        fetch('/api/quotes/draft').then(r => r.json()).catch(() => ({ drafts: [] })),
        fetch('/api/quotes').then(r => r.json()).catch(() => ({ quotes: [] })),
        fetch('/api/templates').then(async r => {
          const json = await r.json()
          if (!r.ok) console.error('[templates] API error:', json)
          return json
        }).catch(e => { console.error('[templates] fetch error:', e); return { templates: [] } }),
      ])

      setDrafts(draftData.drafts ?? [])
      setTemplates(templateData.templates ?? [])

      const quoteList: QuoteItem[] = quoteData.quotes ?? []
      const selections: Record<string, string> = quoteData.selections ?? {}
      const map = new Map<string, GroupedQuote>()
      for (const q of quoteList) {
        if (!map.has(q.request_id)) {
          map.set(q.request_id, {
            request_id: q.request_id,
            quote_requests: q.quote_requests,
            quotes: [],
            selectedQuoteId: selections[q.request_id],
          })
        }
        map.get(q.request_id)!.quotes.push(q)
      }
      setGrouped([...map.values()])
      setLoading(false)
    }
    load()
  }, [])

  async function handleCopyTemplate(id: string, name: string) {
    setCopyingTemplateId(id)
    try {
      const res = await fetch(`/api/templates/${id}`)
      if (!res.ok) return
      const { template } = await res.json()
      const copyRes = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${name} (복사)`, itinerary: template.itinerary, pricing: template.pricing }),
      })
      if (!copyRes.ok) return
      const { template: copied } = await copyRes.json()
      setTemplates(prev => [copied, ...prev])
    } finally {
      setCopyingTemplateId(null)
    }
  }

  async function confirmDeleteTemplate() {
    if (!deleteTarget) return
    setDeletingTemplateId(deleteTarget.id)
    setDeleteTarget(null)
    try {
      await fetch(`/api/templates/${deleteTarget.id}`, { method: 'DELETE' })
      setTemplates(prev => prev.filter(t => t.id !== deleteTarget.id))
    } finally {
      setDeletingTemplateId(null)
    }
  }

  async function handlePreview(q: QuoteItem) {
    setPreviewLoading(true)
    setPreview({ id: q.id, url: q.file_url, name: q.file_name })
    try {
      const res = await fetch(`/api/quotes/${q.id}/preview`)
      if (res.ok) {
        const json = await res.json()
        setPreview({ id: q.id, url: q.file_url, name: q.file_name, previewHtml: json.previewHtml })
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400 text-sm">불러오는 중...</div>
  }

  return (
    <>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">템플릿 삭제</h3>
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-medium text-gray-800">&ldquo;{deleteTarget.name}&rdquo;</span> 템플릿을 삭제하시겠습니까?
            </p>
            <p className="text-xs text-gray-400 mt-1">삭제 후 복구할 수 없습니다.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                autoFocus
                onClick={confirmDeleteTemplate}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
      {preview && (
        <ExcelPreviewModal
          fileUrl={preview.url}
          fileName={preview.name}
          previewHtml={preview.previewHtml}
          onClose={() => setPreview(null)}
        />
      )}

      <div className="p-8 max-w-4xl mx-auto space-y-10">
        <BackButton href="/landco" />
        {/* 상단 액션 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">내 견적서</h1>
          <p className="text-sm text-gray-500 mt-0.5">임시저장 및 제출 완료된 견적을 관리합니다.</p>
        </div>

        {/* 템플릿 관리 섹션 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">
              템플릿 관리
              <span className="text-sm font-normal text-gray-400 ml-2">{templates.length}개</span>
            </h2>
            <button
              onClick={() => window.open('/landco/quotes/new', '_blank')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + 새 템플릿 만들기
            </button>
          </div>
          {templates.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-10 text-gray-400 text-sm">
              저장된 템플릿이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div
                  key={t.id}
                  className="group bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between cursor-pointer hover:border-blue-200 hover:shadow-md transition-all duration-150"
                  onClick={() => window.open(`/landco/quotes/new?templateId=${t.id}`, '_blank')}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(t.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleCopyTemplate(t.id, t.name)}
                      disabled={copyingTemplateId === t.id}
                      className="border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {copyingTemplateId === t.id ? '복사 중...' : '복사'}
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                      disabled={deletingTemplateId === t.id}
                      className="border border-red-300 text-red-400 rounded-lg px-3 py-1.5 text-xs font-medium hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deletingTemplateId === t.id ? '삭제 중...' : '삭제'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 작성 중 섹션 */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">
            작성 중
            <span className="text-sm font-normal text-gray-400 ml-2">{drafts.length}건</span>
          </h2>
          {drafts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-10 text-gray-400 text-sm">
              임시저장된 견적이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map(draft => {
                const req = draft.quote_requests
                const updatedAt = new Date(draft.updated_at).toLocaleString('ko-KR', {
                  month: 'numeric', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })
                return (
                  <div key={draft.request_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <StatusBadge status={req.status} />
                          <span className="text-xs text-gray-400">최근 저장: {updatedAt}</span>
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 truncate">{req.event_name}</h3>
                        <RequestMeta req={req} />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/landco/requests/${draft.request_id}`}
                          className="border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors"
                        >
                          요청 보기
                        </Link>
                        <Link
                          href={`/landco/requests/${draft.request_id}/quote/new`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors"
                        >
                          이어서 작성 ↗
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 제출 완료 섹션 */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">
            제출 완료
            <span className="text-sm font-normal text-gray-400 ml-2">{grouped.length}건</span>
          </h2>
          {grouped.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-10 text-gray-400 text-sm">
              제출한 견적서가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.filter(g => g.quote_requests).map(({ request_id, quote_requests: req, quotes, selectedQuoteId }) => {
                const isFinalized = req.status === 'finalized'
                const isSelected = isFinalized && !!selectedQuoteId
                return (
                <div
                  key={request_id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all duration-150"
                  onClick={() => router.push(`/landco/requests/${request_id}`)}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        {isFinalized
                          ? isSelected
                            ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">확정</span>
                            : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">미선택</span>
                          : <StatusBadge status={req.status} />
                        }
                        <span className="text-xs text-gray-400">{quotes.length}개 버전</span>
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 truncate">{req.event_name}</h3>
                      <RequestMeta req={req} />
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-2" onClick={e => e.stopPropagation()}>
                    {quotes.map(q => (
                      <div key={q.id} className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${selectedQuoteId === q.id ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          v{q.version}
                        </span>
                        <span className="text-sm text-gray-600 truncate min-w-0 flex-1">{q.file_name}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                          {new Date(q.submitted_at).toLocaleString('ko-KR', {
                            month: 'numeric', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handlePreview(q)}
                            disabled={previewLoading}
                            className="border border-gray-300 text-gray-600 rounded-lg px-3 py-1 text-xs font-medium bg-white hover:bg-gray-50 whitespace-nowrap disabled:opacity-50"
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
                    ))}
                  </div>
                </div>
              )})}
            </div>
          )}
        </section>

      </div>
    </>
  )
}
