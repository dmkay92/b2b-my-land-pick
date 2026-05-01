'use client'

import { useState } from 'react'
import type { DeductionClaim } from '@/lib/supabase/types'
import FileDropZone from '@/components/FileDropZone'
import { calculateRefund } from '@/lib/refund'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

interface Props {
  requestId: string
  claims: DeductionClaim[]
  onUpdated: () => void
  role: 'landco' | 'admin' | 'agency'
  paidTotal?: number
  totalCustomerPrice?: number   // 총 고객가
  landcoQuoteTotal?: number     // 랜드사 견적가
  agencyCommission?: number     // 여행사 수수료
  daysUntilDepart?: number      // 출발까지 남은 일수
}

export default function DeductionClaimSection({ requestId, claims, onUpdated, role, paidTotal, totalCustomerPrice, landcoQuoteTotal, agencyCommission, daysUntilDepart }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [items, setItems] = useState<{ name: string; amount: number }[]>([{ name: '', amount: 0 }])
  const [memo, setMemo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [approvedAmounts, setApprovedAmounts] = useState<Record<string, string>>({})

  function addItem() { setItems(prev => [...prev, { name: '', amount: 0 }]) }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: 'name' | 'amount', value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

  async function handleSubmit() {
    if (items.some(i => !i.name.trim() || !i.amount)) return
    setSubmitting(true)

    // 파일 업로드 (서버 경유)
    let receiptUrls: string[] = []
    if (files.length > 0) {
      setUploading(true)
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folder', `deductions/${requestId}`)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        if (uploadRes.ok) {
          const { path } = await uploadRes.json()
          receiptUrls.push(path)
        }
      }
      setUploading(false)
    }

    const res = await fetch('/api/deduction-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, items: items.map(i => ({ name: i.name, amount: Number(i.amount) })), memo: memo || undefined, receiptUrls }),
    })
    setSubmitting(false)
    if (res.ok) {
      setShowModal(false)
      setItems([{ name: '', amount: 0 }])
      setMemo('')
      setFiles([])
      onUpdated()
    } else {
      const json = await res.json().catch(() => ({}))
      alert(json.error || '요청에 실패했습니다.')
    }
  }

  async function handleReview(claimId: string, action: 'approve' | 'reject') {
    setReviewingId(claimId)
    const body: Record<string, unknown> = { action }
    if (action === 'approve' && approvedAmounts[claimId]) {
      body.approvedAmount = Number(approvedAmounts[claimId].replace(/[^0-9]/g, '')) || undefined
    }
    await fetch(`/api/deduction-claims/${claimId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setReviewingId(null)
    onUpdated()
  }

  // 환불 계산
  const approvedDeductions = claims
    .filter(c => c.status === 'approved')
    .reduce((sum, c) => sum + (c.approved_amount ?? c.total_amount), 0)
  const refundAmount = paidTotal ? paidTotal - approvedDeductions : null

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 h-12 bg-gradient-to-r from-red-900 to-red-800">
        <h3 className="text-sm font-bold text-white">공제 신청 (행사 취소)</h3>
        {role === 'landco' && (
          <button
            onClick={() => setShowModal(true)}
            className="text-xs font-medium text-white bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
          >
            + 공제 신청
          </button>
        )}
      </div>

      <div className="bg-white">
        {claims.length === 0 ? (
          <p className="text-xs text-gray-400 px-5 py-4">공제 신청 내역이 없습니다.</p>
        ) : (
          claims.map(c => (
            <div key={c.id} className="px-5 py-4 border-b border-gray-50 last:border-b-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">공제 신청</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    c.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                    c.status === 'rejected' ? 'bg-red-50 text-red-600' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {c.status === 'approved' ? '승인됨' : c.status === 'rejected' ? '거부됨' : '검토중'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{fmt(c.total_amount)}원</span>
                  {role === 'landco' && c.status === 'pending' && (
                    <button
                      onClick={async () => {
                        if (!confirm('이 공제 신청을 취소하시겠습니까?')) return
                        await fetch(`/api/deduction-claims/${c.id}/cancel`, { method: 'POST' })
                        onUpdated()
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium border border-red-300 text-red-500 rounded-lg hover:bg-red-50"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {c.items.map((item, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {item.name} {fmt(item.amount)}원
                  </span>
                ))}
              </div>
              {c.memo && <p className="text-xs text-gray-400 mt-1">{c.memo}</p>}
              {c.receipt_urls && c.receipt_urls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {c.receipt_urls.map((url, i) => (
                    <button
                      key={i}
                      onClick={async () => {
                        const res = await fetch(`/api/signed-url?path=${encodeURIComponent(url)}`)
                        if (res.ok) {
                          const { url: signedUrl } = await res.json()
                          window.open(signedUrl, '_blank')
                        }
                      }}
                      className="text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100"
                    >
                      첨부파일 {i + 1} ↗
                    </button>
                  ))}
                </div>
              )}
              {c.status === 'approved' && c.approved_amount != null && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">
                  승인 금액: {fmt(c.approved_amount)}원
                  {c.approved_amount !== c.total_amount && (
                    <span className="text-gray-400 ml-1">(요청 금액: {fmt(c.total_amount)}원)</span>
                  )}
                </p>
              )}

              {/* Admin review */}
              {role === 'admin' && c.status === 'pending' && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 shrink-0">승인 금액</label>
                    <div className="relative w-40">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={approvedAmounts[c.id] ?? fmt(c.total_amount)}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '')
                          setApprovedAmounts(prev => ({ ...prev, [c.id]: raw ? fmt(Number(raw)) : '' }))
                        }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right pr-6 focus:outline-none focus:border-blue-400"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={reviewingId === c.id}
                      onClick={() => handleReview(c.id, 'reject')}
                      className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      거부
                    </button>
                    <button
                      disabled={reviewingId === c.id}
                      onClick={() => handleReview(c.id, 'approve')}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      승인
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Summary */}
        {(() => {
          const hasCalcData = totalCustomerPrice && landcoQuoteTotal != null && agencyCommission != null && daysUntilDepart != null
          const calc = hasCalcData ? calculateRefund({
            totalCustomerPrice: totalCustomerPrice!,
            landcoQuoteTotal: landcoQuoteTotal!,
            agencyCommission: agencyCommission!,
            paidAmount: paidTotal ?? 0,
            daysUntilDepart: daysUntilDepart!,
            approvedDeduction: approvedDeductions,
          }) : null

          if (!calc && !claims.some(c => c.status === 'approved')) return null

          return (
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
              {role === 'landco' ? (
                <>
                  {/* 랜드사: 공제 확정 금액만 */}
                  {calc && calc.landcoBase > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">취소 수수료 (기본 보유액)</span>
                      <span className="text-xs text-gray-700">{fmt(calc.landcoBase)}원</span>
                    </div>
                  )}
                  {approvedDeductions > 0 && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
                      <span className="text-sm font-bold text-gray-900">공제 확정 금액</span>
                      <span className="text-sm font-bold text-emerald-600">{fmt(approvedDeductions)}원</span>
                    </div>
                  )}
                  {calc && approvedDeductions > calc.landcoBase && calc.landcoBase > 0 && (
                    <p className="text-[10px] text-amber-600">초과분 {fmt(calc.deductionExcess)}원은 여행사에 추가 청구됩니다.</p>
                  )}
                </>
              ) : calc?.refundRate === 1.0 ? (
                <>
                  {/* 여행사/admin: 100% 환불 (실비 공제) — 심플 UI */}
                  <div className="text-[10px] text-gray-400 mb-1">출발 7일 이전 취소: 전액 환불 (실비 공제)</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">결제완료액</span>
                    <span className="text-xs text-gray-700">{fmt(paidTotal ?? 0)}원</span>
                  </div>
                  {approvedDeductions > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">실비 공제 (승인 합계)</span>
                      <span className="text-xs text-red-600">-{fmt(approvedDeductions)}원</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="text-sm font-bold text-gray-900">{calc.customerFinalRefund >= 0 ? '고객 환불액' : '고객 추가 청구'}</span>
                    <span className={`text-sm font-bold ${calc.customerFinalRefund > 0 ? 'text-blue-600' : calc.customerFinalRefund < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {calc.customerFinalRefund < 0 ? `+${fmt(Math.abs(calc.customerFinalRefund))}원` : `${fmt(calc.customerFinalRefund)}원`}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {/* 여행사/admin: 50% 또는 0% 환불 — 상세 UI */}
                  {calc && (
                    <div className="text-[10px] text-gray-400 mb-1">{calc.policyLabel}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">결제완료액</span>
                    <span className="text-xs text-gray-700">{fmt(paidTotal ?? 0)}원</span>
                  </div>
                  {calc && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">취소 수수료 ({calc.refundRateLabel} 환불)</span>
                      <span className="text-xs text-gray-700">-{fmt(calc.cancellationFee)}원</span>
                    </div>
                  )}
                  {calc && calc.cancellationFee > 0 && (
                    <div className="bg-white rounded-lg p-2.5 mt-1 space-y-1 border border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-500">취소 수수료 배분</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-500">랜드사 ({approvedDeductions > 0 ? '공제' : '기본'})</span>
                        <span className="text-[11px] text-gray-700">{fmt(approvedDeductions > 0 ? approvedDeductions : calc.landcoBase)}원</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-500">여행사 수수료</span>
                        <span className="text-[11px] text-gray-700">{fmt(calc.agencyFinalCommission)}원</span>
                      </div>
                      {calc.agencyAdditionalCharge > 0 && (
                        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                          <span className="text-[11px] text-red-500 font-medium">여행사 추가 청구</span>
                          <span className="text-[11px] text-red-600 font-medium">+{fmt(calc.agencyAdditionalCharge)}원</span>
                        </div>
                      )}
                    </div>
                  )}
                  {calc && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="text-sm font-bold text-gray-900">{calc.customerFinalRefund >= 0 ? '고객 환불액' : '고객 추가 청구'}</span>
                      <span className={`text-sm font-bold ${calc.customerFinalRefund > 0 ? 'text-blue-600' : calc.customerFinalRefund < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {calc.customerFinalRefund < 0 ? `+${fmt(Math.abs(calc.customerFinalRefund))}원` : `${fmt(calc.customerFinalRefund)}원`}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}
      </div>

      {/* Create claim modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">공제 신청</h3>
              <p className="text-xs text-gray-500 mt-0.5">행사 취소로 인한 비용(호텔 취소 수수료 등)을 신청합니다.</p>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={item.name}
                    onChange={e => updateItem(idx, 'name', e.target.value)}
                    placeholder="항목명 (예: 호텔 취소 수수료)"
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

              <FileDropZone files={files} onChange={setFiles} required />

              <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-xs text-gray-500">합계</span>
                <span className="text-base font-bold text-gray-900">{fmt(total)}원</span>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setItems([{ name: '', amount: 0 }]); setMemo(''); setFiles([]) }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || items.some(i => !i.name.trim() || !i.amount) || total === 0 || files.length === 0}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting ? '제출 중...' : `${fmt(total)}원 공제 신청`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
