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
