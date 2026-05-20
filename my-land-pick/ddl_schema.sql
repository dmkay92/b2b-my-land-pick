-- ============================================================
-- 마이랜드픽 (my-land-pick) 전체 DDL
-- Generated: 2026-05-20
-- 비즈니스 로직 없음 — 순수 테이블/인덱스만 포함
-- display_id, updated_at, 프로필 생성 등은 애플리케이션에서 처리
--
-- [RLS 안내]
-- 각 테이블에 ENABLE ROW LEVEL SECURITY가 설정되어 있습니다.
-- RLS 정책(POLICY)은 인프라 환경에 맞게 별도 작성이 필요합니다.
-- RLS가 불필요한 경우 해당 라인을 제거해도 무방합니다.
--
-- [암호화 안내]
-- profiles 테이블의 아래 컬럼은 AES-256-GCM으로 암호화되어 저장됩니다.
-- 암호화 대상: email, representative_name, phone_landline, phone_mobile,
--              bank_name, bank_account, bank_holder, business_registration_number
-- 암/복호화는 애플리케이션(src/lib/cipher.ts)에서 처리하며,
-- AWS KMS SecretKey가 필요합니다. (보안팀 발급)
-- 암호화된 값은 Base64 문자열이므로 컬럼 타입은 text를 유지합니다.
-- ============================================================

-- ========================
-- TABLES
-- ========================

-- 1. profiles (사용자)
-- [ENCRYPTED] 표시된 컬럼은 AES-256-GCM 암호화 저장 (Base64 text)
CREATE TABLE public.profiles (
  id                            uuid PRIMARY KEY,
  email                         text NOT NULL,              -- [ENCRYPTED]
  role                          text NOT NULL CHECK (role IN ('agency', 'landco', 'admin')),
  company_name                  text NOT NULL,
  status                        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  country_codes                 text[] DEFAULT '{}',
  service_areas                 jsonb DEFAULT '[]',
  seq_id                        integer,
  display_id                    text UNIQUE,
  business_registration_number  text,                       -- [ENCRYPTED]
  representative_name           text,                       -- [ENCRYPTED]
  phone_landline                text,                       -- [ENCRYPTED]
  phone_mobile                  text,                       -- [ENCRYPTED]
  bank_name                     text,                       -- [ENCRYPTED]
  bank_account                  text,                       -- [ENCRYPTED]
  bank_holder                   text,                       -- [ENCRYPTED]
  document_biz_url              text,
  document_bank_url             text,
  partner_code                  text,
  description                   text DEFAULT '',
  introduction                  text DEFAULT '',
  profile_image                 text DEFAULT '',
  specialties                   text[] DEFAULT '{}',
  experience_years              integer,
  highlights                    text[] DEFAULT '{}',
  approved_at                   timestamptz,
  created_at                    timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. quote_requests (견적 요청)
CREATE TABLE public.quote_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL REFERENCES public.profiles,
  event_name            text NOT NULL,
  destination_country   text NOT NULL,
  destination_city      text NOT NULL,
  depart_date           date NOT NULL,
  return_date           date NOT NULL,
  adults                int NOT NULL DEFAULT 0,
  children              int NOT NULL DEFAULT 0,
  infants               int NOT NULL DEFAULT 0,
  leaders               int NOT NULL DEFAULT 0,
  hotel_grade           int CHECK (hotel_grade IN (3, 4, 5)),
  deadline              date NOT NULL,
  notes                 text,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'payment_pending', 'finalized')),
  quote_type            text NOT NULL DEFAULT 'hotel_land' CHECK (quote_type IN ('hotel_land', 'land')),
  shopping_option       boolean,
  shopping_count        int,
  tip_option            boolean,
  local_option          boolean,
  attachment_url        text,
  attachment_name       text,
  flight_schedule       text,
  travel_type           text,
  religion_type         text,
  display_id            text UNIQUE,
  closed_at             timestamptz,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

-- 3. quotes (견적서)
CREATE TABLE public.quotes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES public.quote_requests ON DELETE CASCADE,
  landco_id         uuid NOT NULL REFERENCES public.profiles,
  version           int NOT NULL DEFAULT 1,
  file_url          text NOT NULL,
  file_name         text NOT NULL,
  status            text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'selected', 'finalized', 'rejected')),
  itinerary         jsonb,
  pricing           jsonb,
  pricing_mode      text DEFAULT 'detailed' CHECK (pricing_mode IN ('detailed', 'summary')),
  summary_total     numeric DEFAULT 0,
  summary_per_person numeric DEFAULT 0,
  includes          text,
  excludes          text,
  display_id        text UNIQUE,
  submitted_at      timestamptz DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- 4. quote_selections (견적 선택)
CREATE TABLE public.quote_selections (
  request_id          uuid PRIMARY KEY REFERENCES public.quote_requests,
  selected_quote_id   uuid NOT NULL REFERENCES public.quotes,
  landco_id           uuid NOT NULL REFERENCES public.profiles,
  payment_memo        text,
  selected_at         timestamptz DEFAULT now(),
  finalized_at        timestamptz
);
ALTER TABLE public.quote_selections ENABLE ROW LEVEL SECURITY;

-- 5. quote_abandonments (견적 포기)
CREATE TABLE public.quote_abandonments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.quote_requests,
  landco_id     uuid NOT NULL REFERENCES public.profiles,
  reason        text,
  abandoned_at  timestamptz DEFAULT now()
);
ALTER TABLE public.quote_abandonments ENABLE ROW LEVEL SECURITY;

-- 6. chat_rooms (채팅방)
CREATE TABLE public.chat_rooms (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid NOT NULL REFERENCES public.quote_requests ON DELETE CASCADE,
  agency_id               uuid NOT NULL REFERENCES public.profiles,
  landco_id               uuid NOT NULL REFERENCES public.profiles,
  agency_last_read_at     timestamptz,
  landco_last_read_at     timestamptz,
  agency_email_sent_at    timestamptz,
  landco_email_sent_at    timestamptz,
  created_at              timestamptz DEFAULT now(),
  UNIQUE(request_id, landco_id)
);
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- 7. messages (채팅 메시지)
CREATE TABLE public.messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES public.chat_rooms ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES public.profiles,
  content       text,
  file_url      text,
  file_name     text,
  message_type  text DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'system', 'approval_request', 'approval_result')),
  metadata      jsonb,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 8. notifications (알림)
CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles,
  type        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 9. platform_settings (플랫폼 설정)
CREATE TABLE public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- 10. agency_markups (여행사 마크업)
CREATE TABLE public.agency_markups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            uuid NOT NULL REFERENCES public.quotes ON DELETE CASCADE,
  agency_id           uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  markup_per_person   numeric NOT NULL DEFAULT 0,
  markup_total        numeric NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(quote_id, agency_id)
);
ALTER TABLE public.agency_markups ENABLE ROW LEVEL SECURITY;

-- 11. quote_settlements (정산 산출)
CREATE TABLE public.quote_settlements (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                uuid NOT NULL UNIQUE REFERENCES public.quote_requests,
  quote_id                  uuid NOT NULL REFERENCES public.quotes,
  landco_id                 uuid NOT NULL REFERENCES public.profiles,
  agency_id                 uuid NOT NULL REFERENCES public.profiles,
  landco_quote_total        numeric NOT NULL,
  platform_fee_rate         numeric NOT NULL,
  platform_fee              numeric NOT NULL,
  agency_commission         numeric NOT NULL DEFAULT 0,
  agency_commission_rate    numeric NOT NULL DEFAULT 1.0,
  platform_gross_revenue    numeric NOT NULL,
  agency_payout             numeric NOT NULL DEFAULT 0,
  platform_net_revenue      numeric NOT NULL,
  landco_payout             numeric NOT NULL,
  gmv                       numeric NOT NULL,
  landco_settled            boolean DEFAULT false,
  agency_settled            boolean DEFAULT false,
  settlement_status         text NOT NULL DEFAULT 'pending',
  confirmed_at              timestamptz,
  landco_paid_at            timestamptz,
  agency_paid_at            timestamptz,
  settlement_memo           text,
  display_id                text UNIQUE,
  created_at                timestamptz DEFAULT now()
);
ALTER TABLE public.quote_settlements ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_quote_settlements_status ON quote_settlements (settlement_status);

-- 12. payment_schedules (결제 일정)
CREATE TABLE public.payment_schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL UNIQUE REFERENCES public.quote_requests,
  settlement_id     uuid REFERENCES public.quote_settlements,
  template_type     text NOT NULL CHECK (template_type IN ('two_time', 'large_event', 'one_time', 'post_travel')),
  approval_status   text DEFAULT 'approved' CHECK (approval_status IN ('approved', 'pending', 'rejected')),
  total_amount      numeric NOT NULL,
  total_people      integer NOT NULL,
  display_id        text UNIQUE,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

-- 13. payment_installments (결제 회차)
CREATE TABLE public.payment_installments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id         uuid NOT NULL REFERENCES public.payment_schedules ON DELETE CASCADE,
  request_id          uuid REFERENCES public.quote_requests,
  label               text NOT NULL,
  rate                numeric NOT NULL,
  amount              numeric NOT NULL,
  paid_amount         numeric NOT NULL DEFAULT 0,
  due_date            date NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled', 'verifying')),
  allow_split         boolean NOT NULL DEFAULT false,
  settlement_status   text,
  paid_at             timestamptz,
  display_id          text UNIQUE,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;

-- 14. payment_transactions (결제 트랜잭션)
CREATE TABLE public.payment_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id        uuid NOT NULL REFERENCES public.payment_installments ON DELETE CASCADE,
  amount                numeric NOT NULL,
  base_amount           numeric,
  card_surcharge_rate   numeric DEFAULT 0,
  card_surcharge        numeric DEFAULT 0,
  payment_method        text NOT NULL CHECK (payment_method IN ('virtual_account', 'card_link', 'card_keyin')),
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  pg_transaction_id     text,
  pg_response           jsonb,
  virtual_account_info  jsonb,
  display_id            text UNIQUE,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- 15. additional_settlements (추가 정산)
CREATE TABLE public.additional_settlements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES public.quote_requests,
  landco_id         uuid NOT NULL REFERENCES public.profiles,
  sequence_number   int NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  items             jsonb NOT NULL DEFAULT '[]',
  memo              text,
  receipt_urls      text[] DEFAULT '{}',
  total_amount      numeric NOT NULL DEFAULT 0,
  reviewed_by       uuid REFERENCES public.profiles,
  reviewed_at       timestamptz,
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE public.additional_settlements ENABLE ROW LEVEL SECURITY;

-- 16. settlement_ledger (정산 히스토리)
CREATE TABLE public.settlement_ledger (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id              text UNIQUE,
  request_id              uuid NOT NULL REFERENCES public.quote_requests,
  installment_id          uuid NOT NULL UNIQUE REFERENCES public.payment_installments,
  installment_label       text NOT NULL,
  installment_rate        numeric NOT NULL,
  paid_amount             numeric NOT NULL,
  platform_fee            numeric NOT NULL DEFAULT 0,
  agency_fee              numeric NOT NULL DEFAULT 0,
  landco_payout_amount    numeric NOT NULL DEFAULT 0,
  landco_payout_status    text NOT NULL DEFAULT 'reviewing' CHECK (landco_payout_status IN ('reviewing', 'confirmed', 'paid')),
  landco_confirmed_at     timestamptz,
  landco_paid_at          timestamptz,
  agency_payout_status    text NOT NULL DEFAULT 'accrued' CHECK (agency_payout_status IN ('accrued', 'payable', 'paid')),
  agency_paid_at          timestamptz,
  created_by              uuid REFERENCES public.profiles,
  created_at              timestamptz DEFAULT now()
);
ALTER TABLE public.settlement_ledger ENABLE ROW LEVEL SECURITY;

-- 17. cities (도시 마스터)
CREATE TABLE public.cities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    text NOT NULL,
  city_name       text NOT NULL,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(country_code, city_name)
);
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- 18. quote_templates (견적 템플릿)
CREATE TABLE public.quote_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landco_id   uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  name        text NOT NULL,
  itinerary   jsonb NOT NULL DEFAULT '[]',
  pricing     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

-- 19. admin_action_logs (관리자 액션 로그)
CREATE TABLE public.admin_action_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  uuid REFERENCES public.profiles,
  action_type     text NOT NULL,
  detail          jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

-- 20. terms_consents (약관 동의 기록)
CREATE TABLE public.terms_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_type      text NOT NULL CHECK (terms_type IN ('agency_terms', 'privacy')),
  terms_version   text NOT NULL DEFAULT 'v1.0',
  agreed_at       timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  UNIQUE(user_id, terms_type, terms_version)
);
ALTER TABLE public.terms_consents ENABLE ROW LEVEL SECURITY;

-- 21. notices (공지사항)
CREATE TABLE public.notices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  content     text NOT NULL DEFAULT '',
  target      text NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'agency', 'landco')),
  pinned      boolean NOT NULL DEFAULT false,
  published   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

-- ========================
-- STORAGE (참고용 — 파일 저장소는 별도 구성 필요)
-- ========================
-- 아래 버킷은 애플리케이션 파일 저장에 사용됩니다.
-- 실제 오브젝트 스토리지(S3, GCS 등)는 인프라 환경에 맞게 별도 구성해주세요.
--   • quotes          (비공개) — 견적서 첨부 파일
--   • signup-documents (비공개) — 가입 서류
--   • assets          (공개)   — 정적 리소스
