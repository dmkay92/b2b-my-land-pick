-- Enable RLS on tables created without RLS

-- admin_action_logs: 모든 접근은 serviceClient(RLS 우회)로만 함, admin 직접 조회 차단
ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

-- (serviceClient가 모든 쓰기/읽기를 담당하므로 별도 policy 불필요)

-- Enable RLS on quote_abandonments (table was created without RLS)
ALTER TABLE public.quote_abandonments ENABLE ROW LEVEL SECURITY;

-- Landco can insert/delete their own abandonments
CREATE POLICY "Landco manages own abandonments"
  ON public.quote_abandonments FOR ALL
  USING (landco_id = auth.uid());

-- Agency can read abandonments for their own requests
CREATE POLICY "Agency reads abandonments for own requests"
  ON public.quote_abandonments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quote_requests qr
    WHERE qr.id = request_id AND qr.agency_id = auth.uid()
  ));

-- Admin can read all
CREATE POLICY "Admin reads all abandonments"
  ON public.quote_abandonments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));
