ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS virtual_account_info jsonb;
-- virtual_account_info stores: { bank: string, account_number: string, holder: string, expires_at: string }
