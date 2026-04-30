-- event_number 컬럼 삭제 (display_id로 통합)
ALTER TABLE quote_requests DROP COLUMN IF EXISTS event_number;
