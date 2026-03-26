import { validateQuoteRequest } from '@/lib/validators'

describe('validateQuoteRequest', () => {
  const validRequest = {
    event_name: '2026 임직원 워크샵',
    destination_country: 'JP',
    destination_city: '오사카',
    depart_date: '2026-06-15',
    return_date: '2026-06-19',
    adults: 20,
    children: 0,
    infants: 0,
    leaders: 2,
    hotel_grade: 4 as const,
    deadline: '2026-05-01',
  }

  it('유효한 요청은 에러 없음', () => {
    expect(validateQuoteRequest(validRequest)).toEqual([])
  })

  it('도착일이 출발일보다 빠르면 에러', () => {
    const errors = validateQuoteRequest({ ...validRequest, return_date: '2026-06-10' })
    expect(errors).toContain('도착일은 출발일 이후여야 합니다.')
  })

  it('마감일이 출발일보다 늦으면 에러', () => {
    const errors = validateQuoteRequest({ ...validRequest, deadline: '2026-07-01' })
    expect(errors).toContain('견적 마감일은 출발일 이전이어야 합니다.')
  })

  it('총 인원이 0이면 에러', () => {
    const errors = validateQuoteRequest({ ...validRequest, adults: 0, leaders: 0 })
    expect(errors).toContain('총 인원은 1명 이상이어야 합니다.')
  })
})
