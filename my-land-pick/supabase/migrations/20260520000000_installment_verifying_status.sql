-- payment_installments status에 'verifying' 추가
ALTER TABLE public.payment_installments
  DROP CONSTRAINT IF EXISTS payment_installments_status_check;

ALTER TABLE public.payment_installments
  ADD CONSTRAINT payment_installments_status_check
  CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled', 'verifying'));
