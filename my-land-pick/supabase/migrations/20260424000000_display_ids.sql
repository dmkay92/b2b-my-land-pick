-- =============================================================
-- 표시용 ID (display_id) 도입
-- 내부 PK(uuid)는 유지, 사용자에게 보여주는 식별번호 추가
-- =============================================================

-- 1. 채번 함수
CREATE OR REPLACE FUNCTION generate_display_id(prefix text, use_date boolean DEFAULT true)
RETURNS text AS $$
DECLARE
  today text;
  seq_name text;
  next_val bigint;
BEGIN
  IF use_date THEN
    today := to_char(now(), 'YYYYMMDD');
    seq_name := 'display_id_' || lower(prefix) || '_' || today;
  ELSE
    seq_name := 'display_id_' || lower(prefix);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = seq_name) THEN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  END IF;

  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;

  IF use_date THEN
    RETURN prefix || '-' || today || '-' || lpad(next_val::text, 6, '0');
  ELSE
    RETURN prefix || lpad(next_val::text, 6, '0');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. 각 테이블에 display_id 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_id text UNIQUE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS display_id text UNIQUE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS display_id text UNIQUE;
ALTER TABLE quote_settlements ADD COLUMN IF NOT EXISTS display_id text UNIQUE;
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS display_id text UNIQUE;
ALTER TABLE payment_installments ADD COLUMN IF NOT EXISTS display_id text UNIQUE;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS display_id text UNIQUE;

-- 3. 트리거 함수들

-- profiles: role에 따라 A/L 접두사
CREATE OR REPLACE FUNCTION set_display_id_profiles()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    IF NEW.role = 'agency' THEN
      NEW.display_id := generate_display_id('A', false);
    ELSIF NEW.role = 'landco' THEN
      NEW.display_id := generate_display_id('L', false);
    ELSIF NEW.role = 'admin' THEN
      NEW.display_id := generate_display_id('ADM', false);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_display_id_quote_requests()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('REQ', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_display_id_quotes()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('QOT', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_display_id_quote_settlements()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('STL', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_display_id_payment_schedules()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('PSC', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_display_id_payment_installments()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('PIN', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_display_id_payment_transactions()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('TXN', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 트리거 생성
DROP TRIGGER IF EXISTS trg_display_id_profiles ON profiles;
CREATE TRIGGER trg_display_id_profiles
  BEFORE INSERT ON profiles FOR EACH ROW
  EXECUTE FUNCTION set_display_id_profiles();

DROP TRIGGER IF EXISTS trg_display_id_quote_requests ON quote_requests;
CREATE TRIGGER trg_display_id_quote_requests
  BEFORE INSERT ON quote_requests FOR EACH ROW
  EXECUTE FUNCTION set_display_id_quote_requests();

DROP TRIGGER IF EXISTS trg_display_id_quotes ON quotes;
CREATE TRIGGER trg_display_id_quotes
  BEFORE INSERT ON quotes FOR EACH ROW
  EXECUTE FUNCTION set_display_id_quotes();

DROP TRIGGER IF EXISTS trg_display_id_quote_settlements ON quote_settlements;
CREATE TRIGGER trg_display_id_quote_settlements
  BEFORE INSERT ON quote_settlements FOR EACH ROW
  EXECUTE FUNCTION set_display_id_quote_settlements();

DROP TRIGGER IF EXISTS trg_display_id_payment_schedules ON payment_schedules;
CREATE TRIGGER trg_display_id_payment_schedules
  BEFORE INSERT ON payment_schedules FOR EACH ROW
  EXECUTE FUNCTION set_display_id_payment_schedules();

DROP TRIGGER IF EXISTS trg_display_id_payment_installments ON payment_installments;
CREATE TRIGGER trg_display_id_payment_installments
  BEFORE INSERT ON payment_installments FOR EACH ROW
  EXECUTE FUNCTION set_display_id_payment_installments();

DROP TRIGGER IF EXISTS trg_display_id_payment_transactions ON payment_transactions;
CREATE TRIGGER trg_display_id_payment_transactions
  BEFORE INSERT ON payment_transactions FOR EACH ROW
  EXECUTE FUNCTION set_display_id_payment_transactions();

-- 5. 기존 데이터 백필
UPDATE profiles SET display_id = generate_display_id(
  CASE WHEN role = 'agency' THEN 'A' WHEN role = 'landco' THEN 'L' ELSE 'ADM' END, false
) WHERE display_id IS NULL;

UPDATE quote_requests SET display_id = generate_display_id('REQ', true) WHERE display_id IS NULL;
UPDATE quotes SET display_id = generate_display_id('QOT', true) WHERE display_id IS NULL;
UPDATE quote_settlements SET display_id = generate_display_id('STL', true) WHERE display_id IS NULL;
UPDATE payment_schedules SET display_id = generate_display_id('PSC', true) WHERE display_id IS NULL;
UPDATE payment_installments SET display_id = generate_display_id('PIN', true) WHERE display_id IS NULL;
UPDATE payment_transactions SET display_id = generate_display_id('TXN', true) WHERE display_id IS NULL;
