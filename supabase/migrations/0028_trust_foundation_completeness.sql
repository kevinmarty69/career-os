create table app.search_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  hard_constraints jsonb not null default '{}'::jsonb
    check (jsonb_typeof(hard_constraints) = 'object'),
  soft_preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(soft_preferences) = 'object'),
  active boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

alter table app.search_profiles enable row level security;
alter table app.search_profiles force row level security;
create policy search_profile_tenant on app.search_profiles
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));
grant select, insert, update, delete on app.search_profiles to career_app;

create function app.validate_search_profile_update() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.created_at is distinct from old.created_at
    or new.revision <> old.revision + 1 then
    raise exception 'invalid search profile update';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;

create trigger search_profile_update_valid
before update on app.search_profiles
for each row execute function app.validate_search_profile_update();

create table app.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  actor app.actor_role not null,
  actor_id uuid,
  event_type text not null check (char_length(event_type) between 1 and 80),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id)
);

alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;
create policy audit_event_tenant on app.audit_events
  using (app.active_tenant(tenant_id));
grant select on app.audit_events to career_app;
grant usage, select on sequence app.audit_events_id_seq to career_app;

create function app.record_human_audit_event(
  target_tenant uuid,
  target_event_type text,
  target_entity_type text,
  target_entity_id uuid,
  target_summary jsonb
) returns bigint language plpgsql security definer
set search_path = app, pg_temp as $$
declare event_id bigint;
begin
  if not app.active_tenant(target_tenant)
    or app.current_user_id() is null
    or char_length(target_event_type) not between 1 and 80
    or char_length(target_entity_type) not between 1 and 80
    or jsonb_typeof(target_summary) <> 'object' then
    raise exception 'audit event rejected';
  end if;
  insert into app.audit_events (
    tenant_id, actor, actor_id, event_type, entity_type, entity_id, summary
  ) values (
    target_tenant, 'human', app.current_user_id(), target_event_type,
    target_entity_type, target_entity_id, target_summary
  ) returning id into event_id;
  return event_id;
end
$$;

create function app.reject_audit_event_mutation() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  raise exception 'audit events are immutable';
end
$$;

create trigger audit_event_immutable
before update or delete on app.audit_events
for each row execute function app.reject_audit_event_mutation();

grant execute on function app.record_human_audit_event(
  uuid, text, text, uuid, jsonb
) to career_app;
revoke execute on function app.validate_search_profile_update(),
  app.reject_audit_event_mutation(),
  app.record_human_audit_event(uuid, text, text, uuid, jsonb)
from public;

