-- quote_requests에 closed_at 컬럼 추가 (취소 시점 추적)
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- 기존 closed 상태의 건에 대해 created_at으로 백필 (정확한 시점은 아니지만 데이터 일관성)
UPDATE public.quote_requests SET closed_at = now() WHERE status = 'closed' AND closed_at IS NULL;
