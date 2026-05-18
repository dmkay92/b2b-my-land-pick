-- 견적 종류 컬럼 추가
ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS quote_type text NOT NULL DEFAULT 'hotel_land'
    CHECK (quote_type IN ('hotel_land', 'land'));

-- 랜드 전용 견적은 호텔등급 없음 → nullable로 변경
ALTER TABLE public.quote_requests
  ALTER COLUMN hotel_grade DROP NOT NULL;
