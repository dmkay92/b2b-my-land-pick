'use client'

import { useEffect, useState } from 'react'

interface City {
  id: string
  country_code: string
  city_name: string
  sort_order: number
}

const COUNTRY_NAMES: Record<string, string> = {
  JP: '일본', CN: '중국', VN: '베트남', FR: '프랑스',
  TH: '태국', ID: '인도네시아', PH: '필리핀', MY: '말레이시아',
  SG: '싱가포르', US: '미국', GB: '영국', DE: '독일',
  IT: '이탈리아', ES: '스페인', AU: '호주', NZ: '뉴질랜드',
  TW: '대만', HK: '홍콩', MO: '마카오',
}

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCountry, setActiveCountry] = useState('')
  const [newCityName, setNewCityName] = useState('')
  const [newCountryCode, setNewCountryCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])

  async function loadCountries() {
    const res = await fetch('/api/cities')
    if (res.ok) {
      const { countries: c } = await res.json()
      setCountries(c ?? [])
      if (!activeCountry && c.length > 0) setActiveCountry(c[0].code)
    }
  }

  async function loadCities() {
    if (!activeCountry) { setLoading(false); return }
    setLoading(true)
    const res = await fetch(`/api/cities?country=${activeCountry}`)
    if (res.ok) {
      const { cities: c } = await res.json()
      setCities(c ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { loadCountries() }, [])
  useEffect(() => { loadCities() }, [activeCountry])

  async function handleAdd() {
    const countryCode = newCountryCode || activeCountry
    if (!countryCode || !newCityName.trim()) return
    setAdding(true)
    await fetch('/api/admin/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode, cityName: newCityName.trim() }),
    })
    setNewCityName('')
    setNewCountryCode('')
    setAdding(false)
    await loadCountries()
    if (!activeCountry) setActiveCountry(countryCode)
    loadCities()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 도시를 삭제하시겠습니까?')) return
    await fetch(`/api/admin/cities/${id}`, { method: 'DELETE' })
    loadCities()
    loadCountries()
  }

  async function handleMoveUp(idx: number) {
    if (idx === 0) return
    const updated = [...cities]
    const [item] = updated.splice(idx, 1)
    updated.splice(idx - 1, 0, item)
    const updates = updated.map((c, i) => ({ id: c.id, sort_order: i + 1 }))
    setCities(updated)
    await fetch('/api/admin/cities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
  }

  async function handleMoveDown(idx: number) {
    if (idx === cities.length - 1) return
    const updated = [...cities]
    const [item] = updated.splice(idx, 1)
    updated.splice(idx + 1, 0, item)
    const updates = updated.map((c, i) => ({ id: c.id, sort_order: i + 1 }))
    setCities(updated)
    await fetch('/api/admin/cities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">도시 관리</h1>

      {/* 새 도시 추가 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-sm font-bold text-gray-700 mb-3">도시 추가</h3>
        <div className="flex gap-2">
          <select
            value={newCountryCode || activeCountry}
            onChange={e => setNewCountryCode(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32"
          >
            {countries.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
            <option value="__new__">+ 새 국가</option>
          </select>
          {(newCountryCode === '__new__') && (
            <input
              value={newCountryCode === '__new__' ? '' : newCountryCode}
              onChange={e => setNewCountryCode(e.target.value.toUpperCase())}
              placeholder="국가코드 (예: TH)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
              maxLength={2}
            />
          )}
          <input
            value={newCityName}
            onChange={e => setNewCityName(e.target.value)}
            placeholder="도시명"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newCityName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
          >
            추가
          </button>
        </div>
      </div>

      {/* 국가 탭 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {countries.map(c => (
          <button
            key={c.code}
            onClick={() => setActiveCountry(c.code)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeCountry === c.code ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c.name} ({c.code})
          </button>
        ))}
      </div>

      {/* 도시 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-16">순서</th>
              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">도시명</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3 w-32">순서 변경</th>
              <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3 w-20">삭제</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">로딩 중...</td></tr>
            ) : cities.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">등록된 도시가 없습니다.</td></tr>
            ) : (
              cities.map((city, idx) => (
                <tr key={city.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{city.city_name}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleMoveUp(idx)} disabled={idx === 0} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 px-2 py-1">▲</button>
                      <button onClick={() => handleMoveDown(idx)} disabled={idx === cities.length - 1} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 px-2 py-1">▼</button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDelete(city.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
