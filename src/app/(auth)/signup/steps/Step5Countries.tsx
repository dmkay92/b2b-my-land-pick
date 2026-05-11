'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  initial: { country: string; city: string }[]
  onNext: (areas: { country: string; city: string }[]) => void
  onBack: () => void
}

interface CityItem {
  id: string
  country_code: string
  city_name: string
}

// 국가 검색 셀렉트 (admin과 동일 패턴)
function CountrySearchSelect({ countries, selected, onChange, placeholder }: {
  countries: { code: string; name: string }[]
  selected: string
  onChange: (code: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) {
      const name = countries.find(c => c.code === selected)?.name ?? ''
      setQuery(name)
    }
  }, [selected, countries])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query && !countries.some(c => c.name === query)
    ? countries.filter(c => c.name.includes(query) || c.code.toLowerCase().includes(query.toLowerCase()))
    : countries

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? '국가 검색'}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8"
        />
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">검색 결과가 없습니다</p>
          ) : filtered.map(c => (
            <button
              key={c.code}
              onClick={() => { onChange(c.code); setQuery(c.name); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                selected === c.code ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 도시 멀티셀렉트 (admin과 동일 패턴)
function CityMultiSelect({ countryCode, selected, onChange, placeholder }: {
  countryCode: string
  selected: string[]
  onChange: (cities: string[]) => void
  placeholder?: string
}) {
  const [cities, setCities] = useState<CityItem[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!countryCode) { setCities([]); return }
    fetch(`/api/cities?country=${countryCode}`)
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

  function toggle(cityName: string) {
    if (selected.includes(cityName)) {
      onChange(selected.filter(c => c !== cityName))
    } else {
      onChange([...selected, cityName])
    }
  }

  return (
    <div ref={ref} className="relative">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map(city => (
            <span key={city} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {city}
              <button onClick={() => toggle(city)} className="text-blue-400 hover:text-blue-600">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? '도시 검색'}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8"
        />
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>
      {open && countryCode && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">검색 결과가 없습니다</p>
          ) : filtered.map(city => {
            const isSelected = selected.includes(city.city_name)
            return (
              <button
                key={city.id}
                onClick={() => toggle(city.city_name)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span>{city.city_name}</span>
                  {isSelected && <span className="text-blue-500 text-[10px]">✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Step5Countries({ initial, onNext, onBack }: Props) {
  const [areas, setAreas] = useState<{ country: string; city: string }[]>(initial.length > 0 ? initial : [])
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [saCountry, setSaCountry] = useState('')
  const [saCities, setSaCities] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/cities').then(r => r.json()).then(d => setCountries(d.countries ?? []))
  }, [])

  function addAreas() {
    const newAreas = saCities
      .filter(city => !areas.some(a => a.country === saCountry && a.city === city))
      .map(city => ({ country: saCountry, city }))
    setAreas(prev => [...prev, ...newAreas])
    setSaCities([])
    setSaCountry('')
  }

  function removeArea(country: string, city: string) {
    setAreas(prev => prev.filter(a => !(a.country === country && a.city === city)))
  }

  const grouped = areas.reduce<Record<string, string[]>>((acc, a) => {
    if (!acc[a.country]) acc[a.country] = []
    acc[a.country].push(a.city)
    return acc
  }, {})

  const getCountryName = (code: string) => countries.find(c => c.code === code)?.name || code

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">담당 지역 선택</h2>
        <p className="mt-1 text-sm text-gray-500">담당하는 국가와 도시를 선택해주세요. 나중에 추가/변경도 가능해요.</p>
      </div>

      {/* 선택된 지역 표시 */}
      {Object.keys(grouped).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">담당 지역</p>
          {Object.entries(grouped).map(([country, cties]) => (
            <div key={country} className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-[10px] font-bold text-gray-400 mb-1.5">{getCountryName(country)}</p>
              <div className="flex flex-wrap gap-1">
                {cties.map(city => (
                  <span key={city} className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-700 text-[11px] px-2 py-0.5 rounded-full">
                    {city}
                    <button onClick={() => removeArea(country, city)} className="text-blue-300 hover:text-blue-600">&times;</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {areas.length === 0 && (
        <p className="text-xs text-gray-300">아직 등록된 담당 지역이 없습니다.</p>
      )}

      {/* 국가 + 도시 선택 (반반) */}
      <div className="grid grid-cols-2 gap-2">
        <CountrySearchSelect
          countries={countries}
          selected={saCountry}
          onChange={v => { setSaCountry(v); setSaCities([]) }}
          placeholder="국가 검색"
        />
        <div>
          {saCountry ? (
            <CityMultiSelect
              countryCode={saCountry}
              selected={saCities}
              onChange={setSaCities}
              placeholder="도시 검색"
            />
          ) : (
            <input disabled placeholder="국가를 먼저 선택" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-300" />
          )}
        </div>
      </div>
      {saCities.length > 0 && (
        <button
          onClick={addAreas}
          className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
        >
          + {saCities.length}개 도시 추가
        </button>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
          ← 이전
        </button>
        <button
          onClick={() => { if (areas.length > 0) onNext(areas) }}
          disabled={areas.length === 0}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          가입 완료
        </button>
      </div>
    </div>
  )
}
