'use client'

import { Fragment } from 'react'
import type { ItineraryDay } from '@/lib/supabase/types'

interface Props {
  itinerary: ItineraryDay[]
}

const mealLabel = (meals: ItineraryDay['meals']) => {
  if (!meals) return ''
  const parts: string[] = []
  if (meals['조식']?.active) parts.push(meals['조식'].note ? `조: ${meals['조식'].note}` : '조식')
  if (meals['중식']?.active) parts.push(meals['중식'].note ? `중: ${meals['중식'].note}` : '중식')
  if (meals['석식']?.active) parts.push(meals['석식'].note ? `석: ${meals['석식'].note}` : '석식')
  return parts.join(' / ')
}

const overnightLabel = (overnight: ItineraryDay['overnight']) => {
  if (overnight.type === 'hotel') {
    const stars = overnight.stars ? '★'.repeat(overnight.stars) : ''
    return `${stars} ${overnight.name ?? ''}`.trim()
  }
  if (overnight.type === 'flight') return '기내박'
  return ''
}

export default function ItineraryView({ itinerary }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-900 text-white">
            <th className="border border-gray-300 px-3 py-2 w-16">날짜</th>
            <th className="border border-gray-300 px-3 py-2 w-24">지역</th>
            <th className="border border-gray-300 px-3 py-2 w-24">교통편</th>
            <th className="border border-gray-300 px-3 py-2 w-20">시간</th>
            <th className="border border-gray-300 px-3 py-2">일정</th>
            <th className="border border-gray-300 px-3 py-2 w-32">식사</th>
          </tr>
        </thead>
        <tbody>
          {itinerary.map(day => (
            <Fragment key={day.day}>
              {day.rows.map((row, rowIdx) => (
                <tr key={`${day.day}-${rowIdx}`} className="border-b border-gray-200">
                  {rowIdx === 0 && (
                    <td
                      className="border border-gray-300 px-3 py-2 text-center font-medium bg-gray-50"
                      rowSpan={day.rows.length + 1}
                    >
                      Day {day.day}
                      {day.date && (
                        <div className="text-xs text-gray-500 mt-1">{day.date}</div>
                      )}
                    </td>
                  )}
                  <td className="border border-gray-300 px-3 py-2">{row.area}</td>
                  <td className="border border-gray-300 px-3 py-2">{row.transport}</td>
                  <td className="border border-gray-300 px-3 py-2">{row.time}</td>
                  <td className="border border-gray-300 px-3 py-2">{row.content}</td>
                  {rowIdx === 0 && (
                    <td
                      className="border border-gray-300 px-3 py-2 text-xs"
                      rowSpan={day.rows.length + 1}
                    >
                      {mealLabel(day.meals)}
                    </td>
                  )}
                </tr>
              ))}
              {/* Overnight row */}
              <tr className="bg-blue-50">
                <td colSpan={4} className="border border-gray-300 px-3 py-2 text-right text-xs text-gray-600">
                  {overnightLabel(day.overnight) && `숙박: ${overnightLabel(day.overnight)}`}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
