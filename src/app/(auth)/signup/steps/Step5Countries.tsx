'use client'

import { useState, useRef, useEffect } from 'react'
import { getCountryName } from '@/lib/utils'

const ALL_COUNTRY_CODES = [
  'JP', 'CN', 'TH', 'VN', 'PH', 'SG', 'MY', 'ID', 'HK', 'TW',
  'US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'CH', 'AT', 'NL',
  'AU', 'NZ', 'AE', 'TR', 'GR', 'PT', 'CZ', 'HU', 'PL', 'HR',
  'MX', 'IN', 'KH', 'LA', 'MM', 'NP', 'MV', 'FJ', 'MO',
]

interface Props {
  initial: string[]
  onNext: (countries: string[]) => void
  onBack: () => void
}

export function Step5Countries({ initial, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>(initial.length > 0 ? initial : [''])
  const [query, setQuery] = useState<string[]>(initial.map(code => code ? getCountryName(code) : ''))
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIdx(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function addRow() {
    setSelected(prev => [...prev, ''])
    setQuery(prev => [...prev, ''])
  }

  function removeRow(i: number) {
    setSelected(prev => prev.filter((_, idx) => idx !== i))
    setQuery(prev => prev.filter((_, idx) => idx !== i))
    if (openIdx === i) setOpenIdx(null)
  }

  function selectCountry(i: number, code: string) {
    setSelected(prev => prev.map((c, idx) => idx === i ? code : c))
    setQuery(prev => prev.map((q, idx) => idx === i ? getCountryName(code) : q))
    setOpenIdx(null)
  }

  function handleQueryChange(i: number, val: string) {
    setQuery(prev => prev.map((q, idx) => idx === i ? val : q))
    setSelected(prev => prev.map((c, idx) => idx === i ? '' : c))
    setOpenIdx(i)
  }

  function filteredOptions(i: number) {
    const q = query[i].toLowerCase()
    const alreadySelected = new Set(selected.filter((_, idx) => idx !== i))
    return ALL_COUNTRY_CODES
      .filter(code => !alreadySelected.has(code))
      .filter(code => !q || getCountryName(code).toLowerCase().includes(q) || code.toLowerCase().includes(q))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = selected.filter(c => c !== '')
    if (valid.length === 0) return
    onNext(valid)
  }

  const allFilled = selected.every(c => c !== '')

  return (
    <form onSubmit={handleSubmit} className="space-y-6" ref={containerRef}>
      <div>
        <h2 className="text-xl font-bold text-gray-900">마지막이에요!</h2>
        <p className="mt-1 text-sm text-gray-500">담당하는 국가를 선택해주세요. 나중에 추가/변경도 가능해요.</p>
      </div>

      <div className="space-y-2">
        {selected.map((code, i) => (
          <div key={i} className="relative flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query[i]}
                onChange={e => handleQueryChange(i, e.target.value)}
                onFocus={() => setOpenIdx(i)}
                placeholder="국가명을 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {openIdx === i && filteredOptions(i).length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-md">
                  {filteredOptions(i).slice(0, 20).map(optCode => (
                    <li
                      key={optCode}
                      onMouseDown={() => selectCountry(i, optCode)}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                    >
                      {getCountryName(optCode)} <span className="text-gray-400 text-xs">{optCode}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selected.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-red-400 hover:border-red-200"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          disabled={!allFilled}
          className="flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 py-2 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
        >
          + 국가 추가
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ← 이전
        </button>
        <button
          type="submit"
          disabled={!allFilled || selected.filter(c => c !== '').length === 0}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          가입 신청
        </button>
      </div>
    </form>
  )
}
