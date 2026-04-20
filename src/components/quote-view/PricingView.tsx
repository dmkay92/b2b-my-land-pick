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

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function PricingView({ pricing, totalPeople }: Props) {
  let grandTotal = 0

  return (
    <div className="overflow-x-auto">
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
            grandTotal += catTotal

            return (
              <Fragment key={cat}>
                {rows.map((row, idx) => (
                  <tr key={`${cat}-${idx}`} className="border-b border-gray-200">
                    {idx === 0 && (
                      <td
                        className="border border-gray-300 px-3 py-2 font-medium bg-gray-50"
                        rowSpan={rows.length}
                      >
                        {cat}
                      </td>
                    )}
                    <td className="border border-gray-300 px-3 py-2">{row.date}</td>
                    <td className="border border-gray-300 px-3 py-2">{row.detail}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">
                      {row.currency ?? 'KRW'}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right">
                      {formatNumber(row.price)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{row.count}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{row.quantity}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-medium">
                      {formatNumber(rowTotal(row))}
                    </td>
                  </tr>
                ))}
                <tr className="bg-blue-50">
                  <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right font-medium">
                    {cat} 소계
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold">
                    {formatNumber(catTotal)}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-green-50 font-bold">
            <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right">
              총 합계
            </td>
            <td className="border border-gray-300 px-3 py-2 text-right text-lg">
              {formatNumber(grandTotal)}
            </td>
          </tr>
          {totalPeople > 0 && (
            <tr className="bg-green-50 font-bold">
              <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right">
                1인당
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right text-lg">
                {formatNumber(Math.round(grandTotal / totalPeople))}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  )
}
