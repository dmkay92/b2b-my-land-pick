-- quote_templates: landco가 저장하는 견적 템플릿
create table if not exists quote_templates (
  id         uuid primary key default gen_random_uuid(),
  landco_id  uuid not null references profiles(id) on delete cascade,
  name       text not null,
  itinerary  jsonb not null default '[]'::jsonb,
  pricing    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table quote_templates enable row level security;

-- 본인 템플릿만 조회 가능
create policy "landco can view own templates"
  on quote_templates for select
  using (auth.uid() = landco_id);

-- 본인 템플릿만 생성 가능
create policy "landco can insert own templates"
  on quote_templates for insert
  with check (auth.uid() = landco_id);

-- 본인 템플릿만 수정 가능
create policy "landco can update own templates"
  on quote_templates for update
  using (auth.uid() = landco_id);

-- 본인 템플릿만 삭제 가능
create policy "landco can delete own templates"
  on quote_templates for delete
  using (auth.uid() = landco_id);

-- updated_at 자동 갱신
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger quote_templates_updated_at
  before update on quote_templates
  for each row execute function update_updated_at_column();
