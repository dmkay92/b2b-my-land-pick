'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BackButton } from '@/components/BackButton'

export default function LandcoProfileEditPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState('')
  const [description, setDescription] = useState('')
  const [introduction, setIntroduction] = useState('')
  const [profileImage, setProfileImage] = useState('')
  const [specialties, setSpecialties] = useState<string[]>([])
  const [newSpecialty, setNewSpecialty] = useState('')
  const [experienceYears, setExperienceYears] = useState<number | ''>('')
  const [highlights, setHighlights] = useState<string[]>([])
  const [newHighlight, setNewHighlight] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const res = await fetch('/api/profile')
      if (res.ok) {
        const d = await res.json()
        setDescription(d.description ?? '')
        setIntroduction(d.introduction ?? '')
        setProfileImage(d.profile_image ?? '')
        setSpecialties(d.specialties ?? [])
        setExperienceYears(d.experience_years ?? '')
        setHighlights(d.highlights ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = createClient()
    const path = `profiles/${userId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('quotes').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = await supabase.storage.from('quotes').createSignedUrl(path, 60 * 60 * 24 * 365)
      if (data?.signedUrl) setProfileImage(data.signedUrl)
    }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: introduction.split('\n')[0].slice(0, 200),
        introduction,
        profile_image: profileImage,
        specialties,
        experience_years: experienceYears || null,
        highlights,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BackButton href="/landco/countries" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">프로필 편집</h1>
        <a href={`/partners/${userId}`} target="_blank" className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">
          미리보기 &#x2197;
        </a>
      </div>

      <div className="space-y-6">
        {/* 프로필 이미지 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">프로필 이미지</h3>
          <div className="flex items-center gap-4">
            {profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileImage} alt="" className="w-20 h-20 rounded-xl object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 text-2xl">?</div>
            )}
            <div>
              <label className="inline-block px-4 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50">
                {uploading ? '업로드 중...' : '이미지 변경'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              </label>
              {profileImage && (
                <button onClick={() => setProfileImage('')} className="ml-2 text-xs text-gray-400 hover:text-red-500">삭제</button>
              )}
            </div>
          </div>
        </div>

        {/* 경력 & 전문 분야 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">경력 & 전문 분야</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">경력 (년)</label>
              <input
                type="number"
                value={experienceYears}
                onChange={e => setExperienceYears(e.target.value ? parseInt(e.target.value) : '')}
                placeholder="예: 10"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <label className="text-xs text-gray-500 mb-1 block">전문 분야</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {specialties.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                {s}
                <button onClick={() => setSpecialties(prev => prev.filter((_, idx) => idx !== i))} className="text-blue-400 hover:text-red-500">&#x2715;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newSpecialty}
              onChange={e => setNewSpecialty(e.target.value)}
              placeholder="예: 인센티브, 골프, MICE"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={e => {
                if (e.key === 'Enter' && newSpecialty.trim()) {
                  setSpecialties(prev => [...prev, newSpecialty.trim()])
                  setNewSpecialty('')
                }
              }}
            />
            <button
              onClick={() => { if (newSpecialty.trim()) { setSpecialties(prev => [...prev, newSpecialty.trim()]); setNewSpecialty('') } }}
              className="px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              추가
            </button>
          </div>
        </div>

        {/* 소개 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-1">소개</h3>
          <p className="text-[11px] text-gray-400 mb-2">회사에 대한 소개를 작성해주세요. 첫 줄이 견적서에서 회사명 옆에 표시됩니다. (최대 2000자)</p>
          <textarea
            value={introduction}
            onChange={e => setIntroduction(e.target.value.slice(0, 2000))}
            placeholder="회사의 역사, 철학, 서비스 특징 등을 자유롭게 작성해주세요."
            rows={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <p className="text-[10px] text-gray-400 text-right mt-1">{introduction.length}/2000</p>
        </div>

        {/* 강점 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-1">강점</h3>
          <p className="text-[11px] text-gray-400 mb-2">회사의 강점을 항목별로 추가해주세요.</p>
          <div className="space-y-2 mb-3">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-green-500 shrink-0">&#x2713;</span>
                <span className="flex-1 text-sm text-gray-700">{h}</span>
                <button onClick={() => setHighlights(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-gray-400 hover:text-red-500">삭제</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newHighlight}
              onChange={e => setNewHighlight(e.target.value)}
              placeholder="예: 전문 현지 가이드 상시 대기"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={e => {
                if (e.key === 'Enter' && newHighlight.trim()) {
                  setHighlights(prev => [...prev, newHighlight.trim()])
                  setNewHighlight('')
                }
              }}
            />
            <button
              onClick={() => { if (newHighlight.trim()) { setHighlights(prev => [...prev, newHighlight.trim()]); setNewHighlight('') } }}
              className="px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              추가
            </button>
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          {saved && <span className="text-sm text-green-600">저장되었습니다.</span>}
        </div>
      </div>
    </div>
  )
}
