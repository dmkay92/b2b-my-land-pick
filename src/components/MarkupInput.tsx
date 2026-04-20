'use client'

import { useState, useCallback } from 'react'

interface Props {
  totalPeople: number
  initialPerPerson?: number
  initialTotal?: number
  onChange: (perPerson: number, total: number) => void
}

export default function MarkupInput({ totalPeople, initialPerPerson, initialTotal, onChange }: Props) {
  const [perPerson, setPerPerson] = useState(initialPerPerson ?? 0)
  const [total, setTotal] = useState(initialTotal ?? 0)

  const handlePerPersonChange = useCallback((value: string) => {
    const num = Math.max(0, Math.floor(Number(value) || 0))
    setPerPerson(num)
    const newTotal = num * totalPeople
    setTotal(newTotal)
    onChange(num, newTotal)
  }, [totalPeople, onChange])

  const handleTotalChange = useCallback((value: string) => {
    const num = Math.max(0, Math.floor(Number(value) || 0))
    setTotal(num)
    const newPerPerson = totalPeople > 0 ? Math.round(num / totalPeople) : 0
    setPerPerson(newPerPerson)
    onChange(newPerPerson, num)
  }, [totalPeople, onChange])

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 whitespace-nowrap">여행사 수익</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="number"
            value={perPerson || ''}
            onChange={e => handlePerPersonChange(e.target.value)}
            placeholder="0"
            className="w-28 border border-gray-300 rounded px-3 py-1.5 text-sm text-right pr-12"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원/인</span>
        </div>
        <span className="text-gray-400 text-xs">×{totalPeople}명 =</span>
        <div className="relative">
          <input
            type="number"
            value={total || ''}
            onChange={e => handleTotalChange(e.target.value)}
            placeholder="0"
            className="w-32 border border-gray-300 rounded px-3 py-1.5 text-sm text-right pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
        </div>
      </div>
    </div>
  )
}
