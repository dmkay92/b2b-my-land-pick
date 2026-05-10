-- chat_rooms에 이메일 발송 추적 컬럼 추가
ALTER TABLE chat_rooms ADD COLUMN agency_email_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE chat_rooms ADD COLUMN landco_email_sent_at TIMESTAMPTZ DEFAULT NULL;
