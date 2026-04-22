-- 이벤트 번호 (행사 단위 고유 번호)
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS event_number text UNIQUE;

-- 자동 채번 함수: EVT-{연도}-{4자리 순번}
CREATE OR REPLACE FUNCTION generate_event_number()
RETURNS trigger AS $$
DECLARE
  current_year text;
  next_seq int;
BEGIN
  current_year := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(event_number, '-', 3) AS int)
  ), 0) + 1
  INTO next_seq
  FROM quote_requests
  WHERE event_number LIKE 'EVT-' || current_year || '-%';

  NEW.event_number := 'EVT-' || current_year || '-' || LPAD(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_event_number
  BEFORE INSERT ON quote_requests
  FOR EACH ROW
  WHEN (NEW.event_number IS NULL)
  EXECUTE FUNCTION generate_event_number();

-- 기존 데이터에 번호 부여
DO $$
DECLARE
  r RECORD;
  seq int := 0;
  yr text;
BEGIN
  FOR r IN SELECT id, created_at FROM quote_requests WHERE event_number IS NULL ORDER BY created_at LOOP
    yr := to_char(r.created_at, 'YYYY');
    seq := seq + 1;
    UPDATE quote_requests SET event_number = 'EVT-' || yr || '-' || LPAD(seq::text, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;
