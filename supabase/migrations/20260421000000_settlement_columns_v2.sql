-- Rebuild quote_settlements with finalized column structure
DROP TABLE IF EXISTS quote_settlements;

CREATE TABLE quote_settlements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL UNIQUE,
  quote_id uuid REFERENCES quotes(id) NOT NULL,
  landco_id uuid REFERENCES profiles(id) NOT NULL,
  agency_id uuid REFERENCES profiles(id) NOT NULL,

  landco_quote_total numeric NOT NULL,       -- 랜드사 견적가 (원본)
  platform_fee_rate numeric NOT NULL,        -- 플랫폼 수수료율 (예: 0.05)
  platform_fee numeric NOT NULL,             -- 플랫폼 수수료
  agency_markup numeric NOT NULL DEFAULT 0,  -- 여행사 마크업
  agency_commission_rate numeric NOT NULL DEFAULT 1.0, -- 여행사 커미션율
  platform_gross_revenue numeric NOT NULL,   -- 플랫폼 총 수익 (platform_fee + agency_markup)
  agency_payout numeric NOT NULL DEFAULT 0,  -- 여행사 지급액 (agency_markup × agency_commission_rate)
  platform_net_revenue numeric NOT NULL,     -- 플랫폼 순수익 (platform_gross_revenue - agency_payout)
  landco_payout numeric NOT NULL,            -- 랜드사 수취액 (landco_quote_total - platform_fee)
  gmv numeric NOT NULL,                      -- 총 거래액 (landco_quote_total + agency_markup)

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
