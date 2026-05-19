-- 공지사항 테이블
CREATE TABLE IF NOT EXISTS notices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  target text NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'agency', 'landco')),
  pinned boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자가 published 공지 조회 가능
CREATE POLICY "Authenticated users can read published notices"
  ON notices FOR SELECT
  USING (published = true);

-- Admin만 모든 CRUD 가능
CREATE POLICY "Admin full access"
  ON notices FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
