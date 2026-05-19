-- 랜드사 프로필 확장 필드
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_image text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS introduction text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specialties text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience_years integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS highlights text[] DEFAULT '{}';
