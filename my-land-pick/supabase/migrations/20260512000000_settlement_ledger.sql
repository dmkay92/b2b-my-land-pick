-- settlement_ledger 테이블 생성
CREATE TABLE settlement_ledger (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id             text UNIQUE,
  request_id             uuid REFERENCES quote_requests(id) NOT NULL,
  installment_id         uuid REFERENCES payment_installments(id) NOT NULL UNIQUE,

  installment_label      text NOT NULL,
  installment_rate       numeric NOT NULL,
  paid_amount            numeric NOT NULL,

  platform_fee           numeric NOT NULL DEFAULT 0,
  agency_fee             numeric NOT NULL DEFAULT 0,
  landco_payout_amount   numeric NOT NULL DEFAULT 0,

  landco_payout_status   text NOT NULL DEFAULT 'reviewing'
    CHECK (landco_payout_status IN ('reviewing', 'confirmed', 'paid')),
  landco_confirmed_at    timestamptz,
  landco_paid_at         timestamptz,

  agency_payout_status   text NOT NULL DEFAULT 'accrued'
    CHECK (agency_payout_status IN ('accrued', 'payable', 'paid')),
  agency_paid_at         timestamptz,

  created_by             uuid REFERENCES profiles(id),
  created_at             timestamptz DEFAULT now()
);

-- display_id 자동 생성 트리거
CREATE TRIGGER set_settlement_ledger_display_id
  BEFORE INSERT ON settlement_ledger
  FOR EACH ROW
  WHEN (NEW.display_id IS NULL)
  EXECUTE FUNCTION set_display_id_trigger('SLD');

-- RLS
ALTER TABLE settlement_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on settlement_ledger"
  ON settlement_ledger FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- payment_installments에 request_id, settlement_status 컬럼 추가
ALTER TABLE payment_installments ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES quote_requests(id);
ALTER TABLE payment_installments ADD COLUMN IF NOT EXISTS settlement_status text DEFAULT NULL;

-- 기존 installments에 request_id 백필
UPDATE payment_installments pi
SET request_id = ps.request_id
FROM payment_schedules ps
WHERE pi.schedule_id = ps.id AND pi.request_id IS NULL;
