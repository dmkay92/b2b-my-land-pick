'use client'

import { useState, useMemo } from 'react'

export interface CalendarEvent {
  id: string
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  status: string
  meta?: string
}

interface Props {
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
}

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  open:            { bg: 'bg-blue-100',   text: 'text-blue-700' },
  in_progress:     { bg: 'bg-blue-100',   text: 'text-blue-700' },
  payment_pending: { bg: 'bg-amber-100',  text: 'text-amber-700' },
  finalized:       { bg: 'bg-purple-100', text: 'text-purple-700' },
  completed:       { bg: 'bg-green-100',  text: 'text-green-700' },
  closed:          { bg: 'bg-red-50',     text: 'text-red-600' },
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

interface EventSegment {
  event: CalendarEvent
  colStart: number
  colSpan: number
  isStart: boolean
  isEnd: boolean
  row: number
}

export function CalendarView({ events, onEventClick }: Props) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const today = toStr(new Date())

  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const startOffset = firstDay.getDay()
    const calStart = addDays(firstDay, -startOffset)
    const result: string[][] = []
    let current = new Date(calStart)
    for (let w = 0; w < 6; w++) {
      const week: string[] = []
      for (let d = 0; d < 7; d++) {
        week.push(toStr(current))
        current = addDays(current, 1)
      }
      if (w >= 5 && new Date(week[0]).getMonth() !== month) break
      result.push(week)
    }
    return result
  }, [year, month])

  const weekSegments = useMemo(() => {
    const result: EventSegment[][] = weeks.map(() => [])

    events.forEach(ev => {
      weeks.forEach((week, wi) => {
        const weekStart = week[0]
        const weekEnd = week[6]
        if (ev.endDate < weekStart || ev.startDate > weekEnd) return

        const effStart = ev.startDate < weekStart ? weekStart : ev.startDate
        const effEnd = ev.endDate > weekEnd ? weekEnd : ev.endDate

        const startIdx = week.indexOf(effStart)
        const endIdx = week.indexOf(effEnd)
        if (startIdx === -1 || endIdx === -1) return

        result[wi].push({
          event: ev,
          colStart: startIdx,
          colSpan: endIdx - startIdx + 1,
          isStart: ev.startDate >= weekStart,
          isEnd: ev.endDate <= weekEnd,
          row: 0,
        })
      })
    })

    result.forEach(segs => {
      segs.sort((a, b) => a.colStart - b.colStart || b.colSpan - a.colSpan)
      const slotEnds: number[] = []
      segs.forEach(seg => {
        let assigned = false
        for (let i = 0; i < slotEnds.length; i++) {
          if (slotEnds[i] <= seg.colStart) {
            seg.row = i
            slotEnds[i] = seg.colStart + seg.colSpan
            assigned = true
            break
          }
        }
        if (!assigned) {
          seg.row = slotEnds.length
          slotEnds.push(seg.colStart + seg.colSpan)
        }
      })
    })

    return result
  }, [weeks, events])

  const EVENT_H = 22
  const EVENT_GAP = 2
  const DATE_ROW_H = 28

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h2 className="text-lg font-bold text-gray-900 min-w-[140px] text-center">{year}년 {String(month + 1).padStart(2, '0')}월</h2>
        <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className={`text-center text-xs font-medium py-2 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => {
        const segs = weekSegments[wi]
        const maxRow = segs.length > 0 ? Math.max(...segs.map(s => s.row)) + 1 : 0
        const eventsAreaH = maxRow * (EVENT_H + EVENT_GAP)

        return (
          <div key={wi} className="border-b border-gray-100">
            {/* Date row */}
            <div className="grid grid-cols-7" style={{ height: DATE_ROW_H }}>
              {week.map((dateStr, di) => {
                const d = new Date(dateStr + 'T00:00:00')
                const isCurrentMonth = d.getMonth() === month
                const isToday = dateStr === today
                return (
                  <div
                    key={dateStr}
                    className={`border-r border-gray-100 last:border-r-0 px-1.5 pt-1 ${!isCurrentMonth ? 'bg-gray-50/50' : ''}`}
                  >
                    <span className={`inline-flex items-center justify-center text-xs w-6 h-6 rounded-full ${
                      isToday
                        ? 'bg-blue-600 text-white font-bold'
                        : !isCurrentMonth
                          ? 'text-gray-300'
                          : di === 0
                            ? 'text-red-400'
                            : di === 6
                              ? 'text-blue-400'
                              : 'text-gray-700'
                    }`}>
                      {d.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Events area */}
            {maxRow > 0 && (
              <div className="grid grid-cols-7 relative" style={{ height: eventsAreaH + 4 }}>
                {/* Grid lines for visual reference */}
                {week.map((dateStr, di) => {
                  const d = new Date(dateStr + 'T00:00:00')
                  const isCurrentMonth = d.getMonth() === month
                  return (
                    <div key={di} className={`border-r border-gray-100 last:border-r-0 ${!isCurrentMonth ? 'bg-gray-50/50' : ''}`} />
                  )
                })}

                {/* Event bars */}
                {segs.map((seg, si) => {
                  const colors = STATUS_COLOR[seg.event.status] ?? STATUS_COLOR.open
                  const left = `${(seg.colStart / 7) * 100}%`
                  const width = `${(seg.colSpan / 7) * 100}%`

                  return (
                    <div
                      key={`${seg.event.id}-${wi}-${si}`}
                      className={`absolute ${colors.bg} ${colors.text} text-[10px] font-medium truncate cursor-pointer hover:brightness-95 transition-all px-1.5`}
                      style={{
                        top: seg.row * (EVENT_H + EVENT_GAP) + 2,
                        height: EVENT_H,
                        left,
                        width,
                        lineHeight: `${EVENT_H}px`,
                        borderRadius: `${seg.isStart ? 4 : 0}px ${seg.isEnd ? 4 : 0}px ${seg.isEnd ? 4 : 0}px ${seg.isStart ? 4 : 0}px`,
                      }}
                      onClick={() => onEventClick?.(seg.event)}
                      title={`${seg.event.title}\n${seg.event.startDate} ~ ${seg.event.endDate}`}
                    >
                      {seg.isStart ? seg.event.title : ''}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Empty space for weeks without events */}
            {maxRow === 0 && <div style={{ height: 40 }} className="grid grid-cols-7">
              {week.map((dateStr, di) => {
                const d = new Date(dateStr + 'T00:00:00')
                const isCurrentMonth = d.getMonth() === month
                return <div key={di} className={`border-r border-gray-100 last:border-r-0 ${!isCurrentMonth ? 'bg-gray-50/50' : ''}`} />
              })}
            </div>}
          </div>
        )
      })}
    </div>
  )
}
