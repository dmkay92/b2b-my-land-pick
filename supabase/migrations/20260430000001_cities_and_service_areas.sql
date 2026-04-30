-- cities 마스터 테이블
CREATE TABLE cities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code text NOT NULL,
  city_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(country_code, city_name)
);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
GRANT ALL ON cities TO service_role;
GRANT ALL ON cities TO authenticated;

-- profiles에 service_areas 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS service_areas jsonb DEFAULT '[]';

-- 초기 도시 데이터
INSERT INTO cities (country_code, city_name, sort_order) VALUES
  ('JP', '도쿄', 1), ('JP', '오사카', 2), ('JP', '교토', 3), ('JP', '후쿠오카', 4),
  ('JP', '삿포로', 5), ('JP', '나고야', 6), ('JP', '오키나와', 7), ('JP', '나라', 8),
  ('JP', '고베', 9), ('JP', '히로시마', 10),
  ('VN', '하노이', 1), ('VN', '호치민', 2), ('VN', '다낭', 3), ('VN', '나트랑', 4),
  ('VN', '푸꾸옥', 5), ('VN', '하롱베이', 6), ('VN', '달랏', 7), ('VN', '사파', 8),
  ('CN', '베이징', 1), ('CN', '상하이', 2), ('CN', '광저우', 3), ('CN', '선전', 4),
  ('CN', '청두', 5), ('CN', '시안', 6), ('CN', '항저우', 7), ('CN', '칭다오', 8),
  ('FR', '파리', 1), ('FR', '니스', 2), ('FR', '리옹', 3), ('FR', '마르세유', 4),
  ('FR', '보르도', 5), ('FR', '스트라스부르', 6)
ON CONFLICT DO NOTHING;
