alter table messages
  alter column content drop not null,
  add column if not exists file_url  text default null,
  add column if not exists file_name text default null;
