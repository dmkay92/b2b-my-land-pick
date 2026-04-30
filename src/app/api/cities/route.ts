import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const COUNTRY_NAMES: Record<string, string> = {
  JP: '일본', CN: '중국', VN: '베트남', FR: '프랑스',
  TH: '태국', ID: '인도네시아', PH: '필리핀', MY: '말레이시아',
  SG: '싱가포르', US: '미국', GB: '영국', DE: '독일',
  IT: '이탈리아', ES: '스페인', AU: '호주', NZ: '뉴질랜드',
  TW: '대만', HK: '홍콩', MO: '마카오', KH: '캄보디아',
  MM: '미얀마', LA: '라오스', IN: '인도', NP: '네팔',
  TR: '튀르키예', AE: '아랍에미리트', EG: '이집트', KE: '케냐',
  ZA: '남아프리카', BR: '브라질', MX: '멕시코', PE: '페루',
  CL: '칠레', AR: '아르헨티나', CA: '캐나다', RU: '러시아',
  CH: '스위스', AT: '오스트리아', PT: '포르투갈', GR: '그리스', HR: '크로아티아',
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const country = request.nextUrl.searchParams.get('country')
  const activeOnly = request.nextUrl.searchParams.get('active') === 'true'
  const admin = getAdmin()

  // 랜드사가 서비스하는 지역만 필터 (active=true)
  let activeCities: Set<string> | null = null
  let activeCountries: Set<string> | null = null
  if (activeOnly) {
    const { data: landcos } = await admin
      .from('profiles').select('service_areas')
      .eq('role', 'landco').eq('status', 'approved')
    const allAreas = (landcos ?? []).flatMap(l => (l.service_areas ?? []) as { country: string; city: string }[])
    activeCountries = new Set(allAreas.map(a => a.country))
    activeCities = new Set(allAreas.map(a => `${a.country}:${a.city}`))
  }

  if (!country) {
    const { data } = await admin.from('cities').select('country_code').order('country_code')
    let unique = [...new Set((data ?? []).map(c => c.country_code))]
    if (activeCountries) unique = unique.filter(c => activeCountries!.has(c))
    const countries = unique.map(code => ({
      code,
      name: COUNTRY_NAMES[code] || code,
    }))
    return NextResponse.json({ countries })
  }

  const { data, error } = await admin
    .from('cities').select('*')
    .eq('country_code', country)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let cities = data ?? []
  if (activeCities) {
    cities = cities.filter(c => activeCities!.has(`${c.country_code}:${c.city_name}`))
  }
  return NextResponse.json({ cities })
}
