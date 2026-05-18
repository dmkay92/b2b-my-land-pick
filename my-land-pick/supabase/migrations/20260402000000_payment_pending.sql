-- Add payment_pending to quote_requests status CHECK constraint
ALTER TABLE quote_requests DROP CONSTRAINT IF EXISTS quote_requests_status_check;
ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_status_check
  CHECK (status IN ('open', 'in_progress', 'closed', 'payment_pending', 'finalized'));

-- Add payment_memo column to quote_selections
ALTER TABLE quote_selections ADD COLUMN IF NOT EXISTS payment_memo TEXT;

-- Clear finalized_at for currently finalized records (landco hasn't confirmed yet)
UPDATE quote_selections
SET finalized_at = NULL
WHERE request_id IN (
  SELECT id FROM quote_requests WHERE status = 'finalized'
);

-- Migrate finalized quote_requests to payment_pending
UPDATE quote_requests SET status = 'payment_pending' WHERE status = 'finalized';

-- Revert finalized quotes back to selected (landco hasn't confirmed yet)
UPDATE quotes SET status = 'selected'
WHERE status = 'finalized'
  AND id IN (SELECT selected_quote_id FROM quote_selections);
