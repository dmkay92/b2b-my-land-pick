'use client'

import { useState, useRef } from 'react'

// 시간 직접 입력 필드 (24시간제)
// - 숫자 3자리: "134" → "1:34"
// - 숫자 4자리: "1342" → "13:42"
export function TimePickerInput({
  value,
  onChange,
}: {
  value: string       // 'HH:MM' or ''
  onChange: (v: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
    let formatted = ''
    if (digits.length <= 2) {
      formatted = digits
    } else if (digits.length === 3) {
      formatted = digits[0] + ':' + digits.slice(1)
    } else {
      formatted = digits.slice(0, 2) + ':' + digits.slice(2)
    }
    onChange(formatted)
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(true)
    // 커서를 맨 앞으로
    requestAnimationFrame(() => e.target.setSelectionRange(0, 0))
    // 툴팁 position: fixed 계산 (overflow 컨테이너에서도 잘리지 않게)
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setTooltipStyle({ position: 'fixed', top: rect.bottom + 6, left: rect.left })
    }
  }

  return (
    <div className="shrink-0">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
        placeholder="23:59"
        className={`w-[72px] border rounded-md px-2 py-2 text-sm bg-white outline-none font-mono text-center transition-colors ${
          focused ? 'border-blue-500' : 'border-gray-300 hover:border-gray-400'
        }`}
      />
      {focused && (
        <div style={{ ...tooltipStyle, zIndex: 9999 }} className="w-max">
          <div className="bg-gray-700 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-md">
            숫자만 입력 (예: 9:00 → 900, 14:30 → 1430)
          </div>
        </div>
      )}
    </div>
  )
}
