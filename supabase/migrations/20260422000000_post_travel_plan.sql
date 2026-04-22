-- 1. payment_schedules에 approval_status 추가
ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved'
  CHECK (approval_status IN ('approved', 'pending', 'rejected'));

-- 2. template_type에 post_travel 추가
ALTER TABLE payment_schedules DROP CONSTRAINT IF EXISTS payment_schedules_template_type_check;
ALTER TABLE payment_schedules ADD CONSTRAINT payment_schedules_template_type_check
  CHECK (template_type IN ('standard', 'large_event', 'immediate', 'post_travel'));

-- 3. chat_messages에 message_type, metadata 추가
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'
  CHECK (message_type IN ('text', 'file', 'system', 'approval_request', 'approval_result'));
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb;
