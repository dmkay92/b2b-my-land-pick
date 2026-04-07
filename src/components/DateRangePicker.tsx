'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  triggerClassName?: string
  compact?: boolean
}

function toKSTStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDisplay(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const dow = new Date(Number(y), Number(m) - 1, Number(d)).getDay()
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${DAYS[dow]})`
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

interface MonthGridProps {
  year: number
  month: number
  startDate: string
  endDate: string
  hoverDate: string
  selectingEnd: boolean
  todayStr: string
  onDateClick: (d: string) => void
  onDateHover: (d: string) => void
}

function MonthGrid({ year, month, startDate, endDate, hoverDate, selectingEnd, todayStr, onDateClick, onDateHover }: MonthGridProps) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const rangeEnd = selectingEnd && hoverDate ? hoverDate : endDate
  const effectiveStart = startDate && rangeEnd
    ? (startDate <= rangeEnd ? startDate : rangeEnd)
    : startDate
  const effectiveEnd = startDate && rangeEnd
    ? (startDate <= rangeEnd ? rangeEnd : startDate)
    : rangeEnd

  return (
    <div className="flex-1 min-w-0">
      <p className="text-center font-bold text-gray-900 mb-3 text-base tracking-wide">
        {year}. {String(month + 1).padStart(2, '0')}
      </p>
      <div className="grid grid-cols-7 text-center mb-1">
        {DAYS.map((d, i) => (
          <span
            key={d}
            className={`text-xs font-medium py-1.5 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="py-2" />
          const dateStr = toDateStr(year, month, day)
          const isStart = dateStr === effectiveStart
          const isEnd = !!(effectiveEnd && dateStr === effectiveEnd)
          const inRange = !!(effectiveStart && effectiveEnd && dateStr > effectiveStart && dateStr < effectiveEnd)
          const dow = i % 7
          const isRangeStart = isStart && !!(effectiveEnd && effectiveStart !== effectiveEnd)
          const isRangeEnd = isEnd && !!(effectiveStart && effectiveStart !== effectiveEnd)

          const isToday = dateStr === todayStr
          return (
            <div
              key={dateStr}
              className={[
                'relative py-0.5 cursor-pointer select-none',
                inRange ? 'bg-blue-50' : '',
                isRangeStart ? 'bg-gradient-to-r from-transparent to-blue-50' : '',
                isRangeEnd ? 'bg-gradient-to-l from-transparent to-blue-50' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDateClick(dateStr)}
              onMouseEnter={() => onDateHover(dateStr)}
            >
              <span className={[
                'inline-flex flex-col items-center justify-center w-9 rounded-full transition-colors',
                isToday && !isStart && !isEnd ? 'ring-1 ring-[#009CF0]' : '',
                (isStart || isEnd) ? 'bg-[#009CF0] text-white font-semibold' : '',
                !isStart && !isEnd && dow === 0 ? 'text-red-400' : '',
                !isStart && !isEnd && dow === 6 ? 'text-blue-500' : '',
                !isStart && !isEnd && !inRange ? 'hover:bg-gray-100 text-gray-800' : '',
                inRange && !isStart && !isEnd ? 'text-gray-700' : '',
              ].filter(Boolean).join(' ')}
              style={{ minHeight: '2.25rem', paddingTop: '2px', paddingBottom: '2px' }}>
                <span className="text-sm leading-tight">{day}</span>
                {isToday && (
                  <span className={`text-[8px] leading-none font-medium ${isStart || isEnd ? 'text-white' : 'text-[#009CF0]'}`}>오늘</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangePicker({ startDate, endDate, onChange, triggerClassName, compact }: Props) {
  const today = new Date()
  const todayStr = toKSTStr(today)
  const [open, setOpen] = useState(false)
  const [tempStart, setTempStart] = useState(startDate)
  const [tempEnd, setTempEnd] = useState(endDate)
  const [baseYear, setBaseYear] = useState(today.getFullYear())
  const [baseMonth, setBaseMonth] = useState(today.getMonth())
  const [hoverDate, setHoverDate] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectingEnd = !!(tempStart && !tempEnd)

  const rightMonth = baseMonth === 11 ? 0 : baseMonth + 1
  const rightYear = baseMonth === 11 ? baseYear + 1 : baseYear

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleOpen() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const calendarHeight = 420
    if (spaceBelow >= calendarHeight) {
      setDropdownStyle({ position: 'fixed', top: rect.bottom + 8, left: rect.left, minWidth: 680 })
    } else {
      setDropdownStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left, minWidth: 680 })
    }
    setTempStart(startDate)
    setTempEnd(endDate)
    setOpen(true)
  }

  function handleDateClick(d: string) {
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(d)
      setTempEnd('')
    } else {
      const start = d <= tempStart ? d : tempStart
      const end = d <= tempStart ? tempStart : d
      setTempStart(start)
      setTempEnd(end)
      onChange(start, end)
      setOpen(false)
    }
  }

  function prevMonth() {
    if (baseMonth === 0) { setBaseYear(y => y - 1); setBaseMonth(11) }
    else setBaseMonth(m => m - 1)
  }

  function nextMonth() {
    if (baseMonth === 11) { setBaseYear(y => y + 1); setBaseMonth(0) }
    else setBaseMonth(m => m + 1)
  }

  return (
    <div className="relative">
      {/* 트리거 버튼 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={triggerClassName ?? 'w-full flex items-center gap-3 border border-gray-300 rounded-lg px-4 py-2.5 bg-white hover:border-blue-400 transition-colors text-sm'}
      >
        {!compact && <span className="text-gray-400">📅</span>}
        <span className={`${compact ? 'text-xs' : 'text-sm'} ${startDate ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
          {startDate ? (compact ? (() => { const [y,m,d] = startDate.split('-'); const dow = new Date(Number(y), Number(m)-1, Number(d)).getDay(); return `${y}.${m}.${d}(${DAYS[dow]})` })() : formatDisplay(startDate)) : '시작일'}
        </span>
        <span className="text-gray-300">—</span>
        <span className={`${compact ? 'text-xs' : 'text-sm'} ${endDate ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
          {endDate ? (compact ? (() => { const [y,m,d] = endDate.split('-'); const dow = new Date(Number(y), Number(m)-1, Number(d)).getDay(); return `${y}.${m}.${d}(${DAYS[dow]})` })() : formatDisplay(endDate)) : '종료일'}
        </span>
        {startDate && endDate && (() => {
          const diff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
          return <span className={`ml-auto font-medium text-gray-400 ${compact ? 'text-[11px]' : 'text-xs text-[#009CF0]'}`}>{diff}일</span>
        })()}
      </button>

      {/* 캘린더 드롭다운 */}
      {open && (
        <div
          ref={dropdownRef}
          className="z-50 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
          style={dropdownStyle}
        >
          <div
            className="px-6 py-2"
            onMouseLeave={() => setHoverDate('')}
          >
            <div className="flex items-stretch gap-4">
              <button
                type="button"
                onClick={prevMonth}
                className="flex items-center justify-center w-10 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg shrink-0 text-xl cursor-pointer"
              >
                ‹
              </button>
              <MonthGrid
                year={baseYear} month={baseMonth}
                startDate={tempStart} endDate={tempEnd}
                hoverDate={hoverDate} selectingEnd={selectingEnd}
                todayStr={todayStr}
                onDateClick={handleDateClick}
                onDateHover={setHoverDate}
              />
              <div className="w-px bg-gray-100 self-stretch mx-2" />
              <MonthGrid
                year={rightYear} month={rightMonth}
                startDate={tempStart} endDate={tempEnd}
                hoverDate={hoverDate} selectingEnd={selectingEnd}
                todayStr={todayStr}
                onDateClick={handleDateClick}
                onDateHover={setHoverDate}
              />
              <button
                type="button"
                onClick={nextMonth}
                className="flex items-center justify-center w-10 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg shrink-0 text-xl cursor-pointer"
              >
                ›
              </button>
            </div>
          </div>

          {/* 하단 period */}
          {(() => {
            const previewStart = selectingEnd && hoverDate
              ? (hoverDate < tempStart ? hoverDate : tempStart)
              : tempStart
            const previewEnd = selectingEnd && hoverDate
              ? (hoverDate < tempStart ? tempStart : hoverDate)
              : tempEnd
            return (
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-sm text-gray-600">
                  <span className={previewStart ? 'text-[#009CF0] font-medium' : 'text-gray-300'}>
                    {previewStart ? formatDisplay(previewStart) : '— —'}
                  </span>
                  <span className="mx-2 text-gray-300">→</span>
                  <span className={previewEnd ? 'text-[#009CF0] font-medium' : 'text-gray-300'}>
                    {previewEnd ? formatDisplay(previewEnd) : '— —'}
                  </span>
                </p>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// 단일 날짜 선택 (견적 마감일 등)
interface SingleDatePickerProps {
  value: string
  onChange: (date: string) => void
  placeholder?: string
  compact?: boolean  // 짧은 포맷 표시: "04/09(목)"
}

export function SingleDatePicker({ value, onChange, placeholder = '날짜 선택', compact = false }: SingleDatePickerProps) {
  const today = new Date()
  const todayStr = toKSTStr(today)
  const [open, setOpen] = useState(false)
  const [baseYear, setBaseYear] = useState(today.getFullYear())
  const [baseMonth, setBaseMonth] = useState(today.getMonth())
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const rightMonth = baseMonth === 11 ? 0 : baseMonth + 1
  const rightYear = baseMonth === 11 ? baseYear + 1 : baseYear

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleOpen() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const calendarHeight = 400
    if (spaceBelow >= calendarHeight) {
      setDropdownStyle({ position: 'fixed', top: rect.bottom + 8, left: rect.left, minWidth: 680 })
    } else {
      setDropdownStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left, minWidth: 680 })
    }
    setOpen(v => !v)
  }

  function handleDateClick(d: string) {
    onChange(d)
    setOpen(false)
  }

  function prevMonth() {
    if (baseMonth === 0) { setBaseYear(y => y - 1); setBaseMonth(11) }
    else setBaseMonth(m => m - 1)
  }

  function nextMonth() {
    if (baseMonth === 11) { setBaseYear(y => y + 1); setBaseMonth(0) }
    else setBaseMonth(m => m + 1)
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-2 border border-gray-300 rounded-lg bg-white hover:border-blue-400 transition-colors text-sm ${
          compact ? 'px-2.5 py-2 w-full' : 'w-full px-4 py-2.5 gap-3'
        }`}
      >
        <span className={compact ? 'text-gray-400 text-xs' : 'text-gray-400'}>📅</span>
        <span className={value ? 'text-gray-900 font-medium' : 'text-gray-400'}>
          {value
            ? compact
              ? (() => {
                  const [y, m, d] = value.split('-')
                  const dow = new Date(Number(y), Number(m) - 1, Number(d)).getDay()
                  const DAYS = ['일','월','화','수','목','금','토']
                  return `${m}/${d}(${DAYS[dow]})`
                })()
              : formatDisplay(value)
            : placeholder}
        </span>
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="z-50 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
          style={dropdownStyle}
        >
          <div className="px-6 py-2">
            <div className="flex items-stretch gap-4">
              <button
                type="button"
                onClick={prevMonth}
                className="flex items-center justify-center w-10 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg shrink-0 text-xl cursor-pointer"
              >
                ‹
              </button>
              <MonthGrid
                year={baseYear} month={baseMonth}
                startDate={value} endDate=""
                hoverDate="" selectingEnd={false}
                todayStr={todayStr}
                onDateClick={handleDateClick}
                onDateHover={() => {}}
              />
              <div className="w-px bg-gray-100 self-stretch mx-2" />
              <MonthGrid
                year={rightYear} month={rightMonth}
                startDate={value} endDate=""
                hoverDate="" selectingEnd={false}
                todayStr={todayStr}
                onDateClick={handleDateClick}
                onDateHover={() => {}}
              />
              <button
                type="button"
                onClick={nextMonth}
                className="flex items-center justify-center w-10 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg shrink-0 text-xl cursor-pointer"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
