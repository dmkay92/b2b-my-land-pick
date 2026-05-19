'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getCountryName } from '@/lib/utils'

interface LandcoProfile {
  id: string
  company_name: string
  description: string
  introduction: string
  profile_image: string
  specialties: string[]
  experience_years: number | null
  highlights: string[]
  country_codes: string[]
  service_areas: { country: string; city: string }[]
}

export default function PartnerProfilePage() {
  const { id } = useParams()
  const [profile, setProfile] = useState<LandcoProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/profile?id=${id}`)
      .then(r => r.json())
      .then(d => { setProfile(d.profile ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
  if (!profile) return <div className="min-h-screen flex items-center justify-center text-gray-400">파트너를 찾을 수 없습니다.</div>

  const countryMap: Record<string, string[]> = {}
  ;(profile.country_codes ?? []).forEach(c => { countryMap[c] = [] })
  ;(profile.service_areas ?? []).forEach(a => {
    if (!countryMap[a.country]) countryMap[a.country] = []
    if (!countryMap[a.country].includes(a.city)) countryMap[a.country].push(a.city)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-start gap-6">
            {profile.profile_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.profile_image} alt="" className="w-24 h-24 rounded-2xl object-cover border-2 border-white/20" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center text-3xl text-white/50 border-2 border-white/10">
                {profile.company_name.charAt(0)}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white mb-1">{profile.company_name}</h1>
              {profile.introduction && (
                <p className="text-sm text-gray-300">{profile.introduction.split('\n')[0]}</p>
              )}
              <div className="flex items-center gap-3 mt-3">
                {profile.experience_years && (
                  <span className="text-xs bg-white/10 text-white px-3 py-1 rounded-full">경력 {profile.experience_years}년</span>
                )}
                {(profile.specialties ?? []).map(s => (
                  <span key={s} className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* 소개 */}
        {profile.introduction && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3">소개</h2>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{profile.introduction}</p>
          </div>
        )}

        {/* 강점 */}
        {(profile.highlights ?? []).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3">강점</h2>
            <div className="space-y-2">
              {profile.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 shrink-0">&#x2713;</span>
                  <span className="text-sm text-gray-700">{h}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 서비스 지역 */}
        {Object.keys(countryMap).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3">서비스 지역</h2>
            <div className="space-y-3">
              {Object.entries(countryMap).map(([code, cities]) => (
                <div key={code}>
                  <p className="text-sm font-medium text-gray-800 mb-1">{getCountryName(code)}</p>
                  {cities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {cities.map(c => (
                        <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
