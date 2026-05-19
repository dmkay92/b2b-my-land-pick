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
  KR: '한국', JP: '일본', CN: '중국', TW: '대만', HK: '홍콩', MO: '마카오',
  VN: '베트남', TH: '태국', PH: '필리핀', ID: '인도네시아', MY: '말레이시아',
  SG: '싱가포르', KH: '캄보디아', LA: '라오스', MM: '미얀마',
  IN: '인도', NP: '네팔', LK: '스리랑카', MN: '몽골',
  UZ: '우즈베키스탄', KZ: '카자흐스탄',
  AE: 'UAE', TR: '튀르키예', GE: '조지아', IL: '이스라엘', JO: '요르단', OM: '오만',
  US: '미국', CA: '캐나다', MX: '멕시코',
  BR: '브라질', AR: '아르헨티나', PE: '페루', CL: '칠레', CO: '콜롬비아', CU: '쿠바',
  GB: '영국', FR: '프랑스', DE: '독일', IT: '이탈리아', ES: '스페인', PT: '포르투갈',
  NL: '네덜란드', BE: '벨기에', CH: '스위스', AT: '오스트리아',
  CZ: '체코', PL: '폴란드', HU: '헝가리', HR: '크로아티아', GR: '그리스',
  SE: '스웨덴', NO: '노르웨이', FI: '핀란드', DK: '덴마크', IS: '아이슬란드', IE: '아일랜드',
  RO: '루마니아', BG: '불가리아', RS: '세르비아', BA: '보스니아',
  ME: '몬테네그로', SI: '슬로베니아', SK: '슬로바키아',
  EE: '에스토니아', LV: '라트비아', LT: '리투아니아', MT: '몰타',
  AU: '호주', NZ: '뉴질랜드', FJ: '피지', GU: '괌', PW: '팔라우', NC: '뉴칼레도니아',
  EG: '이집트', MA: '모로코', ZA: '남아공', KE: '케냐', TZ: '탄자니아', ET: '에티오피아',
  MV: '몰디브', MU: '모리셔스', RU: '러시아', UA: '우크라이나',
}

export async function GET(request: NextRequest) {
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
