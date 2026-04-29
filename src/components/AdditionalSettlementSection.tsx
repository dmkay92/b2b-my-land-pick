'use client'

import { useState } from 'react'
import type { AdditionalSettlement } from '@/lib/supabase/types'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

interface Props {
  requestId: string
  settlements: AdditionalSettlement[]
  onCreated: () => void
  role: 'landco' | 'agency'
}

export default function AdditionalSettlementSection({ requestId, settlements, onCreated, role }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [items, setItems] = useState<{ name: string; amount: number }[]>([{ name: '', amount: 0 }])
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  function addItem() { setItems(prev => [...prev, { name: '', amount: 0 }]) }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: 'name' | 'amount', value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

  async function handleSubmit() {
    if (items.some(i => !i.name.trim() || !i.amount)) return
    setSubmitting(true)
    const res = await fetch('/api/additional-settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, items: items.map(i => ({ name: i.name, amount: Number(i.amount) })), memo: memo || undefined }),
    })
    setSubmitting(false)
    if (res.ok) {
      setShowModal(false)
      setItems([{ name: '', amount: 0 }])
      setMemo('')
      onCreated()
    } else {
      const json = await res.json().catch(() => ({}))
      alert(json.error || '요청에 실패했습니다.')
    }
  }

  async function handleReview(settlementId: string, action: 'approve' | 'reject') {
    setReviewingId(settlementId)
    await fetch(`/api/additional-settlements/${settlementId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setReviewingId(null)
    onCreated()
  }

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-gray-900 to-gray-800">
        <h3 className="text-sm font-bold text-white">추가 정산</h3>
        {role === 'landco' && (
          <button
            onClick={() => setShowModal(true)}
            className="text-xs font-medium text-white bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
          >
            + 요청하기
          </button>
        )}
      </div>

      <div className="bg-white">
        {settlements.length === 0 ? (
          <p className="text-xs text-gray-400 px-5 py-4">추가 정산 내역이 없습니다.</p>
        ) : (
          settlements.map(s => (
            <div key={s.id} className="px-5 py-4 border-b border-gray-50 last:border-b-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">추가 정산 #{s.sequence_number}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    s.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                    s.status === 'rejected' ? 'bg-red-50 text-red-600' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {s.status === 'approved' ? '승인됨' : s.status === 'rejected' ? '거부됨' : '검토중'}
                  </span>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmt(s.total_amount)}원</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {s.items.map((item, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {item.name} {fmt(item.amount)}원
                  </span>
                ))}
              </div>
              {s.memo && <p className="text-xs text-gray-400 mt-1">{s.memo}</p>}

              {role === 'agency' && s.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    disabled={reviewingId === s.id}
                    onClick={() => handleReview(s.id, 'reject')}
                    className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    거부
                  </button>
                  <button
                    disabled={reviewingId === s.id}
                    onClick={() => handleReview(s.id, 'approve')}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    승인
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">추가 정산 요청</h3>
              <p className="text-xs text-gray-500 mt-0.5">여행 중 발생한 추가 비용을 요청합니다.</p>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={item.name}
                    onChange={e => updateItem(idx, 'name', e.target.value)}
                    placeholder="항목명"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <div className="relative w-36">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.amount ? fmt(item.amount) : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        updateItem(idx, 'amount', Number(raw) || 0)
                      }}
                      placeholder="금액"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right pr-6 focus:outline-none focus:border-blue-400"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-400 text-lg">-</button>
                  )}
                </div>
              ))}

              <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ 항목 추가</button>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">메모 (선택)</label>
                <textarea
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  placeholder="추가 설명이 있으면 입력해주세요"
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-xs text-gray-500">합계</span>
                <span className="text-base font-bold text-gray-900">{fmt(total)}원</span>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setItems([{ name: '', amount: 0 }]); setMemo('') }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || items.some(i => !i.name.trim() || !i.amount) || total === 0}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting ? '제출 중...' : `${fmt(total)}원 요청`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
