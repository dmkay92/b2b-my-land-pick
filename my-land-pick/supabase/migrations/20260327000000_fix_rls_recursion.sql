-- profiles 테이블의 재귀 RLS 정책을 security definer 함수로 대체

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 기존 재귀 정책 제거
drop policy if exists "Admin can read all profiles" on public.profiles;
drop policy if exists "Admin can update profiles" on public.profiles;
drop policy if exists "Admin reads all requests" on public.quote_requests;

-- 재귀 없는 새 정책 (security definer 함수 사용)
create policy "Admin can read all profiles"
  on public.profiles for select
  using (public.get_my_role() = 'admin');

create policy "Admin can update profiles"
  on public.profiles for update
  using (public.get_my_role() = 'admin');

create policy "Admin reads all requests"
  on public.quote_requests for select
  using (public.get_my_role() = 'admin');
