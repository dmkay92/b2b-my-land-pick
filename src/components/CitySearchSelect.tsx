'use client'

import { useState, useEffect, useRef } from 'react'
import type { City } from '@/lib/supabase/types'

interface Props {
  countryCode: string
  selected: string | string[]
  onChange: (value: string | string[]) => void
  multiple?: boolean
  placeholder?: string
  activeOnly?: boolean
  size?: 'sm' | 'md'
}

export default function CitySearchSelect({ countryCode, selected, onChange, multiple = false, placeholder = '도시 검색', activeOnly = false, size = 'sm' }: Props) {
  const [cities, setCities] = useState<City[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!countryCode) { setCities([]); return }
    fetch(`/api/cities?country=${countryCode}${activeOnly ? '&active=true' : ''}`)
      .then(r => r.json())
      .then(d => setCities(d.cities ?? []))
  }, [countryCode])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = cities.filter(c => c.city_name.includes(query))
  const selectedArray = Array.isArray(selected) ? selected : (selected ? [selected] : [])

  function handleSelect(cityName: string) {
    if (multiple) {
      const arr = selectedArray.includes(cityName)
        ? selectedArray.filter(c => c !== cityName)
        : [...selectedArray, cityName]
      onChange(arr)
    } else {
      onChange(cityName)
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={ref} className="relative">
      {multiple && selectedArray.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selectedArray.map(city => (
            <span key={city} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {city}
              <button onClick={() => handleSelect(city)} className="text-blue-400 hover:text-blue-600">&times;</button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          value={multiple ? query : (open ? query : (selected as string) || '')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full border rounded-lg px-3 focus:outline-none ${size === 'md' ? 'border-gray-300 py-2.5 text-sm focus:ring-2 focus:ring-blue-500' : 'border-gray-200 py-2 text-xs focus:border-blue-400'}`}
        />
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      {open && countryCode && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">검색 결과가 없습니다</p>
          ) : (
            filtered.map(city => {
              const isSelected = selectedArray.includes(city.city_name)
              return (
                <button
                  key={city.id}
                  onClick={() => handleSelect(city.city_name)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span>{city.city_name}</span>
                    {isSelected && <span className="text-blue-500 text-[10px]">✓</span>}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
