'use client'

import { Fragment } from 'react'
import type { ItineraryDay } from '@/lib/supabase/types'

interface Props {
  itinerary: ItineraryDay[]
}

const mealLabel = (meals: ItineraryDay['meals']) => {
  if (!meals) return ''
  const parts: string[] = []
  if (meals['조식']?.active) parts.push(meals['조식'].note ? `조: ${meals['조식'].note}` : '조')
  if (meals['중식']?.active) parts.push(meals['중식'].note ? `중: ${meals['중식'].note}` : '중')
  if (meals['석식']?.active) parts.push(meals['석식'].note ? `석: ${meals['석식'].note}` : '석')
  return parts.join(' / ')
}

const overnightLabel = (overnight: ItineraryDay['overnight']) => {
  if (overnight.type === 'hotel') {
    const stars = overnight.stars ? '★'.repeat(overnight.stars) : ''
    return `${stars} ${overnight.name ?? ''}`.trim()
  }
  if (overnight.type === 'flight') return '✈ 기내박'
  return ''
}

export default function ItineraryView({ itinerary }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-20">날짜</th>
            <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-24">지역</th>
            <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-20">교통편</th>
            <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-16">시간</th>
            <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">일정</th>
            <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-28">식사</th>
          </tr>
        </thead>
        <tbody>
          {itinerary.map((day, dayIdx) => (
            <Fragment key={day.day}>
              {day.rows.map((row, rowIdx) => (
                <tr
                  key={`${day.day}-${rowIdx}`}
                  className={`border-b border-gray-100 ${rowIdx === 0 && dayIdx > 0 ? 'border-t-2 border-t-gray-200' : ''}`}
                >
                  {rowIdx === 0 && (
                    <td
                      className="px-4 py-2 align-top font-semibold text-gray-900 bg-gray-50/50"
                      rowSpan={day.rows.length + 1}
                    >
                      <div className="text-sm">Day {day.day}</div>
                      {day.date && (
                        <div className="text-[10px] font-normal text-gray-400 mt-0.5">{day.date}</div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-1.5 text-gray-600">{row.area}</td>
                  <td className="px-4 py-1.5 text-gray-600">{row.transport}</td>
                  <td className="px-4 py-1.5 text-gray-500 text-xs">{row.time}</td>
                  <td className="px-4 py-1.5 text-gray-800">{row.content}</td>
                  {rowIdx === 0 && (
                    <td
                      className="px-4 py-1.5 text-xs text-gray-500 align-top"
                      rowSpan={day.rows.length + 1}
                    >
                      {mealLabel(day.meals)}
                    </td>
                  )}
                </tr>
              ))}
              {/* Overnight row */}
              {overnightLabel(day.overnight) && (
                <tr className={dayIdx < itinerary.length - 1 ? 'border-b-2 border-gray-200' : ''}>
                  <td colSpan={4} className="px-4 py-1.5 text-right">
                    <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                      {overnightLabel(day.overnight)}
                    </span>
                  </td>
                </tr>
              )}
              {!overnightLabel(day.overnight) && (
                <tr className={dayIdx < itinerary.length - 1 ? 'border-b-2 border-gray-200' : ''}>
                  <td colSpan={4} className="py-0.5" />
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
