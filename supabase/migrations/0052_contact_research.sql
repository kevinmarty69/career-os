create table app.contact_research_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  application_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'outcome_unknown')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  dispatched_at timestamptz,
  sources jsonb not null default '[]',
  drafts jsonb not null default '[]',
  usage jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (tenant_id, application_id, input_hash),
  foreign key (tenant_id, application_id) references app.applications(tenant_id, id) on delete cascade
);
create index contact_research_recent on app.contact_research_runs (tenant_id, created_at desc);
alter table app.contact_research_runs enable row level security;
alter table app.contact_research_runs force row level security;
create policy contact_research_tenant on app.contact_research_runs
  using (app.active_tenant(tenant_id)) with check (app.active_tenant(tenant_id));
grant select, insert, update on app.contact_research_runs to career_app;

create function app.validate_contact_research_update() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
    or new.application_id is distinct from old.application_id or new.input_hash is distinct from old.input_hash
    or new.created_at is distinct from old.created_at then
    raise exception 'invalid contact research transition';
  end if;
  if new.status = 'pending' and old.dispatched_at is null and new.attempt_count = old.attempt_count + 1
    and (old.status = 'failed' or (old.status = 'pending' and old.updated_at < clock_timestamp() - interval '3 minutes'))
    and new.dispatched_at is null and new.completed_at is null then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  if old.status <> 'pending' or new.attempt_count <> old.attempt_count
    or (old.dispatched_at is not null and new.dispatched_at is distinct from old.dispatched_at)
    or (new.status = 'pending' and (old.dispatched_at is not null or new.dispatched_at is null or new.usage is null))
    or (new.status <> 'pending' and new.completed_at is null) then
    raise exception 'invalid contact research transition';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger contact_research_update_valid before update on app.contact_research_runs
for each row execute function app.validate_contact_research_update();
revoke execute on function app.validate_contact_research_update() from public;
