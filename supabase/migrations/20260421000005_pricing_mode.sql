ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pricing_mode text DEFAULT 'detailed' CHECK (pricing_mode IN ('detailed', 'summary'));
ALTER TABLE quote_drafts ADD COLUMN IF NOT EXISTS pricing_mode text DEFAULT 'detailed' CHECK (pricing_mode IN ('detailed', 'summary'));
ALTER TABLE quote_drafts ADD COLUMN IF NOT EXISTS summary_total numeric DEFAULT 0;
ALTER TABLE quote_drafts ADD COLUMN IF NOT EXISTS summary_per_person numeric DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS summary_total numeric DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS summary_per_person numeric DEFAULT 0;
