-- 랜드사가 1번이라도 견적을 제출한 요청은 담당 국가 변경 후에도 계속 조회 가능하도록 정책 수정

drop policy if exists "Landco reads requests for their countries" on public.quote_requests;

create policy "Landco reads requests for their countries or submitted"
  on public.quote_requests for select
  using (
    -- 현재 담당 국가에 해당하는 요청
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'landco'
        and p.status = 'approved'
        and quote_requests.destination_country = any(p.country_codes)
    )
    or
    -- 이미 견적을 1건 이상 제출한 요청
    exists (
      select 1 from public.quotes q
      where q.request_id = quote_requests.id
        and q.landco_id = auth.uid()
    )
  );
