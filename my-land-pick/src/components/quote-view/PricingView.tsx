'use client'

import { Fragment } from 'react'
import type { PricingData, PricingRow } from '@/lib/supabase/types'

interface Props {
  pricing: PricingData
  totalPeople: number
}

const CATEGORIES = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const

function rowTotal(row: PricingRow): number {
  return row.price * row.count * row.quantity
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function PricingView({ pricing, totalPeople }: Props) {
  let grandTotal = 0
  const exchangeRates = pricing.exchangeRates ?? {}

  // 통화별 합계 수집
  const currencyTotals: Record<string, number> = {}
  for (const cat of CATEGORIES) {
    for (const r of pricing[cat]) {
      const cur = r.currency ?? 'KRW'
      const rt = rowTotal(r)
      currencyTotals[cur] = (currencyTotals[cur] ?? 0) + rt
      grandTotal += rt
    }
  }

  const currencies = Object.entries(currencyTotals).filter(([, v]) => v > 0)
  const hasNonKrw = currencies.some(([c]) => c !== 'KRW')

  // KRW 환산 총액
  let krwGrandTotal = 0
  if (hasNonKrw) {
    for (const [cur, amt] of currencies) {
      if (cur === 'KRW') krwGrandTotal += amt
      else {
        const rate = exchangeRates[cur] ?? 0
        krwGrandTotal += rate > 0 ? Math.round(amt * rate) : 0
      }
    }
  }

  return (
    <div className="overflow-x-auto space-y-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-900 text-white">
            <th className="border border-gray-300 px-3 py-2 w-24">항목</th>
            <th className="border border-gray-300 px-3 py-2 w-20">날짜</th>
            <th className="border border-gray-300 px-3 py-2">내역</th>
            <th className="border border-gray-300 px-3 py-2 w-16">통화</th>
            <th className="border border-gray-300 px-3 py-2 w-24 text-right">가격</th>
            <th className="border border-gray-300 px-3 py-2 w-16 text-right">횟수</th>
            <th className="border border-gray-300 px-3 py-2 w-16 text-right">수량</th>
            <th className="border border-gray-300 px-3 py-2 w-28 text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(cat => {
            const rows = pricing[cat]
            if (rows.length === 0) return null
            const catTotal = rows.reduce((sum, r) => sum + rowTotal(r), 0)
            const catCurrencies = [...new Set(rows.map(r => r.currency ?? 'KRW'))]
            const catCurrency = catCurrencies.length === 1 ? catCurrencies[0] : null

            return (
              <Fragment key={cat}>
                {rows.map((row, idx) => (
                  <tr key={`${cat}-${idx}`} className="border-b border-gray-200">
                    {idx === 0 && (
                      <td className="border border-gray-300 px-3 py-2 font-medium bg-gray-50" rowSpan={rows.length}>
                        {cat}
                      </td>
                    )}
                    <td className="border border-gray-300 px-3 py-2">{row.date}</td>
                    <td className="border border-gray-300 px-3 py-2">{row.detail}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">{row.currency ?? 'KRW'}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{fmt(row.price)}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{row.count}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{row.quantity}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-medium">{fmt(rowTotal(row))}</td>
                  </tr>
                ))}
                <tr className="bg-blue-50">
                  <td colSpan={3} className="border border-gray-300 px-3 py-2 text-right font-medium">
                    {cat} 소계
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center font-medium">{catCurrency ?? ''}</td>
                  <td colSpan={3} />
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold">{fmt(catTotal)}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
        {!hasNonKrw && (
          <tfoot>
            <tr className="bg-green-50 font-bold">
              <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right">총 합계</td>
              <td className="border border-gray-300 px-3 py-2 text-right text-lg">{fmt(grandTotal)}</td>
            </tr>
            {totalPeople > 0 && (
              <tr className="bg-green-50 font-bold">
                <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right">1인당</td>
                <td className="border border-gray-300 px-3 py-2 text-right text-lg">{fmt(Math.round(grandTotal / totalPeople))}</td>
              </tr>
            )}
          </tfoot>
        )}
      </table>

      {/* 외화 환율 환산 테이블 */}
      {hasNonKrw && (
        <div>
          <table className="ml-auto border-collapse text-sm">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="border border-gray-300 px-4 py-2">통화</th>
                <th className="border border-gray-300 px-4 py-2 text-right">소계</th>
                <th className="border border-gray-300 px-4 py-2 text-right">환율</th>
                <th className="border border-gray-300 px-4 py-2 text-right">KRW 환산</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map(([cur, amt]) => {
                const rate = cur === 'KRW' ? 1 : (exchangeRates[cur] ?? 0)
                const converted = rate > 0 ? Math.round(amt * rate) : null
                return (
                  <tr key={cur} className="border-b border-gray-200">
                    <td className="border border-gray-300 px-4 py-2 text-center font-medium">{cur}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{fmt(amt)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{cur === 'KRW' ? '-' : (rate > 0 ? rate : '미입력')}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right font-medium">{converted !== null ? fmt(converted) : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-green-50 font-bold">
                <td colSpan={3} className="border border-gray-300 px-4 py-2 text-right">총 합계</td>
                <td className="border border-gray-300 px-4 py-2 text-right text-lg">{fmt(krwGrandTotal)}</td>
              </tr>
              {totalPeople > 0 && (
                <tr className="bg-green-50 font-bold">
                  <td colSpan={3} className="border border-gray-300 px-4 py-2 text-right">1인당</td>
                  <td className="border border-gray-300 px-4 py-2 text-right text-lg text-blue-600">{fmt(Math.round(krwGrandTotal / totalPeople))}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
