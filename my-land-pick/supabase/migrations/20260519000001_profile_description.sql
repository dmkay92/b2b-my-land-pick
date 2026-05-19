-- 랜드사 소개 필드 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS description text DEFAULT '';
