'use client'

import type { QuoteRequest, PricingData, PricingRow } from '@/lib/supabase/types'

interface Props {
  request: QuoteRequest
  pricing: PricingData
  onChange: (pricing: PricingData) => void
}

type PricingCategory = keyof PricingData

const CATEGORIES: PricingCategory[] = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타']

function emptyRow(): PricingRow {
  return { date: '', detail: '', price: 0, count: 1, quantity: 1 }
}

function rowTotal(row: PricingRow): number {
  return row.price * row.count * row.quantity
}

function categoryTotal(rows: PricingRow[]): number {
  return rows.reduce((sum, r) => sum + rowTotal(r), 0)
}

function grandTotal(pricing: PricingData): number {
  return CATEGORIES.reduce((sum, cat) => sum + categoryTotal(pricing[cat]), 0)
}

export function PricingEditor({ request, pricing, onChange }: Props) {
  const totalPeople = request.adults + request.children + request.infants + request.leaders

  function updateCategory(cat: PricingCategory, rows: PricingRow[]) {
    onChange({ ...pricing, [cat]: rows })
  }

  function addRow(cat: PricingCategory) {
    updateCategory(cat, [...pricing[cat], emptyRow()])
  }

  function updateRow(cat: PricingCategory, index: number, field: keyof PricingRow, value: string | number) {
    const rows = pricing[cat].map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    )
    updateCategory(cat, rows)
  }

  function deleteRow(cat: PricingCategory, index: number) {
    updateCategory(cat, pricing[cat].filter((_, i) => i !== index))
  }

  const total = grandTotal(pricing)
  const perPerson = totalPeople > 0 ? total / totalPeople : 0

  return (
    <div className="space-y-6">
      {CATEGORIES.map(cat => {
        const rows = pricing[cat]
        const catTotal = categoryTotal(rows)

        return (
          <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* 카테고리 헤더 */}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-800 text-sm">{cat}</span>
                {catTotal > 0 && (
                  <span className="text-xs text-gray-500">
                    {catTotal.toLocaleString('ko-KR')}원
                  </span>
                )}
              </div>
              <button
                onClick={() => addRow(cat)}
                className="text-xs text-blue-600 font-medium hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors"
              >
                + 행 추가
              </button>
            </div>

            {/* 테이블 */}
            {rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-28">날짜</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">세부내역</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-28">가격(원)</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-16">횟수</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-20">인원/수량</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-28">합계</th>
                      <th className="w-8 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.date}
                            onChange={e => updateRow(cat, index, 'date', e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="YYYY-MM-DD"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.detail}
                            onChange={e => updateRow(cat, index, 'detail', e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="세부 내역"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={row.price || ''}
                            onChange={e => updateRow(cat, index, 'price', Number(e.target.value))}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
                            placeholder="0"
                            min="0"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={row.count || ''}
                            onChange={e => updateRow(cat, index, 'count', Number(e.target.value))}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
                            placeholder="1"
                            min="0"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={row.quantity || ''}
                            onChange={e => updateRow(cat, index, 'quantity', Number(e.target.value))}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
                            placeholder="1"
                            min="0"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-800 whitespace-nowrap">
                          {rowTotal(row).toLocaleString('ko-KR')}원
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => deleteRow(cat, index)}
                            className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none"
                            title="행 삭제"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-3 text-xs text-gray-400">
                + 행 추가 버튼을 눌러 항목을 입력하세요.
              </div>
            )}
          </div>
        )
      })}

      {/* 하단 합계 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-6">
            <span className="text-sm text-gray-500">총 합계</span>
            <span className="text-lg font-bold text-gray-900">
              {total.toLocaleString('ko-KR')}원
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-sm text-gray-500">
              1인당 <span className="text-xs text-gray-400">(총 {totalPeople}명)</span>
            </span>
            <span className="text-lg font-bold text-blue-600">
              {totalPeople > 0 ? Math.ceil(perPerson).toLocaleString('ko-KR') : '—'}원
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
