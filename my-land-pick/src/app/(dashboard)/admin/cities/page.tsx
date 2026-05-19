'use client'

import { useEffect, useState } from 'react'

interface City {
  id: string
  country_code: string
  city_name: string
  sort_order: number
}

const ALL_COUNTRIES: { code: string; name: string }[] = [
  { code: 'GR', name: '그리스' }, { code: 'GU', name: '괌' }, { code: 'ZA', name: '남아공' },
  { code: 'NL', name: '네덜란드' }, { code: 'NP', name: '네팔' }, { code: 'NO', name: '노르웨이' },
  { code: 'NC', name: '뉴칼레도니아' }, { code: 'NZ', name: '뉴질랜드' }, { code: 'TW', name: '대만' },
  { code: 'DK', name: '덴마크' }, { code: 'DE', name: '독일' }, { code: 'LA', name: '라오스' },
  { code: 'LV', name: '라트비아' }, { code: 'RU', name: '러시아' }, { code: 'RO', name: '루마니아' },
  { code: 'LT', name: '리투아니아' }, { code: 'MO', name: '마카오' }, { code: 'MY', name: '말레이시아' },
  { code: 'MX', name: '멕시코' }, { code: 'ME', name: '몬테네그로' }, { code: 'MA', name: '모로코' },
  { code: 'MU', name: '모리셔스' }, { code: 'MN', name: '몽골' }, { code: 'MV', name: '몰디브' },
  { code: 'MT', name: '몰타' }, { code: 'US', name: '미국' }, { code: 'MM', name: '미얀마' },
  { code: 'VN', name: '베트남' }, { code: 'BE', name: '벨기에' }, { code: 'BA', name: '보스니아' },
  { code: 'BG', name: '불가리아' }, { code: 'BR', name: '브라질' }, { code: 'RS', name: '세르비아' },
  { code: 'SE', name: '스웨덴' }, { code: 'CH', name: '스위스' }, { code: 'ES', name: '스페인' },
  { code: 'LK', name: '스리랑카' }, { code: 'SK', name: '슬로바키아' }, { code: 'SI', name: '슬로베니아' },
  { code: 'SG', name: '싱가포르' }, { code: 'AE', name: 'UAE' }, { code: 'IS', name: '아이슬란드' },
  { code: 'IE', name: '아일랜드' }, { code: 'AR', name: '아르헨티나' }, { code: 'ET', name: '에티오피아' },
  { code: 'EE', name: '에스토니아' }, { code: 'GB', name: '영국' }, { code: 'OM', name: '오만' },
  { code: 'AT', name: '오스트리아' }, { code: 'JO', name: '요르단' }, { code: 'UZ', name: '우즈베키스탄' },
  { code: 'UA', name: '우크라이나' }, { code: 'EG', name: '이집트' }, { code: 'IL', name: '이스라엘' },
  { code: 'IT', name: '이탈리아' }, { code: 'IN', name: '인도' }, { code: 'ID', name: '인도네시아' },
  { code: 'JP', name: '일본' }, { code: 'GE', name: '조지아' }, { code: 'CN', name: '중국' },
  { code: 'CL', name: '칠레' }, { code: 'KH', name: '캄보디아' }, { code: 'CA', name: '캐나다' },
  { code: 'KE', name: '케냐' }, { code: 'CO', name: '콜롬비아' }, { code: 'CU', name: '쿠바' },
  { code: 'HR', name: '크로아티아' }, { code: 'TH', name: '태국' }, { code: 'TR', name: '튀르키예' },
  { code: 'TZ', name: '탄자니아' }, { code: 'PW', name: '팔라우' }, { code: 'PE', name: '페루' },
  { code: 'PT', name: '포르투갈' }, { code: 'PL', name: '폴란드' }, { code: 'FR', name: '프랑스' },
  { code: 'FJ', name: '피지' }, { code: 'FI', name: '핀란드' }, { code: 'PH', name: '필리핀' },
  { code: 'KR', name: '한국' }, { code: 'HU', name: '헝가리' }, { code: 'HK', name: '홍콩' },
  { code: 'AU', name: '호주' }, { code: 'KZ', name: '카자흐스탄' },
]

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCountry, setActiveCountry] = useState('')
  const [newCityName, setNewCityName] = useState('')
  const [newCountryCode, setNewCountryCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAddCountry, setShowAddCountry] = useState(false)
  const [newCountryInput, setNewCountryInput] = useState('')
  const [newCountryNameInput, setNewCountryNameInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null) // insert BEFORE this index
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

  async function handleDrop(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    const updated = [...cities]
    const [item] = updated.splice(fromIdx, 1)
    updated.splice(toIdx, 0, item)
    setCities(updated)
    const updates = updated.map((c, i) => ({ id: c.id, sort_order: i + 1 }))
    await fetch('/api/admin/cities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
  }

  async function handleSaveOrder() {
    setEditing(false)
    setDragIdx(null)
    setDragOverIdx(null)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">도시 관리</h1>

      {/* 도시 추가 + 국가 추가 */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">도시 추가</h3>
          <div className="flex gap-2">
            <select
              value={newCountryCode || activeCountry}
              onChange={e => setNewCountryCode(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36"
            >
              {countries.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
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
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 shrink-0"
            >
              추가
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5" style={{ minWidth: 280 }}>
          <h3 className="text-sm font-bold text-gray-700 mb-3">국가 추가</h3>
          {showAddCountry ? (() => {
            const existingCodes = new Set(countries.map(c => c.code))
            const available = ALL_COUNTRIES.filter(c => !existingCodes.has(c.code))
            return (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={newCountryInput}
                    onChange={e => setNewCountryInput(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                    autoFocus
                  >
                    <option value="">국가 선택</option>
                    {available.map(c => (
                      <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setShowAddCountry(false); setNewCountryInput(''); setNewCountryNameInput('') }}
                    className="px-3 py-2 text-gray-400 hover:text-gray-600 text-sm shrink-0"
                  >
                    취소
                  </button>
                </div>
                {newCountryInput && (
                  <div className="flex gap-2">
                    <input
                      value={newCountryNameInput}
                      onChange={e => setNewCountryNameInput(e.target.value)}
                      placeholder="첫 번째 도시명 입력"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && newCountryNameInput.trim()) {
                          setAdding(true)
                          const code = newCountryInput
                          await fetch('/api/admin/cities', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ countryCode: code, cityName: newCountryNameInput.trim() }),
                          })
                          setNewCountryInput('')
                          setNewCountryNameInput('')
                          setShowAddCountry(false)
                          setAdding(false)
                          await loadCountries()
                          setActiveCountry(code)
                          loadCities()
                        }
                      }}
                    />
                    <button
                      onClick={async () => {
                        if (!newCountryNameInput.trim()) return
                        setAdding(true)
                        const code = newCountryInput
                        await fetch('/api/admin/cities', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ countryCode: code, cityName: newCountryNameInput.trim() }),
                        })
                        setNewCountryInput('')
                        setNewCountryNameInput('')
                        setShowAddCountry(false)
                        setAdding(false)
                        await loadCountries()
                        setActiveCountry(code)
                        loadCities()
                      }}
                      disabled={adding || !newCountryNameInput.trim()}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 shrink-0"
                    >
                      등록
                    </button>
                  </div>
                )}
              </div>
            )
          })() : (
            <button
              onClick={() => setShowAddCountry(true)}
              className="w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 text-sm font-medium rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors"
            >
              + 새 국가 추가
            </button>
          )}
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
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex gap-4 text-xs font-semibold text-gray-500">
            <span className="w-12">순서</span>
            <span>도시명</span>
          </div>
          {cities.length > 0 && (
            editing ? (
              <button onClick={handleSaveOrder} className="text-xs font-medium text-blue-600 hover:text-blue-800 px-3 py-1 rounded-lg border border-blue-200 bg-blue-50">
                완료
              </button>
            ) : (
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">
                순서 수정
              </button>
            )
          )}
        </div>
        {loading ? (
          <p className="text-center py-8 text-gray-400 text-sm">로딩 중...</p>
        ) : cities.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">등록된 도시가 없습니다.</p>
        ) : (
          <div>
            {cities.map((city, idx) => (
              <div key={city.id}>
                {/* Drop indicator line BEFORE this row */}
                {editing && dragOverIdx === idx && dragIdx !== null && dragIdx !== idx && dragIdx !== idx - 1 && (
                  <div className="h-0.5 bg-blue-500 mx-2" />
                )}
                <div
                  draggable={editing}
                  onDragStart={() => { if (editing) setDragIdx(idx) }}
                  onDragOver={e => {
                    if (!editing) return
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const midY = rect.top + rect.height / 2
                    setDragOverIdx(e.clientY < midY ? idx : idx + 1)
                  }}
                  onDragLeave={() => { if (editing) setDragOverIdx(null) }}
                  onDrop={() => {
                    if (editing && dragIdx !== null && dragOverIdx !== null) {
                      const toIdx = dragOverIdx > dragIdx ? dragOverIdx - 1 : dragOverIdx
                      handleDrop(dragIdx, toIdx)
                      setDragIdx(null)
                      setDragOverIdx(null)
                    }
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className={`flex items-center justify-between px-4 py-3 border-b border-gray-50 transition-colors ${
                    editing ? 'cursor-grab active:cursor-grabbing' : 'hover:bg-gray-50/50'
                  } ${dragIdx === idx ? 'opacity-30' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    {editing && (
                      <span className="text-gray-300 select-none">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                      </span>
                    )}
                    <span className="text-sm text-gray-400 w-8">{idx + 1}</span>
                    <span className="text-sm font-medium text-gray-900">{city.city_name}</span>
                  </div>
                  {!editing && (
                    <button onClick={() => handleDelete(city.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                  )}
                </div>
                {/* Drop indicator line AFTER last row */}
                {editing && dragOverIdx === idx + 1 && idx === cities.length - 1 && dragIdx !== null && dragIdx !== idx && (
                  <div className="h-0.5 bg-blue-500 mx-2" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
