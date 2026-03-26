import { calculateTotalPeople } from '@/lib/utils'

interface QuoteRequestInput {
  event_name: string
  destination_country: string
  destination_city: string
  depart_date: string
  return_date: string
  adults: number
  children: number
  infants: number
  leaders: number
  hotel_grade: 3 | 4 | 5
  deadline: string
  notes?: string
}

export function validateQuoteRequest(input: QuoteRequestInput): string[] {
  const errors: string[] = []

  if (new Date(input.return_date) <= new Date(input.depart_date)) {
    errors.push('도착일은 출발일 이후여야 합니다.')
  }

  if (new Date(input.deadline) >= new Date(input.depart_date)) {
    errors.push('견적 마감일은 출발일 이전이어야 합니다.')
  }

  const total = calculateTotalPeople({
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    leaders: input.leaders,
  })
  if (total === 0) {
    errors.push('총 인원은 1명 이상이어야 합니다.')
  }

  return errors
}
