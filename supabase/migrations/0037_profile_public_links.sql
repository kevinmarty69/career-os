alter table app.profiles
  add column public_links jsonb not null default '{}'::jsonb,
  add constraint profiles_public_links_object
    check (jsonb_typeof(public_links) = 'object');
