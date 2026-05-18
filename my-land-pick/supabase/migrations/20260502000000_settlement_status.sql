-- 정산 관리 상태 컬럼 추가
ALTER TABLE quote_settlements
  ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS landco_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS agency_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS memo text;

-- 기존 settled 플래그 기반으로 상태 마이그레이션
UPDATE quote_settlements
SET settlement_status = 'paid'
WHERE landco_settled = true AND agency_settled = true;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_quote_settlements_status
  ON quote_settlements (settlement_status);
