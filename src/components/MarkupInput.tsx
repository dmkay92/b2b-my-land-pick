'use client'

import { useState, useCallback } from 'react'

interface Props {
  totalPeople: number
  initialPerPerson?: number
  initialTotal?: number
  onChange: (perPerson: number, total: number) => void
  variant?: 'light' | 'dark'
}

function formatDisplay(n: number): string {
  return n > 0 ? n.toLocaleString('ko-KR') : ''
}

export default function MarkupInput({ totalPeople, initialPerPerson, initialTotal, onChange, variant = 'light' }: Props) {
  const [perPerson, setPerPerson] = useState(initialPerPerson ?? 0)
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [editingField, setEditingField] = useState<'perPerson' | 'total' | null>(null)

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

  const dark = variant === 'dark'

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
      dark ? 'bg-white/10 border border-white/20' : 'bg-blue-50/60 border border-blue-200'
    }`}>
      <span className={`text-xs font-semibold whitespace-nowrap ${dark ? 'text-emerald-400' : 'text-blue-700'}`}>
        여행사 커미션
      </span>
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <input
            type={editingField === 'perPerson' ? 'number' : 'text'}
            value={editingField === 'perPerson' ? (perPerson || '') : formatDisplay(perPerson)}
            onChange={e => handlePerPersonChange(e.target.value)}
            onFocus={() => setEditingField('perPerson')}
            onBlur={() => setEditingField(null)}
            placeholder="1인당"
            className={`w-24 rounded-md px-2 py-1 text-xs text-right pr-7 focus:outline-none focus:ring-1 ${
              dark
                ? 'bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:ring-emerald-400 focus:border-emerald-400'
                : 'bg-white border border-blue-200 text-gray-900 focus:ring-blue-400 focus:border-blue-400'
            }`}
          />
          <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none ${dark ? 'text-gray-500' : 'text-blue-400'}`}>원</span>
        </div>
        <span className={`text-[10px] whitespace-nowrap ${dark ? 'text-gray-500' : 'text-blue-400'}`}>×{totalPeople}명</span>
        <span className={dark ? 'text-gray-600' : 'text-blue-300'}>=</span>
        <div className="relative">
          <input
            type={editingField === 'total' ? 'number' : 'text'}
            value={editingField === 'total' ? (total || '') : formatDisplay(total)}
            onChange={e => handleTotalChange(e.target.value)}
            onFocus={() => setEditingField('total')}
            onBlur={() => setEditingField(null)}
            placeholder="총액"
            className={`w-28 rounded-md px-2 py-1 text-xs text-right pr-7 font-semibold focus:outline-none focus:ring-1 ${
              dark
                ? 'bg-white/10 border border-white/20 text-emerald-400 placeholder-gray-500 focus:ring-emerald-400 focus:border-emerald-400'
                : 'bg-white border border-blue-200 text-gray-900 focus:ring-blue-400 focus:border-blue-400'
            }`}
          />
          <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none ${dark ? 'text-gray-500' : 'text-blue-400'}`}>원</span>
        </div>
      </div>
    </div>
  )
}
