export type UserRole = 'agency' | 'landco' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'rejected'
export type HotelGrade = 3 | 4 | 5
export type QuoteRequestStatus = 'open' | 'in_progress' | 'closed' | 'payment_pending' | 'finalized'
export type QuoteStatus = 'submitted' | 'selected' | 'finalized' | 'rejected'

export interface Profile {
  id: string
  email: string
  role: UserRole
  company_name: string
  status: UserStatus
  country_codes: string[]
  created_at: string
  approved_at: string | null
}

export interface QuoteRequest {
  id: string
  agency_id: string
  event_name: string
  destination_country: string
  destination_city: string
  depart_date: string
  return_date: string
  adults: number
  children: number
  infants: number
  leaders: number
  quote_type: 'hotel_land' | 'land'
  hotel_grade: HotelGrade | null
  shopping_option: boolean | null
  shopping_count: number | null
  tip_option: boolean | null
  local_option: boolean | null
  deadline: string
  notes: string | null
  status: QuoteRequestStatus
  created_at: string
}

export interface Quote {
  id: string
  request_id: string
  landco_id: string
  version: number
  file_url: string
  file_name: string
  status: QuoteStatus
  submitted_at: string
}

export interface QuoteSelection {
  request_id: string
  selected_quote_id: string
  landco_id: string
  selected_at: string
  finalized_at: string | null
  payment_memo: string | null
}

export interface ChatRoom {
  id: string
  request_id: string
  agency_id: string
  landco_id: string
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  sender_id: string
  content: string
  created_at: string
}

export interface AdminActionLog {
  id: string
  target_user_id: string
  action_type: 'status_change' | 'email_change' | 'country_change'
  detail: Record<string, unknown>
  created_at: string
}

export type OvernightType = 'hotel' | 'flight' | 'none'

export interface ItineraryRow {
  area: string
  transport: string
  time: string
  content: string
  meal: string
}

export interface ItineraryDay {
  day: number
  date: string
  rows: ItineraryRow[]
  overnight: {
    type: OvernightType
    stars?: 3 | 4 | 5
    name?: string
  }
  meals?: {
    조식?: { active: boolean; note: string }
    중식?: { active: boolean; note: string }
    석식?: { active: boolean; note: string }
  }
}

export interface PricingRow {
  date: string
  detail: string
  price: number
  count: number
  quantity: number
  currency?: string
}

export interface PricingData {
  호텔: PricingRow[]
  차량: PricingRow[]
  식사: PricingRow[]
  입장료: PricingRow[]
  가이드비용: PricingRow[]
  기타: PricingRow[]
  currencies?: Partial<Record<string, string>>
  exchangeRates?: Partial<Record<string, number>>
}

export interface QuoteDraft {
  id: string
  request_id: string
  landco_id: string
  itinerary: ItineraryDay[]
  pricing: PricingData
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}
