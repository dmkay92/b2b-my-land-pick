'use client'

import { useEffect } from 'react'
import type { QuoteRequest, ItineraryDay, ItineraryRow, OvernightType } from '@/lib/supabase/types'

interface Props {
  request: QuoteRequest
  itinerary: ItineraryDay[]
  onChange: (itinerary: ItineraryDay[]) => void
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const [year, month, day] = dateStr.split('-')
  const dayName = DAY_NAMES[date.getDay()]
  return `${year}.${month}.${day} (${dayName})`
}

function buildInitialItinerary(departDate: string, returnDate: string): ItineraryDay[] {
  const result: ItineraryDay[] = []
  const start = new Date(departDate + 'T00:00:00')
  const end = new Date(returnDate + 'T00:00:00')
  let current = new Date(start)
  let dayNum = 1

  while (current <= end) {
    const yyyy = current.getFullYear()
    const mm = String(current.getMonth() + 1).padStart(2, '0')
    const dd = String(current.getDate()).padStart(2, '0')
    result.push({
      day: dayNum,
      date: `${yyyy}-${mm}-${dd}`,
      rows: [],
      overnight: { type: 'hotel', stars: 5, name: '' },
    })
    dayNum++
    current.setDate(current.getDate() + 1)
  }

  return result
}

function emptyRow(): ItineraryRow {
  return { area: '', transport: '', time: '', content: '', meal: '' }
}

export function ItineraryEditor({ request, itinerary, onChange }: Props) {
  useEffect(() => {
    if (itinerary.length === 0) {
      onChange(buildInitialItinerary(request.depart_date, request.return_date))
    }
  }, [])

  function updateDay(dayIndex: number, updated: ItineraryDay) {
    const next = itinerary.map((d, i) => (i === dayIndex ? updated : d))
    onChange(next)
  }

  function addRow(dayIndex: number) {
    const day = itinerary[dayIndex]
    updateDay(dayIndex, { ...day, rows: [...day.rows, emptyRow()] })
  }

  function updateRow(dayIndex: number, rowIndex: number, field: keyof ItineraryRow, value: string) {
    const day = itinerary[dayIndex]
    const rows = day.rows.map((r, i) =>
      i === rowIndex ? { ...r, [field]: value } : r
    )
    updateDay(dayIndex, { ...day, rows })
  }

  function deleteRow(dayIndex: number, rowIndex: number) {
    const day = itinerary[dayIndex]
    updateDay(dayIndex, { ...day, rows: day.rows.filter((_, i) => i !== rowIndex) })
  }

  function setOvernightType(dayIndex: number, type: OvernightType) {
    const day = itinerary[dayIndex]
    const overnight =
      type === 'hotel'
        ? { type, stars: day.overnight.stars ?? 5, name: day.overnight.name ?? '' }
        : { type }
    updateDay(dayIndex, { ...day, overnight })
  }

  function setOvernightStars(dayIndex: number, stars: 3 | 4 | 5) {
    const day = itinerary[dayIndex]
    updateDay(dayIndex, { ...day, overnight: { ...day.overnight, stars } })
  }

  function setOvernightName(dayIndex: number, name: string) {
    const day = itinerary[dayIndex]
    updateDay(dayIndex, { ...day, overnight: { ...day.overnight, name } })
  }

  return (
    <div className="space-y-6">
      {itinerary.map((day, dayIndex) => (
        <div key={day.date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Day 헤더 */}
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-200">
            <span className="font-semibold text-gray-800 text-sm">
              제{String(day.day).padStart(2, '0')}일&nbsp;&nbsp;{formatDayHeader(day.date)}
            </span>
            <button
              onClick={() => addRow(dayIndex)}
              className="text-xs text-blue-600 font-medium hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors"
            >
              + 행 추가
            </button>
          </div>

          {/* 일반 행 테이블 */}
          {day.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-20">지역</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">교통편</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-20">시간</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">일정</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">식사</th>
                    <th className="w-8 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {day.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-2 py-1.5">
                        <input
                          value={row.area}
                          onChange={e => updateRow(dayIndex, rowIndex, 'area', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="지역"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.transport}
                          onChange={e => updateRow(dayIndex, rowIndex, 'transport', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="교통편"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.time}
                          onChange={e => updateRow(dayIndex, rowIndex, 'time', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="00:00"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.content}
                          onChange={e => updateRow(dayIndex, rowIndex, 'content', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="일정 내용"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.meal}
                          onChange={e => updateRow(dayIndex, rowIndex, 'meal', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="조/중/석"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => deleteRow(dayIndex, rowIndex)}
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
          )}

          {day.rows.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400">
              + 행 추가 버튼을 눌러 일정을 입력하세요.
            </div>
          )}

          {/* 숙박 행 */}
          <div className="px-4 py-3 bg-blue-50/40 border-t border-gray-100 flex flex-wrap items-center gap-3">
            {/* 숙박 타입 토글 */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white text-xs font-medium">
              {(['hotel', 'flight', 'none'] as OvernightType[]).map(type => {
                const label = type === 'hotel' ? '🏨 호텔' : type === 'flight' ? '✈️ 기내박' : '없음'
                return (
                  <button
                    key={type}
                    onClick={() => setOvernightType(dayIndex, type)}
                    className={`px-3 py-1.5 transition-colors ${
                      day.overnight.type === type
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* 호텔 선택 시 추가 옵션 */}
            {day.overnight.type === 'hotel' && (
              <>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white text-xs font-medium">
                  {([3, 4, 5] as (3 | 4 | 5)[]).map(stars => (
                    <button
                      key={stars}
                      onClick={() => setOvernightStars(dayIndex, stars)}
                      className={`px-3 py-1.5 transition-colors ${
                        day.overnight.stars === stars
                          ? 'bg-amber-400 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {stars}★
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-40">
                  <span className="text-sm text-amber-400 flex-shrink-0">
                    {'★'.repeat(day.overnight.stars ?? 5)}
                  </span>
                  <input
                    value={day.overnight.name ?? ''}
                    onChange={e => setOvernightName(dayIndex, e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    placeholder="호텔명 입력"
                  />
                </div>
              </>
            )}

            {/* 기내박 선택 시 */}
            {day.overnight.type === 'flight' && (
              <span className="text-sm text-gray-600">✈️ 기내 숙박</span>
            )}
          </div>
        </div>
      ))}

      {itinerary.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          일정 데이터를 불러오는 중...
        </div>
      )}
    </div>
  )
}
