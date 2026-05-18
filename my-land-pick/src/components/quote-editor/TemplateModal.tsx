'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import type { ItineraryDay, PricingData } from '@/lib/supabase/types'

interface Template {
  id: string
  name: string
  created_at: string
}

interface Props {
  mode: 'save' | 'load'
  itinerary: ItineraryDay[]
  pricing: PricingData
  onLoad: (itinerary: ItineraryDay[], pricing: PricingData) => void
  onClose: () => void
}

export function TemplateModal({ mode, itinerary, pricing, onLoad, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadTarget, setLoadTarget] = useState<Template | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [daysMismatch, setDaysMismatch] = useState<{
    templateDays: number
    currentDays: number
    itinerary: ItineraryDay[]
    pricing: PricingData
  } | null>(null)

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(({ templates }) => setTemplates(templates ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, itinerary, pricing }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast(json.error ?? '저장에 실패했습니다.', 'error')
        return
      }
      toast('템플릿이 저장되었습니다.', 'success')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function confirmLoad(id: string) {
    const res = await fetch(`/api/templates/${id}`)
    if (!res.ok) { toast('템플릿을 불러올 수 없습니다.', 'error'); return }
    const { template } = await res.json()
    setLoadTarget(null)

    const templateDays = (template.itinerary as ItineraryDay[]).length
    const currentDays = itinerary.length
    if (templateDays !== currentDays) {
      setDaysMismatch({ templateDays, currentDays, itinerary: template.itinerary, pricing: template.pricing })
      return
    }

    onLoad(template.itinerary, template.pricing)
    onClose()
  }

  async function confirmDelete(id: string) {
    setDeletingId(id)
    setDeleteTarget(null)
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      setTemplates(prev => prev.filter(t => t.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 일정 일수 불일치 경고 모달 */}
      {daysMismatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={e => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setDaysMismatch(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">일정 일수가 다릅니다</h3>
            <p className="text-sm text-gray-500 mt-2">
              템플릿은 <span className="font-semibold text-gray-800">{daysMismatch.templateDays}일</span> 일정이지만,
              현재 견적은 <span className="font-semibold text-gray-800">{daysMismatch.currentDays}일</span> 일정입니다.
            </p>
            <p className="text-xs text-gray-400 mt-1.5">그래도 불러오면 일정 행이 맞지 않을 수 있습니다.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setDaysMismatch(null)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                autoFocus
                onClick={() => { onLoad(daysMismatch.itinerary, daysMismatch.pricing); setDaysMismatch(null); onClose() }}
                className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                그래도 불러오기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 불러오기 확인 모달 */}
      {loadTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={e => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setLoadTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">템플릿 불러오기</h3>
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-medium text-gray-800">&ldquo;{loadTarget.name}&rdquo;</span> 템플릿을 불러올까요?
            </p>
            <p className="text-xs text-gray-400 mt-1">현재 작성 중인 내용이 대체됩니다.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setLoadTarget(null)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">취소</button>
              <button autoFocus onClick={() => confirmLoad(loadTarget.id)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">불러오기</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={e => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">템플릿 삭제</h3>
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-medium text-gray-800">&ldquo;{deleteTarget.name}&rdquo;</span> 템플릿을 삭제하시겠습니까?
            </p>
            <p className="text-xs text-gray-400 mt-1">삭제 후 복구할 수 없습니다.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">취소</button>
              <button autoFocus onClick={() => confirmDelete(deleteTarget.id)} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}
      <div
        className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {mode === 'save' ? '템플릿으로 저장' : '템플릿 불러오기'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 저장 모드: 이름 입력 */}
          {mode === 'save' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">템플릿 이름</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                placeholder="예: 베트남 5박 6일 기본형"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          )}

          {/* 기존 템플릿 목록 */}
          <div>
            {mode === 'load' && (
              <p className="text-xs text-gray-400 mb-2">저장된 템플릿 {templates.length}개</p>
            )}
            {mode === 'save' && templates.length > 0 && (
              <p className="text-xs text-gray-400 mb-2">기존 템플릿</p>
            )}

            {loading ? (
              <p className="text-sm text-gray-400 text-center py-6">불러오는 중...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">저장된 템플릿이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                      mode === 'load'
                        ? 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                    onClick={() => mode === 'load' && setLoadTarget(t)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(t.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(t) }}
                      disabled={deletingId === t.id}
                      className="ml-3 text-gray-300 hover:text-red-400 transition-colors shrink-0 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 저장 버튼 */}
        {mode === 'save' && (
          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '템플릿 저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
