alter table quote_requests
  add column if not exists shopping_option boolean default null,
  add column if not exists tip_option      boolean default null,
  add column if not exists local_option    boolean default null;
