-- Card surcharge columns on payment_transactions
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS base_amount numeric;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS card_surcharge_rate numeric DEFAULT 0;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS card_surcharge numeric DEFAULT 0;
-- amount = base_amount + card_surcharge (실 결제금액)
-- base_amount = 카드로 결제하고자 하는 원래 금액
-- card_surcharge = base_amount * card_surcharge_rate
