export interface PeopleCount {
  adults: number
  children: number
  infants: number
  leaders: number
}

export function calculateTotalPeople(people: PeopleCount): number {
  return people.adults + people.children + people.infants + people.leaders
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`
}

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']

export function formatDateWithDay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  const dow = new Date(Number(year), Number(month) - 1, Number(day)).getDay()
  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일 (${DOW_KO[dow]})`
}

export function hotelGradeLabel(grade: number): string {
  return `${grade}성급`
}

const COUNTRY_NAMES: Record<string, string> = {
  JP: '일본', CN: '중국', TH: '태국', VN: '베트남', PH: '필리핀',
  SG: '싱가포르', MY: '말레이시아', ID: '인도네시아', HK: '홍콩', TW: '대만',
  US: '미국', CA: '캐나다', GB: '영국', FR: '프랑스', DE: '독일',
  IT: '이탈리아', ES: '스페인', CH: '스위스', AT: '오스트리아', NL: '네덜란드',
  AU: '호주', NZ: '뉴질랜드', AE: '아랍에미리트', TR: '튀르키예', GR: '그리스',
  PT: '포르투갈', CZ: '체코', HU: '헝가리', PL: '폴란드', HR: '크로아티아',
  MX: '멕시코', IN: '인도', KH: '캄보디아', LA: '라오스', MM: '미얀마',
  NP: '네팔', MV: '몰디브', FJ: '피지', MO: '마카오',
}

export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '견적 접수 중',
    in_progress: '협업 진행 중',
    closed: '마감',
    finalized: '최종 확정',
    pending: '승인 대기',
    approved: '승인됨',
    rejected: '거절됨',
    submitted: '제출됨',
    selected: '선택됨',
  }
  return labels[status] ?? status
}
