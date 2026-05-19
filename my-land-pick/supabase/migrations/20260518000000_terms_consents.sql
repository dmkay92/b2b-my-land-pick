-- 약관 동의 기록 테이블
CREATE TABLE IF NOT EXISTS terms_consents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_type text NOT NULL CHECK (terms_type IN ('agency_terms', 'privacy')),
  terms_version text NOT NULL DEFAULT 'v1.0',
  agreed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  UNIQUE(user_id, terms_type, terms_version)
);

-- RLS
ALTER TABLE terms_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own consents"
  ON terms_consents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert consents"
  ON terms_consents FOR INSERT
  WITH CHECK (true);

-- Admin can read all
CREATE POLICY "Admin can read all consents"
  ON terms_consents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
