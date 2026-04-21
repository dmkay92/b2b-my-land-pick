'use client'

import { useState, useCallback, useEffect } from 'react'

interface Props {
  totalPeople: number
  initialPerPerson?: number
  initialTotal?: number
  onChange: (perPerson: number, total: number) => void
  disabled?: boolean
}

function formatDisplay(n: number): string {
  return n > 0 ? n.toLocaleString('ko-KR') : ''
}

export default function MarkupInput({ totalPeople, initialPerPerson, initialTotal, onChange, disabled = false }: Props) {
  const [perPerson, setPerPerson] = useState(initialPerPerson ?? 0)
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [editingField, setEditingField] = useState<'perPerson' | 'total' | null>(null)

  useEffect(() => {
    setPerPerson(initialPerPerson ?? 0)
    setTotal(initialTotal ?? 0)
  }, [initialPerPerson, initialTotal])

  const handlePerPersonChange = useCallback((value: string) => {
    const num = Math.max(0, Math.floor(Number(value.replace(/,/g, '')) || 0))
    setPerPerson(num)
    const newTotal = num * totalPeople
    setTotal(newTotal)
    onChange(num, newTotal)
  }, [totalPeople, onChange])

  const handleTotalChange = useCallback((value: string) => {
    const num = Math.max(0, Math.floor(Number(value.replace(/,/g, '')) || 0))
    setTotal(num)
    const newPerPerson = totalPeople > 0 ? Math.round(num / totalPeople) : 0
    setPerPerson(newPerPerson)
    onChange(newPerPerson, num)
  }, [totalPeople, onChange])

  return (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1 bg-white border border-gray-200 shadow-sm ml-auto">
      <span className="text-xs font-semibold whitespace-nowrap text-blue-700">
        여행사 커미션
      </span>
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <input
            type={!disabled && editingField === 'perPerson' ? 'number' : 'text'}
            value={!disabled && editingField === 'perPerson' ? (perPerson || '') : formatDisplay(perPerson)}
            onChange={e => !disabled && handlePerPersonChange(e.target.value)}
            onFocus={() => !disabled && setEditingField('perPerson')}
            onBlur={() => setEditingField(null)}
            readOnly={disabled}
            placeholder="1인당"
            className={`w-24 rounded-md px-2 py-1 text-xs text-right pr-7 focus:outline-none ${
              disabled
                ? 'bg-gray-100 border border-gray-200 text-gray-500 cursor-default'
                : 'bg-white border border-gray-300 text-gray-900 focus:ring-1 focus:ring-blue-400 focus:border-blue-400'
            }`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none text-gray-400">원</span>
        </div>
        <span className="text-[10px] whitespace-nowrap text-gray-400">×{totalPeople}명</span>
        <span className="text-gray-300">=</span>
        <div className="relative">
          <input
            type={!disabled && editingField === 'total' ? 'number' : 'text'}
            value={!disabled && editingField === 'total' ? (total || '') : formatDisplay(total)}
            onChange={e => !disabled && handleTotalChange(e.target.value)}
            onFocus={() => !disabled && setEditingField('total')}
            onBlur={() => setEditingField(null)}
            readOnly={disabled}
            placeholder="총액"
            className={`w-28 rounded-md px-2 py-1 text-xs text-right pr-7 font-semibold focus:outline-none ${
              disabled
                ? 'bg-gray-100 border border-gray-200 text-gray-500 cursor-default'
                : 'bg-white border border-gray-300 text-blue-700 focus:ring-1 focus:ring-blue-400 focus:border-blue-400'
            }`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none text-gray-400">원</span>
        </div>
      </div>
    </div>
  )
}
