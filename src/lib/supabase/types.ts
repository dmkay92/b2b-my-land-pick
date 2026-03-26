export type UserRole = 'agency' | 'landco' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'rejected'
export type HotelGrade = 3 | 4 | 5
export type QuoteRequestStatus = 'open' | 'in_progress' | 'closed' | 'finalized'
export type QuoteStatus = 'submitted' | 'selected' | 'finalized' | 'rejected'

export interface Profile {
  id: string
  email: string
  role: UserRole
  company_name: string
  status: UserStatus
  country_codes: string[]
  created_at: string
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
  hotel_grade: HotelGrade
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

export interface Notification {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}
