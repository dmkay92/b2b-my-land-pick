-- 승인된 사용자는 다른 사용자의 company_name을 조회할 수 있도록 허용
create policy "Approved users can read company names"
  on public.profiles for select
  using (public.get_my_role() in ('agency', 'landco'));
