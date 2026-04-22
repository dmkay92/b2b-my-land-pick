'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { calculateTotalPeople } from '@/lib/utils'
import { DateRangePicker, SingleDatePicker } from '@/components/DateRangePicker'
import { TimePickerInput } from '@/components/TimePickerInput'
import { CustomSelect } from '@/components/CustomSelect'
import { createClient } from '@/lib/supabase/client'
import { BackButton } from '@/components/BackButton'

type FlightEntry = { dep_date: string; code: string; dep_time: string; arr_date: string; arr_time: string }
const EMPTY_FLIGHT: FlightEntry = { dep_date: '', code: '', dep_time: '', arr_date: '', arr_time: '' }

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

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <div className="mt-2 relative">
      <div className="absolute left-3 -top-1.5 w-3 h-3 bg-red-50 border-l border-t border-red-200 rotate-45" />
      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 flex items-center gap-1.5">
        <span className="font-bold shrink-0">!</span>
        <span>{msg}</span>
      </div>
    </div>
  )
}

export default function EditRequestPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [form, setForm] = useState({
    event_name: '',
    quote_type: 'hotel_land' as 'hotel_land' | 'land',
    destination_country: 'JP',
    destination_city: '',
    depart_date: '',
    return_date: '',
    outbound_flight: { ...EMPTY_FLIGHT },
    inbound_flight: { ...EMPTY_FLIGHT },
    adults: 0,
    children: 0,
    infants: 0,
    leaders: 0,
    hotel_grade: 4 as 3 | 4 | 5,
    shopping_option: false as boolean | null,
    shopping_count: null as number | null,
    tip_option: true as boolean | null,
    local_option: false as boolean | null,
    travel_type: '',
    religion_type: '',
    deadline: '',
    notes: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null)
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/requests/${id}`)
      .then(r => r.json())
      .then(json => {
        const r = json.request
        setForm({
          event_name: r.event_name,
          quote_type: r.quote_type ?? 'hotel_land',
          destination_country: r.destination_country,
          destination_city: r.destination_city,
          depart_date: r.depart_date.slice(0, 10),
          return_date: r.return_date.slice(0, 10),
          outbound_flight: r.flight_schedule?.outbound ?? { ...EMPTY_FLIGHT },
          inbound_flight: r.flight_schedule?.inbound ?? { ...EMPTY_FLIGHT },
          adults: r.adults,
          children: r.children,
          infants: r.infants,
          leaders: r.leaders,
          hotel_grade: r.hotel_grade,
          shopping_option: r.shopping_option ?? null,
          shopping_count: r.shopping_count ?? null,
          tip_option: r.tip_option ?? null,
          local_option: r.local_option ?? null,
          travel_type: r.travel_type ?? '',
          religion_type: r.religion_type ?? '',
          deadline: r.deadline.slice(0, 10),
          notes: r.notes ?? '',
        })
        if (r.attachment_url && r.attachment_name) {
          setAttachment({ url: r.attachment_url, name: r.attachment_name })
        }
        setFetching(false)
      })
  }, [id])

  async function uploadFile(file: File) {
    setAttachError(null)
    setAttachUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const path = `requests/${user?.id ?? 'anon'}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('quotes').upload(path, file)
    if (error) { setAttachError('파일 업로드에 실패했습니다.'); setAttachUploading(false); return }
    const { data: urlData } = await supabase.storage.from('quotes').createSignedUrl(path, 60 * 60 * 24 * 365)
    setAttachment({ url: urlData?.signedUrl ?? path, name: file.name })
    setAttachUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  function handleChange(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.event_name.trim()) errs.event_name = '행사명을 입력해주세요.'
    if (!form.destination_city.trim()) errs.destination_city = '목적지 도시를 입력해주세요.'
    if (!form.depart_date || !form.return_date) errs.dates = '출발일과 도착일을 선택해주세요.'
    if (calculateTotalPeople(form) === 0) errs.people = '인원을 1명 이상 입력해주세요.'
    if (!form.deadline) errs.deadline = '견적 마감일을 선택해주세요.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setFieldErrors({})
    setShowConfirm(true)
  }

  async function handleConfirmedSubmit() {
    setShowConfirm(false)
    setLoading(true)

    const isFlightEntry = (f: FlightEntry) => f.dep_date || f.code || f.dep_time || f.arr_time
    const flight_schedule = {
      outbound: isFlightEntry(form.outbound_flight) ? form.outbound_flight : null,
      inbound: isFlightEntry(form.inbound_flight) ? form.inbound_flight : null,
    }

    const res = await fetch(`/api/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        flight_schedule,
        attachment_url: attachment?.url ?? null,
        attachment_name: attachment?.name ?? null,
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      setFieldErrors({ submit: json.error ?? '수정 중 오류가 발생했습니다.' })
      setLoading(false)
      return
    }

    router.push(`/agency/requests/${id}`)
  }

  const totalPeople = calculateTotalPeople(form)

  if (fetching) return <div className="p-8 text-gray-400">로딩 중...</div>

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setShowConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-bold text-gray-900 mb-2">견적 요청 수정</h3>
            <p className="text-sm text-gray-500 mb-6">수정 사항을 저장하시겠습니까?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                취소
              </button>
              <button
                autoFocus
                onClick={handleConfirmedSubmit}
                className="flex-1 bg-[#009CF0] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#0088D9]"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}
      <BackButton />
      <h1 className="text-2xl font-bold mb-2">견적 요청 수정</h1>
      <p className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        표시된 항목은 필수 입력 사항입니다.
      </p>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700">행사명 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
          <input
            type="text"
            value={form.event_name}
            onChange={e => handleChange('event_name', e.target.value)}
            placeholder="예: 2026 임직원 해외 워크샵"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#009CF0]"
          />
          <FieldError msg={fieldErrors.event_name} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">목적지 국가 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
            <CustomSelect
              value={form.destination_country}
              options={COUNTRY_OPTIONS.map(c => ({ value: c.code, label: c.name }))}
              onChange={v => handleChange('destination_country', v)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">목적지 도시 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
            <input
              type="text"
              value={form.destination_city}
              onChange={e => handleChange('destination_city', e.target.value)}
              placeholder="예: 오사카"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#009CF0]"
            />
            <FieldError msg={fieldErrors.destination_city} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">출발일 · 도착일 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
          <DateRangePicker
            startDate={form.depart_date}
            endDate={form.return_date}
            onChange={(start, end) => setForm(prev => ({
              ...prev,
              depart_date: start,
              return_date: end,
              outbound_flight: {
                ...prev.outbound_flight,
                dep_date: start,
                arr_date: prev.outbound_flight.arr_date === prev.outbound_flight.dep_date || !prev.outbound_flight.arr_date ? start : prev.outbound_flight.arr_date,
              },
              inbound_flight: {
                ...prev.inbound_flight,
                dep_date: end,
                arr_date: prev.inbound_flight.arr_date === prev.inbound_flight.dep_date || !prev.inbound_flight.arr_date ? end : prev.inbound_flight.arr_date,
              },
            }))}
          />
          <FieldError msg={fieldErrors.dates} />
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              항공 스케줄 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <div className="space-y-2">
              {([
                { key: 'outbound_flight' as const, label: '출발편' },
                { key: 'inbound_flight' as const, label: '귀국편' },
              ]).map(({ key, label }) => (
                <div key={key} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${key === 'outbound_flight' ? 'bg-blue-400' : 'bg-purple-400'}`} />
                    <p className="text-xs font-semibold text-gray-600">{label}</p>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <input
                      type="text"
                      value={form[key].code}
                      onChange={e => setForm(prev => ({ ...prev, [key]: { ...prev[key], code: e.target.value.toUpperCase() } }))}
                      placeholder="편명 (KE637)"
                      className="w-[100px] shrink-0 border border-gray-300 rounded-md px-2.5 py-2 text-sm bg-white outline-none focus:border-[#009CF0] font-mono"
                    />
                    <div className="w-px h-5 bg-gray-200 shrink-0" />
                    <div className="w-[108px] shrink-0">
                      <SingleDatePicker
                        compact
                        value={form[key].dep_date}
                        onChange={dep_date => setForm(prev => ({
                          ...prev,
                          [key]: {
                            ...prev[key],
                            dep_date,
                            arr_date: prev[key].arr_date === prev[key].dep_date || !prev[key].arr_date ? dep_date : prev[key].arr_date,
                          }
                        }))}
                        placeholder="출발일"
                      />
                    </div>
                    <TimePickerInput
                      value={form[key].dep_time}
                      onChange={dep_time => setForm(prev => ({ ...prev, [key]: { ...prev[key], dep_time } }))}
                    />
                    <span className="text-gray-400 text-xs shrink-0 px-0.5">→</span>
                    <div className="w-[108px] shrink-0">
                      <SingleDatePicker
                        compact
                        value={form[key].arr_date}
                        onChange={arr_date => setForm(prev => ({ ...prev, [key]: { ...prev[key], arr_date } }))}
                        placeholder="도착일"
                      />
                    </div>
                    <TimePickerInput
                      value={form[key].arr_time}
                      onChange={arr_time => setForm(prev => ({ ...prev, [key]: { ...prev[key], arr_time } }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            인원 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /> <span className="text-[#009CF0] font-normal ml-2">합계: {totalPeople}명</span>
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
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#009CF0]"
                />
              </div>
            ))}
          </div>
          <FieldError msg={fieldErrors.people} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">호텔 등급 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
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
          <label className="block text-sm font-medium text-gray-700 mb-3">옵션 포함 여부 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
          <div className="space-y-2.5">
            {([
              { key: 'shopping_option' as const, label: '쇼핑 옵션', opts: [{ value: true, text: '쇼핑' }, { value: false, text: '노쇼핑' }] },
              { key: 'tip_option'      as const, label: '팁 옵션',   opts: [{ value: true, text: '포함' }, { value: false, text: '미포함' }] },
              { key: 'local_option'    as const, label: '현지 옵션', opts: [{ value: true, text: '가능' }, { value: false, text: '불가능' }] },
            ]).map(({ key, label, opts }) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <div className="flex gap-1.5">
                    {opts.map(opt => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setForm(prev => ({
                          ...prev,
                          [key]: opt.value,
                          ...(key === 'shopping_option' && opt.value !== true ? { shopping_count: null } : {}),
                        }))}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          form[key] === opt.value
                            ? 'bg-gray-900 text-white'
                            : 'border border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                </div>
                {key === 'shopping_option' && form.shopping_option === true && (
                  <div className="flex items-center justify-between pl-1">
                    <span className="text-xs text-gray-400">최소 쇼핑 횟수</span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, shopping_count: n }))}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                            form.shopping_count === n
                              ? 'bg-gray-900 text-white'
                              : 'border border-gray-300 text-gray-600 hover:border-gray-400'
                          }`}
                        >
                          {n === 3 ? '3회 이상' : `${n}회`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 여행 유형 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">여행 유형</h3>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'corporate_incentive', label: '기업 인센티브' },
              { value: 'corporate_workshop', label: '기업 워크숍/연수' },
              { value: 'academic_government', label: '학술/관공서' },
              { value: 'association', label: '협회/단체' },
              { value: 'family', label: '가족/친목' },
              { value: 'mice', label: 'MICE' },
              { value: 'religion', label: '종교' },
              { value: 'other', label: '기타' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, travel_type: opt.value, religion_type: opt.value !== 'religion' ? '' : f.religion_type }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.travel_type === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {form.travel_type === 'religion' && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">종교 구분</p>
              <div className="flex gap-2">
                {[
                  { value: 'protestant', label: '기독교' },
                  { value: 'catholic', label: '천주교' },
                  { value: 'buddhist', label: '불교' },
                  { value: 'other', label: '기타' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, religion_type: opt.value }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      form.religion_type === opt.value
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">견적 마감일 <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle mb-0.5 ml-1" /></label>
          <SingleDatePicker
            value={form.deadline}
            onChange={date => handleChange('deadline', date)}
            placeholder="마감일 선택"
          />
          <FieldError msg={fieldErrors.deadline} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">기타 요청사항 <span className="text-gray-400 font-normal">(선택)</span></label>
          <textarea
            value={form.notes}
            onChange={e => {
              handleChange('notes', e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            rows={3}
            placeholder="특별 요청, 프로그램 요구사항 등을 입력해주세요"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#009CF0] resize-none overflow-hidden"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">첨부파일 <span className="text-gray-400 font-normal">(선택)</span></label>
          <p className="text-xs text-gray-400 mt-0.5 mb-2">참고할 만한 스케줄이나 요청서가 있다면 첨부해주세요.</p>
          {attachment ? (
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50">
              <span className="text-sm text-gray-700 flex-1 truncate">{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)} className="text-xs text-gray-400 hover:text-red-500 shrink-0">✕ 삭제</button>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
              onDrop={handleDrop}
              onClick={() => !attachUploading && fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg px-4 py-5 cursor-pointer transition-colors ${
                isDragging ? 'border-[#009CF0] bg-blue-50' : 'border-gray-300 hover:border-[#009CF0] hover:bg-gray-50'
              } ${attachUploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <p className="text-sm text-gray-500">{attachUploading ? '업로드 중...' : isDragging ? '여기에 놓으세요' : '파일을 드래그하거나 클릭하여 업로드'}</p>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>
          )}
          {attachError && <p className="text-red-500 text-xs mt-1">{attachError}</p>}
        </div>

        {fieldErrors.submit && <FieldError msg={fieldErrors.submit} />}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-medium bg-white hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#009CF0] text-white py-2 rounded-lg font-medium hover:bg-[#0088D9] disabled:opacity-50"
          >
            {loading ? '저장 중...' : '수정 저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
