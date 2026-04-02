-- profiles 신규 컬럼
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS representative_name TEXT,
  ADD COLUMN IF NOT EXISTS phone_landline TEXT,
  ADD COLUMN IF NOT EXISTS phone_mobile TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_holder TEXT,
  ADD COLUMN IF NOT EXISTS document_biz_url TEXT,
  ADD COLUMN IF NOT EXISTS document_bank_url TEXT;

-- signup-documents Storage 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('signup-documents', 'signup-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 본인 폴더에만 업로드 가능
CREATE POLICY "Users upload own signup docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signup-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: 본인 파일 읽기 + admin 전체 읽기
CREATE POLICY "Users read own signup docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'signup-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );
