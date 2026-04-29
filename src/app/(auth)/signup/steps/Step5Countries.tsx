'use client'

import { useState, useEffect } from 'react'
import CitySearchSelect from '@/components/CitySearchSelect'

interface Props {
  initial: { country: string; city: string }[]
  onNext: (areas: { country: string; city: string }[]) => void
  onBack: () => void
}

export function Step5Countries({ initial, onNext, onBack }: Props) {
  const [areas, setAreas] = useState<{ country: string; city: string }[]>(initial.length > 0 ? initial : [])
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedCities, setSelectedCities] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/cities').then(r => r.json()).then(d => setCountries(d.countries ?? []))
  }, [])

  function addAreas() {
    if (!selectedCountry || selectedCities.length === 0) return
    const newAreas = selectedCities
      .filter(city => !areas.some(a => a.country === selectedCountry && a.city === city))
      .map(city => ({ country: selectedCountry, city }))
    setAreas(prev => [...prev, ...newAreas])
    setSelectedCountry('')
    setSelectedCities([])
  }

  function removeArea(country: string, city: string) {
    setAreas(prev => prev.filter(a => !(a.country === country && a.city === city)))
  }

  function handleSubmit() {
    if (areas.length === 0) return
    onNext(areas)
  }

  // Group areas by country for display
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

      {/* 국가 + 도시 선택 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">국가</label>
          <select
            value={selectedCountry}
            onChange={e => { setSelectedCountry(e.target.value); setSelectedCities([]) }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">국가를 선택하세요</option>
            {countries.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {selectedCountry && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">도시 (복수 선택 가능)</label>
            <CitySearchSelect
              countryCode={selectedCountry}
              selected={selectedCities}
              onChange={v => setSelectedCities(v as string[])}
              multiple
              placeholder="도시를 검색하세요"
            />
          </div>
        )}

        {selectedCountry && selectedCities.length > 0 && (
          <button
            onClick={addAreas}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + {getCountryName(selectedCountry)} {selectedCities.length}개 도시 추가
          </button>
        )}
      </div>

      {/* 선택된 지역 표시 */}
      {Object.keys(grouped).length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">선택된 담당 지역</p>
          {Object.entries(grouped).map(([country, cities]) => (
            <div key={country} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">{getCountryName(country)}</p>
              <div className="flex flex-wrap gap-1.5">
                {cities.map(city => (
                  <span key={city} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full">
                    {city}
                    <button onClick={() => removeArea(country, city)} className="text-blue-400 hover:text-blue-600 ml-0.5">&times;</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button onClick={onBack} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          이전
        </button>
        <button
          onClick={handleSubmit}
          disabled={areas.length === 0}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          가입 완료
        </button>
      </div>
    </div>
  )
}
