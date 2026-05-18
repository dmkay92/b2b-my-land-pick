-- quote_drafts 테이블에 추가
ALTER TABLE quote_drafts ADD COLUMN IF NOT EXISTS includes text;
ALTER TABLE quote_drafts ADD COLUMN IF NOT EXISTS excludes text;

-- quotes 테이블에 추가
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS includes text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS excludes text;
