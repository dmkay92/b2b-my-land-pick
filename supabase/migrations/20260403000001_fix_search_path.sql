-- Fix mutable search_path security warning on get_my_role function
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Fix mutable search_path security warning on handle_new_user function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, company_name, status)
  values (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'role')::text,
    (new.raw_user_meta_data->>'company_name')::text,
    case
      when (new.raw_user_meta_data->>'role') = 'admin' then 'approved'
      else 'pending'
    end
  );
  return new;
end;
$$;
