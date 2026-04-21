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
  seq_id: number | null
  // 회원가입 wizard 신규 필드
  business_registration_number: string | null
  representative_name: string | null
  phone_landline: string | null
  phone_mobile: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  document_biz_url: string | null
  document_bank_url: string | null
}

export interface FlightEntry {
  dep_date: string  // YYYY-MM-DD 출발 날짜
  code: string      // 편명 (예: KE637)
  dep_time: string  // HH:MM
  arr_date: string  // YYYY-MM-DD 도착 날짜 (익일 가능)
  arr_time: string  // HH:MM
}

export interface FlightSchedule {
  outbound: FlightEntry | null
  inbound: FlightEntry | null
}

export interface QuoteRequest {
  id: string
  agency_id: string
  event_number: string | null
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
  travel_type: string | null
  religion_type: string | null
  status: QuoteRequestStatus
  created_at: string
  flight_schedule: FlightSchedule | null
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
  itinerary?: unknown  // ItineraryDay[] JSON
  pricing?: unknown    // PricingData JSON
  pricing_mode?: 'detailed' | 'summary'
  summary_total?: number
  summary_per_person?: number
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
  pricing_mode?: 'detailed' | 'summary'
  summary_total?: number
  summary_per_person?: number
}

export interface Notification {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface SignupOcrResult {
  business_registration_number: string
  company_name: string
  representative_name: string
}

export interface BankOcrResult {
  bank_name: string
  bank_account: string
  bank_holder: string
}

export interface SignupDraft {
  role: UserRole | null
  step: number
  ocr: {
    biz: SignupOcrResult | null
    bank: BankOcrResult | null
  }
  basicInfo: {
    business_registration_number: string
    company_name: string
    representative_name: string
    email: string
    password: string
    phone_mobile: string
    phone_landline: string
  } | null
  bankInfo: {
    bank_name: string
    bank_account: string
    bank_holder: string
  } | null
  countries: string[]
}

export interface AgencyMarkup {
  id: string
  quote_id: string
  agency_id: string
  markup_per_person: number
  markup_total: number
  created_at: string
  updated_at: string
}

export interface QuoteSettlement {
  id: string
  request_id: string
  quote_id: string
  landco_id: string
  agency_id: string
  landco_quote_total: number
  platform_fee_rate: number
  platform_fee: number
  agency_markup: number
  agency_commission_rate: number
  platform_gross_revenue: number
  agency_payout: number
  platform_net_revenue: number
  landco_payout: number
  gmv: number
  landco_settled: boolean
  agency_settled: boolean
  created_at: string
}

export interface PlatformSetting {
  key: string
  value: unknown
  updated_at: string
}

export type PaymentTemplateType = 'standard' | 'large_event' | 'immediate'
export type PaymentInstallmentStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled'
export type PaymentTransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled'
export type PaymentMethod = 'virtual_account' | 'card_link' | 'card_keyin'

export interface PaymentSchedule {
  id: string
  request_id: string
  settlement_id: string | null
  template_type: PaymentTemplateType
  total_amount: number
  total_people: number
  created_at: string
  updated_at: string
}

export interface PaymentInstallment {
  id: string
  schedule_id: string
  label: string
  rate: number
  amount: number
  paid_amount: number
  due_date: string
  status: PaymentInstallmentStatus
  allow_split: boolean
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface PaymentTransaction {
  id: string
  installment_id: string
  base_amount: number | null
  card_surcharge_rate: number
  card_surcharge: number
  amount: number
  payment_method: PaymentMethod
  status: PaymentTransactionStatus
  pg_transaction_id: string | null
  pg_response: Record<string, unknown> | null
  virtual_account_info: { bank: string; account_number: string; holder: string; expires_at: string } | null
  created_at: string
  updated_at: string
}
