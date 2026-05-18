-- profiles 에 seq_id 컬럼 추가 (여행사/랜드사 각각 독립 순번)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS seq_id INTEGER;

-- 기존 데이터: 가입일 오름차순으로 순번 할당
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY role ORDER BY created_at ASC) AS rn
  FROM public.profiles
  WHERE role IN ('agency', 'landco')
)
UPDATE public.profiles p
SET seq_id = r.rn
FROM ranked r
WHERE p.id = r.id;

-- 시퀀스 생성 후 현재 최대값 다음부터 시작
CREATE SEQUENCE IF NOT EXISTS public.agency_seq;
CREATE SEQUENCE IF NOT EXISTS public.landco_seq;

SELECT setval(
  'public.agency_seq',
  COALESCE((SELECT MAX(seq_id) FROM public.profiles WHERE role = 'agency'), 0) + 1,
  false
);
SELECT setval(
  'public.landco_seq',
  COALESCE((SELECT MAX(seq_id) FROM public.profiles WHERE role = 'landco'), 0) + 1,
  false
);

-- 신규 가입 시 자동 seq_id 할당 트리거
CREATE OR REPLACE FUNCTION public.assign_profile_seq_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'agency' THEN
    NEW.seq_id := nextval('public.agency_seq');
  ELSIF NEW.role = 'landco' THEN
    NEW.seq_id := nextval('public.landco_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_profile_seq ON public.profiles;
CREATE TRIGGER trg_assign_profile_seq
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_profile_seq_id();
