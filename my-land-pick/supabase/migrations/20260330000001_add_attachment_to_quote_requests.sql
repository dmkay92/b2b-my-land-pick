alter table quote_requests
  add column if not exists attachment_url  text default null,
  add column if not exists attachment_name text default null;
