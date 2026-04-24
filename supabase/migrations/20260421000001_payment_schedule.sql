-- Payment schedule system: 3 tables

-- 1. 결제 스케줄
CREATE TABLE payment_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL UNIQUE,
  settlement_id uuid REFERENCES quote_settlements(id),
  template_type text NOT NULL CHECK (template_type IN ('standard', 'large_event', 'onetime')),
  total_amount numeric NOT NULL,
  total_people integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency can read own schedules" ON payment_schedules FOR SELECT
  USING (request_id IN (SELECT id FROM quote_requests WHERE agency_id = (select auth.uid())));
CREATE POLICY "Agency can insert own schedules" ON payment_schedules FOR INSERT
  WITH CHECK (request_id IN (SELECT id FROM quote_requests WHERE agency_id = (select auth.uid())));
CREATE POLICY "Agency can update own schedules" ON payment_schedules FOR UPDATE
  USING (request_id IN (SELECT id FROM quote_requests WHERE agency_id = (select auth.uid())));
CREATE POLICY "Landco can read related schedules" ON payment_schedules FOR SELECT
  USING (settlement_id IN (SELECT id FROM quote_settlements WHERE landco_id = (select auth.uid())));
CREATE POLICY "Admin can manage all schedules" ON payment_schedules FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

-- 2. 결제 단계
CREATE TABLE payment_installments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid REFERENCES payment_schedules(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  rate numeric NOT NULL,
  amount numeric NOT NULL,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  allow_split boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read installments via schedule" ON payment_installments FOR SELECT
  USING (schedule_id IN (SELECT id FROM payment_schedules));
CREATE POLICY "Users can manage installments via schedule" ON payment_installments FOR ALL
  USING (schedule_id IN (SELECT id FROM payment_schedules));

-- 3. 개별 거래
CREATE TABLE payment_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id uuid REFERENCES payment_installments(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('virtual_account', 'card_link', 'card_keyin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  pg_transaction_id text,
  pg_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read transactions via installment" ON payment_transactions FOR SELECT
  USING (installment_id IN (SELECT id FROM payment_installments));
CREATE POLICY "Users can manage transactions via installment" ON payment_transactions FOR ALL
  USING (installment_id IN (SELECT id FROM payment_installments));
