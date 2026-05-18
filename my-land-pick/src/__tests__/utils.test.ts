import { calculateTotalPeople, formatDate, hotelGradeLabel, getStatusLabel } from '@/lib/utils'

describe('calculateTotalPeople', () => {
  it('성인 + 아동 + 영유아 + 인솔자 합산', () => {
    expect(calculateTotalPeople({ adults: 10, children: 5, infants: 2, leaders: 1 })).toBe(18)
  })

  it('모든 값이 0이면 0 반환', () => {
    expect(calculateTotalPeople({ adults: 0, children: 0, infants: 0, leaders: 0 })).toBe(0)
  })

  it('일부 값만 있어도 올바르게 합산', () => {
    expect(calculateTotalPeople({ adults: 20, children: 0, infants: 0, leaders: 2 })).toBe(22)
  })
})

describe('hotelGradeLabel', () => {
  it('숫자를 성급 레이블로 변환', () => {
    expect(hotelGradeLabel(5)).toBe('5성급')
    expect(hotelGradeLabel(3)).toBe('3성급')
  })
})

describe('getStatusLabel', () => {
  it('알려진 상태를 한국어로 변환', () => {
    expect(getStatusLabel('open')).toBe('견적 접수 중')
    expect(getStatusLabel('finalized')).toBe('최종 확정')
  })

  it('알 수 없는 상태는 그대로 반환', () => {
    expect(getStatusLabel('unknown_status')).toBe('unknown_status')
  })
})

import { formatPhoneByCountry } from '@/lib/phoneFormat'

describe('formatPhoneByCountry', () => {
  it('한국 +82 모바일 포맷', () => {
    expect(formatPhoneByCountry('+82', '01012345678')).toBe('010-1234-5678')
  })
  it('한국 +82 앞자리만 있을 때', () => {
    expect(formatPhoneByCountry('+82', '010123')).toBe('010-123')
  })
  it('한국 +82 02 지역번호 포맷', () => {
    expect(formatPhoneByCountry('+82', '0212345678')).toBe('02-1234-5678')
  })
  it('미국 +1 포맷', () => {
    expect(formatPhoneByCountry('+1', '2125551234')).toBe('(212) 555-1234')
  })
  it('미국 +1 입력 중간', () => {
    expect(formatPhoneByCountry('+1', '21255')).toBe('(212) 55')
  })
  it('싱가포르 +65 포맷', () => {
    expect(formatPhoneByCountry('+65', '91234567')).toBe('9123-4567')
  })
  it('홍콩 +852 포맷', () => {
    expect(formatPhoneByCountry('+852', '91234567')).toBe('9123-4567')
  })
  it('일본 +81 포맷', () => {
    expect(formatPhoneByCountry('+81', '09012345678')).toBe('090-1234-5678')
  })
  it('중국 +86 포맷', () => {
    expect(formatPhoneByCountry('+86', '13812345678')).toBe('138-1234-5678')
  })
  it('태국 +66 포맷', () => {
    expect(formatPhoneByCountry('+66', '0812345678')).toBe('081-234-5678')
  })
  it('베트남 +84 포맷', () => {
    expect(formatPhoneByCountry('+84', '0912345678')).toBe('091-234-5678')
  })
  it('인도네시아 +62 포맷', () => {
    expect(formatPhoneByCountry('+62', '08123456789')).toBe('0812-3456-789')
  })
  it('말레이시아 +60 포맷', () => {
    expect(formatPhoneByCountry('+60', '0123456789')).toBe('012-345-6789')
  })
  it('필리핀 +63 포맷', () => {
    expect(formatPhoneByCountry('+63', '09171234567')).toBe('0917-123-4567')
  })
  it('대만 +886 포맷', () => {
    expect(formatPhoneByCountry('+886', '0912345678')).toBe('091-234-5678')
  })
  it('지원하지 않는 국가는 숫자만', () => {
    expect(formatPhoneByCountry('+49', '01701234567')).toBe('01701234567')
  })
  it('빈 문자열 반환', () => {
    expect(formatPhoneByCountry('+82', '')).toBe('')
  })
})
