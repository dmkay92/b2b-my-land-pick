-- chat_rooms에 읽음 시각 컬럼 추가 (읽음 영수증)
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS agency_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS landco_last_read_at TIMESTAMPTZ;

-- chat_rooms Realtime 활성화 (읽음 상태 실시간 반영)
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
