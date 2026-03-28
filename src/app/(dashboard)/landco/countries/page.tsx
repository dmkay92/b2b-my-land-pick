import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCountryName } from '@/lib/utils'

export default async function LandcoCountriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('country_codes, company_name')
    .eq('id', user.id)
    .single()

  const countryCodes = (profile?.country_codes ?? []) as string[]

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">담당 국가</h1>
      <p className="text-sm text-gray-400 mb-6">견적 요청을 수신할 수 있는 국가 목록입니다. 변경이 필요하면 관리자에게 문의하세요.</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {countryCodes.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-3xl mb-3">🌐</p>
            <p className="text-sm">담당 국가가 지정되지 않았습니다.</p>
            <p className="text-xs mt-1">관리자에게 국가 배정을 요청하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {countryCodes.map(code => (
              <div
                key={code}
                className="flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-3"
              >
                <span className="text-lg">🌏</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{getCountryName(code)}</p>
                  <p className="text-xs text-gray-400">{code}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
