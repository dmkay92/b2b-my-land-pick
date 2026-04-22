-- B2B 대리점 정산 모델: 3개 신규 테이블

-- 1. 플랫폼 설정 (마진율 등)
CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES ('margin_rate', '0.05');

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage platform_settings"
  ON platform_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Authenticated users can read platform_settings"
  ON platform_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 2. 대리점 임시 마크업
CREATE TABLE agency_markups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE NOT NULL,
  agency_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  markup_per_person numeric NOT NULL DEFAULT 0,
  markup_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(quote_id, agency_id)
);

ALTER TABLE agency_markups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency can manage own markups"
  ON agency_markups FOR ALL
  USING (agency_id = (select auth.uid()));

CREATE POLICY "Admin can read all markups"
  ON agency_markups FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- 3. 정산 데이터
CREATE TABLE quote_settlements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL UNIQUE,
  quote_id uuid REFERENCES quotes(id) NOT NULL,
  landco_id uuid REFERENCES profiles(id) NOT NULL,
  agency_id uuid REFERENCES profiles(id) NOT NULL,
  landco_amount numeric NOT NULL,
  platform_margin numeric NOT NULL,
  platform_margin_rate numeric NOT NULL,
  agency_markup numeric NOT NULL,
  total_amount numeric NOT NULL,
  landco_settled boolean DEFAULT false,
  agency_settled boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quote_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency can read own settlements"
  ON quote_settlements FOR SELECT
  USING (agency_id = (select auth.uid()));

CREATE POLICY "Landco can read own settlements"
  ON quote_settlements FOR SELECT
  USING (landco_id = (select auth.uid()));

CREATE POLICY "Admin can manage all settlements"
  ON quote_settlements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Agency can insert settlements on confirm"
  ON quote_settlements FOR INSERT
  WITH CHECK (agency_id = (select auth.uid()));
