import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCountryName } from '@/lib/utils'
import { BackButton } from '@/components/BackButton'
import { ProfileDescription } from '@/components/ProfileDescription'

export default async function LandcoCountriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('country_codes, service_areas, company_name')
    .eq('id', user.id)
    .single()

  const countryCodes = (profile?.country_codes ?? []) as string[]
  const serviceAreas = (profile?.service_areas ?? []) as { country: string; city: string }[]

  // 국가별 도시 그룹핑
  const countryMap: Record<string, string[]> = {}
  countryCodes.forEach(code => { countryMap[code] = [] })
  serviceAreas.forEach(area => {
    if (!countryMap[area.country]) countryMap[area.country] = []
    if (!countryMap[area.country].includes(area.city)) {
      countryMap[area.country].push(area.city)
    }
  })

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <BackButton href="/landco/requests" />
      <h1 className="text-2xl font-bold mb-2">담당 지역</h1>
      <p className="text-sm text-gray-400 mb-6">견적 요청을 수신할 수 있는 지역 목록입니다. 변경이 필요하면 관리자에게 문의하세요.</p>

      <ProfileDescription />

      {countryCodes.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="text-center py-10 text-gray-400">
            <p className="text-3xl mb-3">🌐</p>
            <p className="text-sm">담당 지역이 지정되지 않았습니다.</p>
            <p className="text-xs mt-1">관리자에게 지역 배정을 요청하세요.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {countryCodes.map(code => {
            const cities = countryMap[code] ?? []
            return (
              <div key={code} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <span className="text-lg">🌏</span>
                  <div>
                    <span className="text-sm font-bold text-gray-900">{getCountryName(code)}</span>
                    <span className="text-xs text-gray-400 ml-2">{code}</span>
                  </div>
                  <span className="ml-auto text-xs text-gray-400">{cities.length}개 도시</span>
                </div>
                {cities.length > 0 ? (
                  <div className="px-5 py-3 flex flex-wrap gap-2">
                    {cities.map(city => (
                      <span key={city} className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                        {city}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-3 text-xs text-gray-400">도시 정보 없음</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
