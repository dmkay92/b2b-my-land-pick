'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateTotalPeople } from '@/lib/utils'

const HOTEL_GRADES = [3, 4, 5] as const
const COUNTRY_OPTIONS = [
  { code: 'JP', name: '일본' }, { code: 'CN', name: '중국' },
  { code: 'TH', name: '태국' }, { code: 'VN', name: '베트남' },
  { code: 'SG', name: '싱가포르' }, { code: 'ES', name: '스페인' },
  { code: 'IT', name: '이탈리아' }, { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' }, { code: 'US', name: '미국' },
  { code: 'AU', name: '호주' }, { code: 'AE', name: '두바이/UAE' },
  { code: 'HU', name: '헝가리' }, { code: 'AT', name: '오스트리아' },
]

export default function NewRequestPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    event_name: '',
    destination_country: 'JP',
    destination_city: '',
    depart_date: '',
    return_date: '',
    adults: 0,
    children: 0,
    infants: 0,
    leaders: 0,
    hotel_grade: 4 as 3 | 4 | 5,
    deadline: '',
    notes: '',
  })
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const totalPeople = calculateTotalPeople(form)

  function handleChange(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrors([])

    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const json = await res.json()
    if (!res.ok) {
      setErrors(json.errors ?? [json.error])
      setLoading(false)
      return
    }

    router.push('/agency')
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">견적 요청 작성</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700">행사명</label>
          <input
            type="text"
            value={form.event_name}
            onChange={e => handleChange('event_name', e.target.value)}
            required
            placeholder="예: 2026 임직원 해외 워크샵"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">목적지 국가</label>
            <select
              value={form.destination_country}
              onChange={e => handleChange('destination_country', e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COUNTRY_OPTIONS.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">목적지 도시</label>
            <input
              type="text"
              value={form.destination_city}
              onChange={e => handleChange('destination_city', e.target.value)}
              required
              placeholder="예: 오사카"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">출발일</label>
            <input
              type="date"
              value={form.depart_date}
              onChange={e => handleChange('depart_date', e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">도착일</label>
            <input
              type="date"
              value={form.return_date}
              onChange={e => handleChange('return_date', e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            인원 <span className="text-blue-600 font-normal">합계: {totalPeople}명</span>
          </label>
          <div className="grid grid-cols-4 gap-3">
            {(['adults', 'children', 'infants', 'leaders'] as const).map(field => (
              <div key={field}>
                <label className="block text-xs text-gray-500 mb-1">
                  {field === 'adults' ? '성인' : field === 'children' ? '아동' : field === 'infants' ? '영유아' : '인솔자'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={form[field]}
                  onChange={e => handleChange(field, parseInt(e.target.value) || 0)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">호텔 등급</label>
          <div className="flex gap-4">
            {HOTEL_GRADES.map(grade => (
              <label key={grade} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={grade}
                  checked={form.hotel_grade === grade}
                  onChange={() => handleChange('hotel_grade', grade)}
                />
                <span>{grade}성급</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">견적 마감일</label>
          <input
            type="date"
            value={form.deadline}
            onChange={e => handleChange('deadline', e.target.value)}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">기타 요청사항</label>
          <textarea
            value={form.notes}
            onChange={e => handleChange('notes', e.target.value)}
            rows={3}
            placeholder="특별 요청, 프로그램 요구사항 등을 입력해주세요"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {errors.length > 0 && (
          <ul className="text-red-500 text-sm space-y-1">
            {errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-md hover:bg-gray-200"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '제출 중...' : '견적 요청 제출'}
          </button>
        </div>
      </form>
    </div>
  )
}
