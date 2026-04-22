'use client'

import { Fragment } from 'react'
import type { ItineraryDay } from '@/lib/supabase/types'

interface Props {
  itinerary: ItineraryDay[]
}

const MEAL_KEYS = ['조식', '중식', '석식'] as const

export default function ItineraryView({ itinerary }: Props) {
  return (
    <div className="border border-gray-900 divide-y divide-gray-900 rounded-lg overflow-hidden">
      {itinerary.map(day => (
        <div key={day.day} className="bg-white">
          <div className="flex">
            {/* Left: Day */}
            <div className="w-28 flex-shrink-0 flex flex-col items-center justify-center py-4 px-2 gap-0.5 border-r border-gray-900 bg-white">
              <span className="text-xs font-bold text-gray-900">Day {day.day}</span>
              {day.date && <span className="text-[10px] text-gray-400">{day.date}</span>}
            </div>

            {/* Middle: Rows + Overnight */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Column headers (first day only) */}
              {day.day === 1 && (
                <div className="flex items-center border-b border-gray-800 bg-gray-900">
                  <div className="w-24 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5">지역</div>
                  <div className="w-28 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">교통편</div>
                  <div className="w-24 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">시간</div>
                  <div className="flex-1 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">일정</div>
                </div>
              )}

              {/* Rows */}
              {day.rows.map((row, rowIdx) => (
                <div key={rowIdx} className="flex items-center border-b border-gray-100">
                  <div className="w-24 flex-shrink-0 text-sm px-2 py-2.5 border-l-0 text-gray-600 min-h-[38px]">{row.area || '\u00A0'}</div>
                  <div className="w-28 flex-shrink-0 text-sm px-2 py-2.5 border-l border-gray-200 text-gray-600 min-h-[38px]">{row.transport || '\u00A0'}</div>
                  <div className="w-24 flex-shrink-0 text-sm px-2 py-2.5 border-l border-gray-200 text-gray-500 min-h-[38px]">{row.time || '\u00A0'}</div>
                  <div className="flex-1 text-sm px-2 py-2.5 border-l border-gray-200 text-gray-800 min-h-[38px]">{row.content || '\u00A0'}</div>
                </div>
              ))}

              {/* Overnight */}
              {day.overnight.type !== 'none' && (
                <div className="px-4 py-2.5 bg-blue-50 border-t border-gray-100 flex items-center gap-2">
                  {day.overnight.type === 'hotel' && (
                    <>
                      <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">호텔</span>
                      {day.overnight.stars && (
                        <span className="text-xs text-amber-500">{'★'.repeat(day.overnight.stars)}</span>
                      )}
                      {day.overnight.name && (
                        <span className="text-sm text-gray-700">{day.overnight.name}</span>
                      )}
                    </>
                  )}
                  {day.overnight.type === 'flight' && (
                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">기내박</span>
                  )}
                </div>
              )}
            </div>

            {/* Right: Meals */}
            <div className="w-32 flex-shrink-0 border-l border-gray-900 bg-orange-50/30 flex flex-col">
              {day.day === 1 && (
                <div className="text-[11px] font-medium text-white text-center py-1.5 border-b border-gray-700 bg-gray-900">식사</div>
              )}
              <div className="flex flex-col gap-1 px-3 py-2 flex-1 justify-center">
                {MEAL_KEYS.map(meal => {
                  const mealData = day.meals?.[meal]
                  const isActive = mealData?.active !== false
                  return (
                    <div key={meal} className="flex items-center gap-1.5">
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-orange-400 border-orange-400' : 'bg-white border border-gray-300'
                      }`}>
                        {isActive && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-xs font-medium ${isActive ? 'text-gray-700' : 'text-gray-400'}`}>{meal}</span>
                      {isActive && mealData?.note && (
                        <span className="text-xs text-gray-500 truncate">{mealData.note}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
