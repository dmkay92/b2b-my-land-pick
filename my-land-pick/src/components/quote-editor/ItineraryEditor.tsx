'use client'

import { useEffect, useRef, useState } from 'react'
import type { QuoteRequest, ItineraryDay, ItineraryRow, OvernightType } from '@/lib/supabase/types'

interface Props {
  request: QuoteRequest
  itinerary: ItineraryDay[]
  onChange: (itinerary: ItineraryDay[]) => void
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
const MEAL_KEYS = ['조식', '중식', '석식'] as const
type MealKey = typeof MEAL_KEYS[number]

const DEFAULT_MEALS = {
  조식: { active: true, note: '' },
  중식: { active: true, note: '' },
  석식: { active: true, note: '' },
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const [year, month, day] = dateStr.split('-')
  return { date: `${year}.${month}.${day}`, dayName: `(${DAY_NAMES[d.getDay()]})` }
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
      meals: { ...DEFAULT_MEALS },
    })
    dayNum++
    current.setDate(current.getDate() + 1)
  }

  return result
}

interface DragState {
  dayIndex: number
  fromIndex: number
  toIndex: number
}

export function ItineraryEditor({ request, itinerary, onChange }: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  useEffect(() => {
    if (itinerary.length === 0) {
      onChange(buildInitialItinerary(request.depart_date, request.return_date))
    }
  }, [])

  function updateDay(dayIndex: number, updated: ItineraryDay) {
    onChange(itinerary.map((d, i) => (i === dayIndex ? updated : d)))
  }

  function addRow(dayIndex: number) {
    const day = itinerary[dayIndex]
    const newIndex = day.rows.length
    updateDay(dayIndex, { ...day, rows: [...day.rows, { area: '', transport: '', time: '', content: '', meal: '' }] })
    requestAnimationFrame(() => {
      ;(document.querySelector(`[data-cell="${dayIndex}-${newIndex}-area"]`) as HTMLInputElement)?.focus()
    })
  }

  function updateRow(dayIndex: number, rowIndex: number, field: keyof ItineraryRow, value: string) {
    const day = itinerary[dayIndex]
    const rows = day.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r))
    updateDay(dayIndex, { ...day, rows })
  }

  function deleteRow(dayIndex: number, rowIndex: number) {
    const day = itinerary[dayIndex]
    updateDay(dayIndex, { ...day, rows: day.rows.filter((_, i) => i !== rowIndex) })
  }

  function handleTimeInput(dayIndex: number, rowIndex: number, value: string) {
    // 한글/영문 포함 시 텍스트 모드 (전일, All Day 등)
    if (/[a-zA-Zㄱ-ㅎㅏ-ㅣ가-힣]/.test(value)) {
      updateRow(dayIndex, rowIndex, 'time', value)
      return
    }
    // 숫자 모드: 최대 4자리 추출 후 HH:MM 포맷
    const digits = value.replace(/\D/g, '').slice(0, 4)
    let formatted: string
    if (digits.length <= 2) formatted = digits
    else if (digits.length === 3) formatted = `${digits[0]}:${digits.slice(1)}`
    else formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`
    updateRow(dayIndex, rowIndex, 'time', formatted)
  }

  const FIELDS = ['area', 'transport', 'time', 'content'] as const

  function handlePaste(
    e: React.ClipboardEvent,
    dayIndex: number,
    startRowIndex: number,
    fieldName: string,
  ) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return // 단일 값이면 기본 동작

    e.preventDefault()
    const startFieldIndex = FIELDS.indexOf(fieldName as typeof FIELDS[number])
    const pastedRows = text
      .split('\n')
      .map(r => r.replace(/\r$/, ''))
      .filter(r => r.length > 0)

    const day = itinerary[dayIndex]
    const newRows = [...day.rows]

    pastedRows.forEach((rowText, ri) => {
      const cells = rowText.split('\t')
      const targetRow = startRowIndex + ri

      if (targetRow >= newRows.length) {
        newRows.push({ area: '', transport: '', time: '', content: '', meal: '' })
      }

      cells.forEach((cell, ci) => {
        const fieldIndex = startFieldIndex + ci
        if (fieldIndex < FIELDS.length) {
          newRows[targetRow] = { ...newRows[targetRow], [FIELDS[fieldIndex]]: cell.trim() }
        }
      })
    })

    updateDay(dayIndex, { ...day, rows: newRows })
  }

  function handleArrowNav(e: React.KeyboardEvent, dayIndex: number, rowIndex: number, field: typeof FIELDS[number]) {
    const input = e.target as HTMLInputElement
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      ;(document.querySelector(`[data-cell="${dayIndex}-${rowIndex + 1}-${field}"]`) as HTMLInputElement)?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      ;(document.querySelector(`[data-cell="${dayIndex}-${rowIndex - 1}-${field}"]`) as HTMLInputElement)?.focus()
    } else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) {
      const nextField = FIELDS[FIELDS.indexOf(field) + 1]
      if (nextField) {
        e.preventDefault()
        ;(document.querySelector(`[data-cell="${dayIndex}-${rowIndex}-${nextField}"]`) as HTMLInputElement)?.focus()
      }
    } else if (e.key === 'ArrowLeft' && input.selectionStart === 0) {
      const prevField = FIELDS[FIELDS.indexOf(field) - 1]
      if (prevField) {
        e.preventDefault()
        const target = document.querySelector(`[data-cell="${dayIndex}-${rowIndex}-${prevField}"]`) as HTMLInputElement
        if (target) { target.focus(); target.setSelectionRange(target.value.length, target.value.length) }
      }
    }
  }

  function reorderRow(dayIndex: number, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const day = itinerary[dayIndex]
    const rows = [...day.rows]
    const [moved] = rows.splice(fromIndex, 1)
    rows.splice(toIndex, 0, moved)
    updateDay(dayIndex, { ...day, rows })
  }


  function toggleMeal(dayIndex: number, meal: MealKey) {
    const day = itinerary[dayIndex]
    const meals = { ...DEFAULT_MEALS, ...day.meals }
    const entry = meals[meal]
    updateDay(dayIndex, { ...day, meals: { ...meals, [meal]: { ...entry, active: !entry.active } } })
  }

  function updateMealNote(dayIndex: number, meal: MealKey, note: string) {
    const day = itinerary[dayIndex]
    const meals = { ...DEFAULT_MEALS, ...day.meals }
    updateDay(dayIndex, { ...day, meals: { ...meals, [meal]: { ...meals[meal], note } } })
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
    <div>
      <div className="border border-gray-900 divide-y divide-gray-900">
      {itinerary.map((day, dayIndex) => {
        const { date, dayName } = formatDate(day.date)
        const meals = { ...DEFAULT_MEALS, ...day.meals }
        return (
          <div key={day.day} className="bg-white overflow-hidden">
            <div className="flex">
              {/* 왼쪽: 제x일 + 날짜 */}
              <div className="w-28 flex-shrink-0 flex flex-col items-center justify-center bg-white border-r border-gray-900 py-4 px-2 gap-0.5">
                <span className="text-xs font-bold text-gray-900">
                  제{String(day.day).padStart(2, '0')}일
                </span>
              </div>

              {/* 가운데: 행 테이블 + overnight */}
              <div className="flex-1 min-w-0">
                {/* 컬럼 헤더 */}
                <div className="flex items-center border-b border-gray-800 bg-gray-900">
                  <div className="w-10 flex-shrink-0" />
                  <div className="w-24 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">지역</div>
                  <div className="w-28 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">교통편</div>
                  <div className="w-24 flex-shrink-0 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">시간</div>
                  <div className="flex-1 text-xs font-medium text-white px-2 py-1.5 border-l border-gray-700">일정</div>
                  <div className="w-10 flex-shrink-0" />
                </div>

                {/* 행들 */}
                {day.rows.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400">
                    + 행 추가 버튼을 눌러 일정을 입력하세요.
                  </div>
                ) : (
                  day.rows.map((row, rowIndex) => {
                    const isDraggingThis = dragState?.dayIndex === dayIndex && dragState.fromIndex === rowIndex
                    const ds = dragState
                    const isTarget = ds?.dayIndex === dayIndex && ds.toIndex === rowIndex && ds.fromIndex !== rowIndex
                    const showAbove = isTarget && ds!.fromIndex > rowIndex
                    const showBelow = isTarget && ds!.fromIndex < rowIndex
                    return (
                      <div key={rowIndex}>
                        {showAbove && (
                          <div className="h-0.5 bg-blue-400 mx-2" />
                        )}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault()
                            const ds = dragStateRef.current
                            if (ds?.dayIndex === dayIndex && ds.toIndex !== rowIndex) {
                              const next = { ...ds, toIndex: rowIndex }
                              dragStateRef.current = next
                              setDragState(next)
                            }
                          }}
                          onDrop={() => {
                            const ds = dragStateRef.current
                            if (ds?.dayIndex === dayIndex) {
                              reorderRow(dayIndex, ds.fromIndex, ds.toIndex)
                            }
                            dragStateRef.current = null
                            setDragState(null)
                          }}
                          className={`flex items-center border-b border-gray-100 group ${
                            isDraggingThis ? 'opacity-30' : 'hover:bg-blue-50/30'
                          }`}
                        >
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', String(rowIndex))
                              const next = { dayIndex, fromIndex: rowIndex, toIndex: rowIndex }
                              dragStateRef.current = next
                              setDragState(next)
                            }}
                            onDragEnd={() => {
                              dragStateRef.current = null
                              setDragState(null)
                            }}
                            className="w-10 flex-shrink-0 cursor-grab text-gray-300 hover:text-gray-500 flex items-center justify-center select-none text-base self-stretch"
                            title="드래그하여 순서 변경"
                          >
                            ⠿
                          </div>
                          <div className="w-24 flex-shrink-0 border-l border-gray-200 self-stretch">
                            <input
                              data-cell={`${dayIndex}-${rowIndex}-area`}
                              value={row.area}
                              onChange={e => updateRow(dayIndex, rowIndex, 'area', e.target.value)}
                              onKeyDown={e => handleArrowNav(e, dayIndex, rowIndex, 'area')}
                              onPaste={e => handlePaste(e, dayIndex, rowIndex, 'area')}
                              className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent placeholder:text-gray-300"
                              placeholder="지역명"
                            />
                          </div>
                          <div className="w-28 flex-shrink-0 border-l border-gray-200 self-stretch">
                            <input
                              data-cell={`${dayIndex}-${rowIndex}-transport`}
                              value={row.transport}
                              onChange={e => updateRow(dayIndex, rowIndex, 'transport', e.target.value)}
                              onKeyDown={e => handleArrowNav(e, dayIndex, rowIndex, 'transport')}
                              onPaste={e => handlePaste(e, dayIndex, rowIndex, 'transport')}
                              className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent placeholder:text-gray-300"
                              placeholder={day.day === 1 ? 'e.g. KE651' : 'e.g. 전용차량'}
                            />
                          </div>
                          <div className="w-24 flex-shrink-0 border-l border-gray-200 self-stretch relative group/time">
                            <input
                              data-cell={`${dayIndex}-${rowIndex}-time`}
                              value={row.time}
                              onChange={e => handleTimeInput(dayIndex, rowIndex, e.target.value)}
                              onKeyDown={e => handleArrowNav(e, dayIndex, rowIndex, 'time')}
                              onPaste={e => handlePaste(e, dayIndex, rowIndex, 'time')}
                              className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent placeholder:text-gray-300"
                              placeholder="00:00"
                            />
                            <div className="pointer-events-none absolute left-0 top-full z-20 hidden group-focus-within/time:block bg-gray-700 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-md mt-0.5">
                              숫자만 입력 (예: 9:00 → 900, 14:30 → 1430) &nbsp;·&nbsp; 텍스트도 가능 (예: 전일, All Day)
                            </div>
                          </div>
                          <div className="flex-1 border-l border-gray-200 self-stretch">
                            <input
                              data-cell={`${dayIndex}-${rowIndex}-content`}
                              value={row.content}
                              onChange={e => updateRow(dayIndex, rowIndex, 'content', e.target.value)}
                              onKeyDown={e => handleArrowNav(e, dayIndex, rowIndex, 'content')}
                              onPaste={e => handlePaste(e, dayIndex, rowIndex, 'content')}
                              className="w-full h-full text-sm px-2 py-2.5 focus:outline-none focus:bg-blue-50 bg-transparent placeholder:text-gray-300"
                              placeholder="일정 내용"
                            />
                          </div>
                          <div className="w-10 flex-shrink-0 flex items-center justify-center border-l border-gray-200 self-stretch opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => deleteRow(dayIndex, rowIndex)}
                              className="w-full h-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-lg leading-none font-medium"
                              title="행 삭제"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {showBelow && (
                          <div className="h-0.5 bg-blue-400 mx-2" />
                        )}
                      </div>
                    )
                  })
                )}

                {/* 마지막 행 아래 드롭 인디케이터 */}
                {dragState?.dayIndex === dayIndex && dragState.toIndex === day.rows.length && (
                  <div className="h-0.5 bg-blue-400 mx-2" />
                )}

                {/* 인라인 행 추가 */}
                <button
                  onClick={() => addRow(dayIndex)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 transition-colors border-t border-dashed border-gray-200 group"
                >
                  <span className="text-base leading-none group-hover:text-blue-500">+</span>
                  <span>행 추가</span>
                </button>

                {/* 숙박 행 */}
                <div
                  className="px-4 py-3 bg-blue-50 border-t border-gray-100 flex flex-wrap items-center gap-3"
                  onDragOver={(e) => {
                    e.preventDefault()
                    const ds = dragStateRef.current
                    if (ds?.dayIndex === dayIndex && ds.toIndex !== day.rows.length) {
                      const next = { ...ds, toIndex: day.rows.length }
                      dragStateRef.current = next
                      setDragState(next)
                    }
                  }}
                >
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
                          className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white placeholder:text-gray-300"
                          placeholder="호텔명 입력"
                        />
                      </div>
                    </>
                  )}

                  {day.overnight.type === 'flight' && (
                    <span className="text-sm text-gray-600">✈️ 기내 숙박</span>
                  )}
                </div>
              </div>

              {/* 오른쪽: 식사 island */}
              <div className="w-44 flex-shrink-0 border-l border-gray-200 bg-orange-50/30 flex flex-col">
                <div className="text-[11px] font-medium text-white text-center py-1.5 border-b border-gray-700 bg-gray-900">
                  식사
                </div>
                <div className="flex flex-col p-2 flex-1 justify-center">
                  {MEAL_KEYS.map((meal) => {
                    const entry = meals[meal]
                    return (
                      <div key={meal} className="flex items-center gap-1.5 min-w-0">
                        <button
                          onClick={() => toggleMeal(dayIndex, meal)}
                          className="flex-shrink-0 flex items-center gap-1.5 group"
                        >
                          {/* 체크박스 */}
                          <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors flex-shrink-0 ${
                            entry.active
                              ? 'bg-orange-400 border-orange-400'
                              : 'bg-white border-gray-300 group-hover:border-gray-400'
                          }`}>
                            {entry.active && (
                              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          <span className={`text-xs font-medium transition-colors ${
                            entry.active ? 'text-gray-700' : 'text-gray-400'
                          }`}>
                            {meal}
                          </span>
                        </button>
                        <input
                          data-meal-note={`${dayIndex}-${MEAL_KEYS.indexOf(meal)}`}
                          value={entry.note}
                          onChange={e => updateMealNote(dayIndex, meal, e.target.value)}
                          onKeyDown={e => {
                            const mealIndex = MEAL_KEYS.indexOf(meal)
                            if (e.key === 'Tab' || e.key === 'ArrowDown') {
                              const target = e.shiftKey
                                ? document.querySelector(`[data-meal-note="${dayIndex}-${mealIndex - 1}"]`)
                                : document.querySelector(`[data-meal-note="${dayIndex}-${mealIndex + 1}"]`)
                              if (target) {
                                e.preventDefault()
                                ;(target as HTMLInputElement).focus()
                              }
                            } else if (e.key === 'ArrowUp') {
                              const target = document.querySelector(`[data-meal-note="${dayIndex}-${mealIndex - 1}"]`)
                              if (target) {
                                e.preventDefault()
                                ;(target as HTMLInputElement).focus()
                              }
                            }
                          }}
                          disabled={!entry.active}
                          className="min-w-0 flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed placeholder:text-gray-300"
                          placeholder="호텔식, 현지식 등"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      </div>

      {itinerary.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          일정 데이터를 불러오는 중...
        </div>
      )}
    </div>
  )
}
