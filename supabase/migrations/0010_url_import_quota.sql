create table app.url_import_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  actor_id uuid not null,
  status text not null default 'started'
    check (status in ('started', 'succeeded', 'rejected', 'failed')),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  unique (tenant_id, id),
  check ((status = 'started') = (finished_at is null))
);

create index url_import_attempts_tenant_created
  on app.url_import_attempts (tenant_id, created_at desc);
create index url_import_attempts_actor_created
  on app.url_import_attempts (actor_id, created_at desc);
create index url_import_attempts_active
  on app.url_import_attempts (created_at) where status = 'started';

alter table app.url_import_attempts enable row level security;
alter table app.url_import_attempts force row level security;
create policy url_import_tenant on app.url_import_attempts
  using (app.active_tenant(tenant_id));

create function app.reserve_url_import(target_tenant uuid) returns uuid
language plpgsql security definer set search_path = app, pg_temp as $$
declare
  attempt_id uuid;
  current_actor_id uuid := app.current_user_id();
  checked_at timestamptz := clock_timestamp();
begin
  if target_tenant is null or current_actor_id is null
    or target_tenant is distinct from app.current_tenant_id()
    or not app.active_tenant(target_tenant) then
    raise exception 'url import tenant rejected';
  end if;

  -- ponytail: two short global locks are enough until import traffic needs a queue.
  perform pg_advisory_xact_lock(hashtextextended('url-import-global', 0));
  perform pg_advisory_xact_lock(hashtextextended(target_tenant::text, 0));

  if (select count(*) from app.url_import_attempts
      where status = 'started' and created_at > checked_at - interval '15 seconds') >= 8
    or (select count(*) from app.url_import_attempts
      where tenant_id = target_tenant and status = 'started'
        and created_at > checked_at - interval '15 seconds') >= 1
    or (select count(*) from app.url_import_attempts
      where tenant_id = target_tenant
        and created_at > checked_at - interval '1 minute') >= 5
    or (select count(*) from app.url_import_attempts
      where tenant_id = target_tenant
        and created_at > checked_at - interval '1 day') >= 50 then
    raise exception 'url import rate limited';
  end if;

  if (select count(*) from app.url_import_attempts
      where actor_id = current_actor_id
        and created_at > checked_at - interval '1 minute') >= 5
    or (select count(*) from app.url_import_attempts
      where actor_id = current_actor_id
        and created_at > checked_at - interval '1 day') >= 50 then
    raise exception 'url import rate limited';
  end if;

  insert into app.url_import_attempts (tenant_id, actor_id)
  values (target_tenant, current_actor_id) returning id into attempt_id;
  return attempt_id;
end $$;

create function app.finish_url_import(attempt_id uuid, outcome text)
returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  attempt app.url_import_attempts%rowtype;
begin
  if attempt_id is null or outcome not in ('succeeded', 'rejected', 'failed') then
    raise exception 'invalid url import result';
  end if;
  select * into attempt from app.url_import_attempts where id = attempt_id for update;
  if not found or not app.active_tenant(attempt.tenant_id) then
    raise exception 'url import attempt not found';
  end if;
  if attempt.status <> 'started' then
    if attempt.status = outcome then return; end if;
    raise exception 'url import already finalized';
  end if;
  update app.url_import_attempts
    set status = outcome, finished_at = clock_timestamp()
    where id = attempt_id;
end $$;

grant execute on function app.reserve_url_import(uuid),
  app.finish_url_import(uuid, text) to career_app;
revoke all on app.url_import_attempts from public, career_app;
revoke execute on function app.reserve_url_import(uuid),
  app.finish_url_import(uuid, text) from public;
