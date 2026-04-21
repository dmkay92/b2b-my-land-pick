'use client'

import { useRef, useState, useEffect } from 'react'
import type { QuoteRequest, PricingData, PricingRow } from '@/lib/supabase/types'

interface DragState {
  cat: string
  fromIndex: number
  toIndex: number
}

interface Props {
  request: QuoteRequest
  pricing: PricingData
  onChange: (pricing: PricingData) => void
  pricingMode: 'detailed' | 'summary'
  onPricingModeChange: (mode: 'detailed' | 'summary') => void
  summaryTotal: number
  summaryPerPerson: number
  onSummaryTotalChange: (total: number) => void
  onSummaryPerPersonChange: (perPerson: number) => void
}

type PricingCategory = Exclude<keyof PricingData, 'currencies' | 'exchangeRates'>

const CATEGORIES: PricingCategory[] = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타']

const DETAIL_PLACEHOLDER: Record<PricingCategory, string> = {
  호텔: '호텔명 / 객실 타입',
  차량: '차종 / 구간',
  식사: '식당명 / 메뉴',
  입장료: '관광지명',
  가이드비용: '가이드 인건비',
  기타: '항목명',
}
const FIELDS = ['date', 'detail', 'price', 'count', 'quantity'] as const

const CURRENCIES = [
  { code: 'KRW', symbol: '₩' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CNY', symbol: '¥' },
  { code: 'VND', symbol: '₫' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
]


function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code
}

function emptyRow(): PricingRow {
  return { date: '', detail: '', price: 0, count: 1, quantity: 1, currency: 'KRW' }
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

export function PricingEditor({ request, pricing, onChange, pricingMode, onPricingModeChange, summaryTotal, summaryPerPerson, onSummaryTotalChange, onSummaryPerPersonChange }: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [openCurrencyMenu, setOpenCurrencyMenu] = useState<string | null>(null)
  const [exchangeRateInputs, setExchangeRateInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!openCurrencyMenu) return
    function handleClick(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-currency-menu]')) {
        setOpenCurrencyMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openCurrencyMenu])
  const totalPeople = request.adults + request.children + request.infants + request.leaders

  function updateCategory(cat: PricingCategory, rows: PricingRow[]) {
    onChange({ ...pricing, [cat]: rows })
  }

  function addRow(cat: PricingCategory) {
    const newIndex = pricing[cat].length
    updateCategory(cat, [...pricing[cat], emptyRow()])
    requestAnimationFrame(() => {
      ;(document.querySelector(`[data-pcell="${cat}-${newIndex}-date"]`) as HTMLInputElement)?.focus()
    })
  }

  function updateRow(cat: PricingCategory, index: number, field: keyof PricingRow, value: string | number) {
    const rows = pricing[cat].map((r, i) => i === index ? { ...r, [field]: value } : r)
    updateCategory(cat, rows)
  }

  function deleteRow(cat: PricingCategory, index: number) {
    updateCategory(cat, pricing[cat].filter((_, i) => i !== index))
  }

  function getExchangeRate(cur: string): number {
    return pricing.exchangeRates?.[cur] ?? 0
  }

  function setExchangeRate(cur: string, rate: number) {
    onChange({ ...pricing, exchangeRates: { ...pricing.exchangeRates, [cur]: rate } })
  }

  function reorderRow(cat: PricingCategory, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const rows = [...pricing[cat]]
    const [moved] = rows.splice(fromIndex, 1)
    rows.splice(toIndex, 0, moved)
    updateCategory(cat, rows)
  }

  function handleArrowNav(e: React.KeyboardEvent, cat: PricingCategory, rowIndex: number, field: string) {
    const input = e.target as HTMLInputElement
    const rows = pricing[cat]
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      ;(document.querySelector(`[data-pcell="${cat}-${rowIndex + 1}-${field}"]`) as HTMLInputElement)?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      ;(document.querySelector(`[data-pcell="${cat}-${rowIndex - 1}-${field}"]`) as HTMLInputElement)?.focus()
    } else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) {
      const nextField = FIELDS[FIELDS.indexOf(field as typeof FIELDS[number]) + 1]
      if (nextField) {
        e.preventDefault()
        ;(document.querySelector(`[data-pcell="${cat}-${rowIndex}-${nextField}"]`) as HTMLInputElement)?.focus()
      }
    } else if (e.key === 'ArrowLeft' && input.selectionStart === 0) {
      const prevField = FIELDS[FIELDS.indexOf(field as typeof FIELDS[number]) - 1]
      if (prevField) {
        e.preventDefault()
        const target = document.querySelector(`[data-pcell="${cat}-${rowIndex}-${prevField}"]`) as HTMLInputElement
        if (target) { target.focus(); target.setSelectionRange(target.value.length, target.value.length) }
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent, cat: PricingCategory, startIndex: number, fieldName: string) {
    const text = e.clipboardData.getData('text')

    // 단일 값 붙여넣기: 숫자 필드는 값을 완전히 대체
    if (!text.includes('\t') && !text.includes('\n')) {
      const numericFields = ['price', 'count', 'quantity']
      if (numericFields.includes(fieldName)) {
        const raw = text.trim().replace(/,/g, '')
        if (/^\d+$/.test(raw)) {
          e.preventDefault()
          updateRow(cat, startIndex, fieldName as keyof PricingRow, Number(raw))
        }
      }
      return
    }

    e.preventDefault()
    const startFieldIndex = FIELDS.indexOf(fieldName as typeof FIELDS[number])
    const pastedRows = text.split('\n').map(r => r.replace(/\r$/, '')).filter(r => r.length > 0)
    const rows = [...pricing[cat]]

    pastedRows.forEach((rowText, ri) => {
      const cells = rowText.split('\t')
      const targetIndex = startIndex + ri
      if (targetIndex >= rows.length) rows.push(emptyRow())
      cells.forEach((cell, ci) => {
        const fieldIndex = startFieldIndex + ci
        if (fieldIndex < FIELDS.length) {
          const field = FIELDS[fieldIndex]
          const val = field === 'date' || field === 'detail' ? cell.trim() : Number(cell.trim().replace(/,/g, '')) || 0
          rows[targetIndex] = { ...rows[targetIndex], [field]: val }
        }
      })
    })

    updateCategory(cat, rows)
  }

  const total = grandTotal(pricing)
  const perPerson = totalPeople > 0 ? total / totalPeople : 0

  // 통화별 합계
  const totalsByCurrency = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    pricing[cat].forEach(row => {
      const cur = row.currency ?? 'KRW'
      acc[cur] = (acc[cur] ?? 0) + rowTotal(row)
    })
    return acc
  }, {})
  const currencyList = Object.entries(totalsByCurrency).filter(([, v]) => v > 0)
  const isAllKrw = currencyList.length <= 1 && (currencyList[0]?.[0] ?? 'KRW') === 'KRW'
  const isSingleCurrency = isAllKrw
  const singleCurrency = isAllKrw ? 'KRW' : null

  return (
    <div className="pb-24">

      {pricingMode === 'summary' ? (() => {
        const summaryCurrency = pricing.currencies?.['summary'] ?? 'KRW'
        const summaryExRate = pricing.exchangeRates?.[summaryCurrency] ?? 0
        const isKrw = summaryCurrency === 'KRW'
        const krwTotal = isKrw ? summaryTotal : (summaryExRate > 0 ? Math.round(summaryTotal * summaryExRate) : 0)
        const krwPerPerson = totalPeople > 0 && krwTotal > 0 ? Math.round(krwTotal / totalPeople) : 0
        const curSymbol = getCurrencySymbol(summaryCurrency)

        const setSummaryCurrency = (code: string) => {
          onChange({ ...pricing, currencies: { ...pricing.currencies, summary: code } })
        }
        const setSummaryExRate = (rate: number) => {
          onChange({ ...pricing, exchangeRates: { ...pricing.exchangeRates, [summaryCurrency]: rate } })
        }

        return (
        <div className="bg-white border border-gray-900 rounded-lg p-8">
          <div className="max-w-md mx-auto space-y-5">
            <p className="text-sm text-gray-500 text-center mb-6">세부 항목 없이 견적 총액만 제출합니다.<br /><span className="text-xs text-gray-400">여행사에는 &apos;상세 견적 미포함&apos;으로 표시됩니다.</span></p>

            {/* 통화 선택 */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">통화</label>
              <div className="flex gap-1.5">
                {CURRENCIES.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setSummaryCurrency(c.code)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      summaryCurrency === c.code
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">총 합계</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={summaryTotal ? summaryTotal.toLocaleString('ko-KR') : ''}
                  onChange={e => {
                    const v = Number(e.target.value.replace(/,/g, '')) || 0
                    onSummaryTotalChange(v)
                    if (totalPeople > 0) onSummaryPerPersonChange(Math.round(v / totalPeople))
                  }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg text-right pr-14 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">{curSymbol}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">1인당 금액</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={summaryPerPerson ? summaryPerPerson.toLocaleString('ko-KR') : ''}
                  onChange={e => {
                    const v = Number(e.target.value.replace(/,/g, '')) || 0
                    onSummaryPerPersonChange(v)
                    if (totalPeople > 0) onSummaryTotalChange(v * totalPeople)
                  }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg text-right pr-14 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">{curSymbol}</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">총 {totalPeople}명 기준 · 총 합계와 자동 연동</p>
            </div>

            {/* 환율 입력 (외화일 때) */}
            {!isKrw && (
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">환율 ({summaryCurrency} → KRW)</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={summaryExRate || ''}
                      onChange={e => setSummaryExRate(Number(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-right pr-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">KRW/{summaryCurrency}</span>
                  </div>
                </div>
                {summaryExRate > 0 && summaryTotal > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">KRW 환산 총액</span>
                      <span className="font-bold text-gray-900">{krwTotal.toLocaleString('ko-KR')}원</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">KRW 환산 1인당</span>
                      <span className="font-bold text-blue-600">{krwPerPerson.toLocaleString('ko-KR')}원</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )
      })()
      ) : (
      <>
      <div className="border border-gray-900 divide-y divide-gray-900">
      {CATEGORIES.map(cat => {
        const rows = pricing[cat]
        const catTotal = categoryTotal(rows)

        return (
          <div key={cat} className="bg-white flex">
              {/* 왼쪽: 카테고리명 + 벌크 통화 */}
              <div className="w-28 flex-shrink-0 flex flex-col items-center justify-center bg-white border-r border-gray-900 py-4 px-2 gap-3">
                <span className="text-xs font-bold text-gray-900">{cat}</span>
                <div className="relative w-[64px]" data-currency-menu>
                  <button
                    onClick={() => setOpenCurrencyMenu(openCurrencyMenu === `${cat}-bulk` ? null : `${cat}-bulk`)}
                    className="w-full flex items-center justify-between text-[11px] font-medium text-gray-700 bg-white border border-gray-200 rounded-md pl-2 pr-1.5 py-1 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <span>{[...new Set(rows.map(r => r.currency ?? 'KRW'))].length === 1 ? (rows[0]?.currency ?? 'KRW') : '—'}</span>
                    <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openCurrencyMenu === `${cat}-bulk` && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[72px]">
                      {CURRENCIES.map(c => (
                        <button
                          key={c.code}
                          onClick={() => { updateCategory(cat, rows.map(r => ({ ...r, currency: c.code }))); setOpenCurrencyMenu(null) }}
                          className="w-full text-left px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 오른쪽: 테이블 */}
              <div className="flex-1 min-w-0">
                {/* 컬럼 헤더 */}
                <div className="flex items-center border-b border-gray-800 bg-gray-900">
                  <div className="w-10 flex-shrink-0" />
                  <div className="w-32 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">날짜</div>
                  <div className="flex-1 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">내역</div>
                  <div className="w-20 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700 text-center">통화</div>
                  <div className="w-32 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700 text-right">가격</div>
                  <div className="w-20 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700 text-right">횟수/박수</div>
                  <div className="w-20 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700 text-right">인원/수량</div>
                  <div className="w-40 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700 text-right">합계</div>
                  <div className="w-10 flex-shrink-0 border-l border-gray-700" />
                </div>

                {/* 행들 */}
                {rows.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400">
                    + 행 추가 버튼을 눌러 항목을 입력하세요.
                  </div>
                ) : (
                  rows.map((row, index) => {
                    const isDraggingThis = dragState?.cat === cat && dragState.fromIndex === index
                    const ds = dragState
                    const isTarget = ds?.cat === cat && ds.toIndex === index && ds.fromIndex !== index
                    const showAbove = isTarget && ds!.fromIndex > index
                    const showBelow = isTarget && ds!.fromIndex < index
                    return (
                    <div key={index}>
                      {showAbove && <div className="h-0.5 bg-blue-400 mx-2" />}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault()
                          const ds = dragStateRef.current
                          if (ds?.cat === cat && ds.toIndex !== index) {
                            const next = { ...ds, toIndex: index }
                            dragStateRef.current = next
                            setDragState(next)
                          }
                        }}
                        onDrop={() => {
                          const ds = dragStateRef.current
                          if (ds?.cat === cat) reorderRow(cat, ds.fromIndex, ds.toIndex)
                          dragStateRef.current = null
                          setDragState(null)
                        }}
                        className={`flex items-center border-b border-gray-100 group ${isDraggingThis ? 'opacity-30' : 'hover:bg-blue-50/30'}`}
                      >
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', String(index))
                            const next = { cat, fromIndex: index, toIndex: index }
                            dragStateRef.current = next
                            setDragState(next)
                          }}
                          onDragEnd={() => { dragStateRef.current = null; setDragState(null) }}
                          className="w-10 flex-shrink-0 cursor-grab text-gray-300 hover:text-gray-500 flex items-center justify-center select-none text-base self-stretch"
                          title="드래그하여 순서 변경"
                        >
                          ⠿
                        </div>
                      <div className="w-32 flex-shrink-0 border-l border-gray-200 self-stretch">
                        <input
                          data-pcell={`${cat}-${index}-date`}
                          type="text"
                          value={row.date}
                          onChange={e => updateRow(cat, index, 'date', e.target.value)}
                          onKeyDown={e => handleArrowNav(e, cat, index, 'date')}
                          onPaste={e => handlePaste(e, cat, index, 'date')}
                          className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent placeholder:text-gray-300"
                          placeholder="날짜"
                        />
                      </div>
                      <div className="flex-1 border-l border-gray-200 self-stretch">
                        <input
                          data-pcell={`${cat}-${index}-detail`}
                          type="text"
                          value={row.detail}
                          onChange={e => updateRow(cat, index, 'detail', e.target.value)}
                          onKeyDown={e => handleArrowNav(e, cat, index, 'detail')}
                          onPaste={e => handlePaste(e, cat, index, 'detail')}
                          className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent placeholder:text-gray-300"
                          placeholder={DETAIL_PLACEHOLDER[cat]}
                        />
                      </div>
                      {/* 통화 드롭다운 */}
                      <div className="w-20 flex-shrink-0 border-l border-gray-200 self-stretch relative flex items-center justify-center" data-currency-menu>
                        <button
                          onClick={() => setOpenCurrencyMenu(openCurrencyMenu === `${cat}-${index}` ? null : `${cat}-${index}`)}
                          className="w-full h-full flex items-center justify-center text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors gap-0.5"
                        >
                          <span>{row.currency ?? 'KRW'}</span>
                          <svg className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openCurrencyMenu === `${cat}-${index}` && (
                          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[72px]">
                            {CURRENCIES.map(c => {
                              const isSelected = (row.currency ?? 'KRW') === c.code
                              return (
                                <button
                                  key={c.code}
                                  onClick={() => { updateRow(cat, index, 'currency', c.code); setOpenCurrencyMenu(null) }}
                                  className={`w-full text-left px-3 py-1.5 text-[12px] font-medium transition-colors flex items-center gap-2 ${
                                    isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {isSelected && <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                  {!isSelected && <span className="w-3" />}
                                  {c.code}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <div className="w-32 flex-shrink-0 border-l border-gray-200 self-stretch">
                        <input
                          data-pcell={`${cat}-${index}-price`}
                          type="text"
                          inputMode="numeric"
                          value={row.price ? row.price.toLocaleString('ko-KR') : ''}
                          onChange={e => {
                            const raw = e.target.value.replace(/,/g, '')
                            if (raw === '' || /^\d+$/.test(raw)) updateRow(cat, index, 'price', raw === '' ? 0 : Number(raw))
                          }}
                          onKeyDown={e => handleArrowNav(e, cat, index, 'price')}
                          onPaste={e => handlePaste(e, cat, index, 'price')}
                          className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent text-right placeholder:text-gray-300"
                          placeholder="0"
                        />
                      </div>
                      <div className="w-20 flex-shrink-0 border-l border-gray-200 self-stretch">
                        <input
                          data-pcell={`${cat}-${index}-count`}
                          type="text"
                          inputMode="numeric"
                          value={row.count ? row.count.toLocaleString('ko-KR') : ''}
                          onChange={e => {
                            const raw = e.target.value.replace(/,/g, '')
                            if (raw === '' || /^\d+$/.test(raw)) updateRow(cat, index, 'count', raw === '' ? 0 : Number(raw))
                          }}
                          onKeyDown={e => handleArrowNav(e, cat, index, 'count')}
                          onPaste={e => handlePaste(e, cat, index, 'count')}
                          className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent text-right placeholder:text-gray-300"
                          placeholder="1"
                        />
                      </div>
                      <div className="w-20 flex-shrink-0 border-l border-gray-200 self-stretch">
                        <input
                          data-pcell={`${cat}-${index}-quantity`}
                          type="text"
                          inputMode="numeric"
                          value={row.quantity ? row.quantity.toLocaleString('ko-KR') : ''}
                          onChange={e => {
                            const raw = e.target.value.replace(/,/g, '')
                            if (raw === '' || /^\d+$/.test(raw)) updateRow(cat, index, 'quantity', raw === '' ? 0 : Number(raw))
                          }}
                          onKeyDown={e => handleArrowNav(e, cat, index, 'quantity')}
                          onPaste={e => handlePaste(e, cat, index, 'quantity')}
                          className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent text-right placeholder:text-gray-300"
                          placeholder="1"
                        />
                      </div>
                      <div className="w-40 flex-shrink-0 border-l border-gray-200 self-stretch flex items-center justify-end px-2 text-sm font-medium text-gray-800 whitespace-nowrap">
                        <span className="text-xs text-gray-400 mr-1">{row.currency ?? 'KRW'}</span>{rowTotal(row).toLocaleString('ko-KR')}
                      </div>
                      <div className="w-10 flex-shrink-0 flex items-center justify-center border-l border-gray-200 self-stretch opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => deleteRow(cat, index)}
                          className="w-full h-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-lg leading-none font-medium"
                          title="행 삭제"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                      {showBelow && <div className="h-0.5 bg-blue-400 mx-2" />}
                    </div>
                    )
                  })
                )}
                {/* 인라인 행 추가 */}
                <button
                  onClick={() => addRow(cat)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 transition-colors border-t border-dashed border-gray-200 group"
                >
                  <span className="text-base leading-none group-hover:text-blue-500">+</span>
                  <span>행 추가</span>
                </button>
                {/* 소계 고정 행 */}
                <div className="pl-4 pr-12 py-3 bg-blue-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-900">소계</span>
                  <span className="text-sm font-bold text-gray-800 whitespace-nowrap">
                    {(() => {
                      const currencies = [...new Set(rows.map(r => r.currency ?? 'KRW'))]
                      const label = currencies.length === 1 ? currencies[0] : null
                      return <>{label && <span className="text-xs font-normal text-gray-400 mr-1">{label}</span>}{catTotal.toLocaleString('ko-KR')}</>
                    })()}
                  </span>
                </div>
              </div>
          </div>
        )
      })}
      </div>

      {/* 하단 합계 */}
      <div className="bg-white border border-gray-900 mt-4 flex">
        <div className="w-28 flex-shrink-0 flex items-center justify-center bg-white border-r border-gray-900 py-4 px-2">
          <span className="text-xs font-bold text-gray-900">합계</span>
        </div>
        <div className="flex-1 p-5 pr-10">
        <div className="flex flex-col gap-2 items-end">
          {isSingleCurrency ? (
            <>
              <div className="flex items-center gap-6">
                <span className="text-sm text-gray-500">총 합계</span>
                <span className="text-lg font-bold text-gray-900">
                  <span className="text-sm font-normal text-gray-400 mr-1">{singleCurrency}</span>
                  {total.toLocaleString('ko-KR')}
                </span>
              </div>
              {singleCurrency === 'KRW' && (
                <div className="flex items-center gap-6">
                  <span className="text-sm text-gray-500">
                    1인당 금액
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {totalPeople > 0 ? (<><span className="text-sm font-normal text-blue-400 mr-1">KRW</span>{Math.ceil(perPerson).toLocaleString('ko-KR')}</>) : '—'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* 통화별 소계 + 환율 입력 */}
              <div className="w-full border border-gray-200 rounded-lg overflow-hidden mb-2">
                <div className="flex items-center bg-gray-900 px-4 py-1.5">
                  <span className="text-xs font-medium text-white flex-1">통화</span>
                  <span className="text-xs font-medium text-white w-36 text-right">소계</span>
                  <span className="text-xs font-medium text-white w-48 text-right">환율 (→ KRW)</span>
                  <span className="text-xs font-medium text-white w-36 text-right">KRW 환산</span>
                </div>
                {currencyList.map(([cur, amt]) => {
                  const isKRW = cur === 'KRW'
                  const rate = getExchangeRate(cur)
                  const converted = isKRW ? amt : (rate > 0 ? amt * rate : null)
                  return (
                    <div key={cur} className="flex items-center px-4 py-2.5 border-t border-gray-100">
                      <span className="text-sm font-medium text-gray-700 flex-1">{cur}</span>
                      <span className="text-sm font-medium text-gray-800 w-36 text-right">
                        <span className="text-xs font-normal text-gray-400 mr-1">{cur}</span>{amt.toLocaleString('ko-KR')}
                      </span>
                      <div className="w-48 flex items-center justify-end gap-1.5">
                        {isKRW ? (
                          <span className="text-xs text-gray-400">기준 통화</span>
                        ) : (
                          <>
                            <span className="text-xs text-gray-400">1 {cur} =</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={exchangeRateInputs[cur] ?? (rate ? rate.toString() : '')}
                              onChange={e => {
                                const raw = e.target.value
                                if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                                  setExchangeRateInputs(prev => ({ ...prev, [cur]: raw }))
                                  const num = parseFloat(raw)
                                  setExchangeRate(cur, isNaN(num) ? 0 : num)
                                }
                              }}
                              onBlur={e => {
                                const raw = e.target.value
                                const num = parseFloat(raw)
                                const normalized = isNaN(num) ? '' : num.toString()
                                setExchangeRateInputs(prev => ({ ...prev, [cur]: normalized }))
                              }}
                              className="w-16 text-sm text-right border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-300"
                              placeholder="0"
                            />
                            <span className="text-xs text-gray-400">KRW</span>
                          </>
                        )}
                      </div>
                      <span className={`text-sm font-medium w-36 text-right ${converted !== null ? 'text-gray-800' : 'text-gray-300'}`}>
                        {converted !== null ? <><span className="text-xs font-normal text-gray-400 mr-1">KRW</span>{converted.toLocaleString('ko-KR')}</> : '환율 미입력'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* KRW 최종 합계 */}
              {(() => {
                const krwTotal = currencyList.reduce((sum, [cur, amt]) => {
                  if (cur === 'KRW') return sum + amt
                  const rate = getExchangeRate(cur)
                  return rate > 0 ? sum + amt * rate : sum
                }, 0)
                const allRatesEntered = currencyList.every(([cur]) => cur === 'KRW' || getExchangeRate(cur) > 0)
                return (
                  <>
                    <div className="flex items-center gap-6">
                      <span className="text-sm text-gray-500">
                        총 합계 {!allRatesEntered && <span className="text-xs text-amber-500">(환율 미입력 항목 제외)</span>}
                      </span>
                      <span className="text-lg font-bold text-gray-900"><span className="text-sm font-normal text-gray-400 mr-1">KRW</span>{krwTotal.toLocaleString('ko-KR')}</span>
                    </div>
                    {totalPeople > 0 && (
                      <div className="flex items-center gap-6">
                        <span className="text-sm text-gray-500">
                          1인당 금액
                        </span>
                        <span className="text-lg font-bold text-blue-600">
                          <span className="text-sm font-normal text-blue-400 mr-1">KRW</span>{Math.ceil(krwTotal / totalPeople).toLocaleString('ko-KR')}
                        </span>
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}
        </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
