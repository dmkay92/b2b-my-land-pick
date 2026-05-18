-- Extensions
create extension if not exists "pgcrypto";

-- Profiles (여행사, 랜드사, 관리자)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text not null check (role in ('agency', 'landco', 'admin')),
  company_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  country_codes text[] default '{}',
  created_at timestamptz default now()
);

-- Quote requests
create table public.quote_requests (
  id uuid default gen_random_uuid() primary key,
  agency_id uuid references public.profiles not null,
  event_name text not null,
  destination_country text not null,
  destination_city text not null,
  depart_date date not null,
  return_date date not null,
  adults int not null default 0,
  children int not null default 0,
  infants int not null default 0,
  leaders int not null default 0,
  hotel_grade int not null check (hotel_grade in (3, 4, 5)),
  deadline date not null,
  notes text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed', 'finalized')),
  created_at timestamptz default now()
);

-- Quotes (버전 관리)
create table public.quotes (
  id uuid default gen_random_uuid() primary key,
  request_id uuid references public.quote_requests on delete cascade not null,
  landco_id uuid references public.profiles not null,
  version int not null default 1,
  file_url text not null,
  file_name text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'selected', 'finalized', 'rejected')),
  submitted_at timestamptz default now()
);

-- Quote selections
create table public.quote_selections (
  request_id uuid references public.quote_requests primary key,
  selected_quote_id uuid references public.quotes not null,
  landco_id uuid references public.profiles not null,
  selected_at timestamptz default now(),
  finalized_at timestamptz
);

-- Chat rooms (견적 × 랜드사별 1:1)
create table public.chat_rooms (
  id uuid default gen_random_uuid() primary key,
  request_id uuid references public.quote_requests on delete cascade not null,
  agency_id uuid references public.profiles not null,
  landco_id uuid references public.profiles not null,
  created_at timestamptz default now(),
  unique(request_id, landco_id)
);

-- Messages
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms on delete cascade not null,
  sender_id uuid references public.profiles not null,
  content text not null,
  created_at timestamptz default now()
);

-- Notifications
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles not null,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_selections enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Storage bucket
insert into storage.buckets (id, name, public) values ('quotes', 'quotes', false);

-- RLS: profiles
create policy "Own profile readable"
  on public.profiles for select using (auth.uid() = id);

create policy "Admin can read all profiles"
  on public.profiles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Admin can update profiles"
  on public.profiles for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Own profile updatable"
  on public.profiles for update using (auth.uid() = id);

-- RLS: quote_requests
create policy "Agency CRUD own requests"
  on public.quote_requests for all using (agency_id = auth.uid());

create policy "Landco reads requests for their countries"
  on public.quote_requests for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'landco'
      and p.status = 'approved'
      and quote_requests.destination_country = any(p.country_codes)
  ));

create policy "Admin reads all requests"
  on public.quote_requests for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- RLS: quotes
create policy "Landco manages own quotes"
  on public.quotes for all using (landco_id = auth.uid());

create policy "Agency reads quotes for own requests"
  on public.quotes for select
  using (exists (
    select 1 from public.quote_requests qr
    where qr.id = request_id and qr.agency_id = auth.uid()
  ));

-- RLS: quote_selections
create policy "Agency manages selections"
  on public.quote_selections for all
  using (exists (
    select 1 from public.quote_requests qr
    where qr.id = request_id and qr.agency_id = auth.uid()
  ));

create policy "Landco reads own selections"
  on public.quote_selections for select
  using (landco_id = auth.uid());

-- RLS: chat_rooms & messages
create policy "Participants access chat rooms"
  on public.chat_rooms for all
  using (agency_id = auth.uid() or landco_id = auth.uid());

create policy "Participants access messages"
  on public.messages for all
  using (exists (
    select 1 from public.chat_rooms cr
    where cr.id = room_id
      and (cr.agency_id = auth.uid() or cr.landco_id = auth.uid())
  ));

-- RLS: notifications
create policy "Own notifications"
  on public.notifications for all using (user_id = auth.uid());

-- Storage RLS
create policy "Auth users can upload"
  on storage.objects for insert
  with check (bucket_id = 'quotes' and auth.role() = 'authenticated');

create policy "Auth users can download"
  on storage.objects for select
  using (bucket_id = 'quotes' and auth.role() = 'authenticated');

-- Trigger: 회원가입 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger as $$
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
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
