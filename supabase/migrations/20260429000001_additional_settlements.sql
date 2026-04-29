CREATE TABLE additional_settlements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES quote_requests(id) NOT NULL,
  landco_id uuid REFERENCES profiles(id) NOT NULL,
  sequence_number int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  items jsonb NOT NULL DEFAULT '[]',
  memo text,
  receipt_urls text[] DEFAULT '{}',
  total_amount numeric NOT NULL DEFAULT 0,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE additional_settlements ENABLE ROW LEVEL SECURITY;

GRANT ALL ON additional_settlements TO service_role;
GRANT ALL ON additional_settlements TO authenticated;
