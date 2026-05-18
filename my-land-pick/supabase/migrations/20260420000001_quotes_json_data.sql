-- Store itinerary and pricing JSON in quotes table so data persists after draft deletion
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS itinerary jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pricing jsonb;
