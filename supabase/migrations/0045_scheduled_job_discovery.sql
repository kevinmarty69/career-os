alter table app.search_profiles
  add column discovery_sources jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(discovery_sources) = 'array'
      and jsonb_array_length(discovery_sources) <= 10
      and octet_length(discovery_sources::text) <= 24576
    ),
  add column discovery_interval_hours integer not null default 24
    check (discovery_interval_hours in (6, 12, 24, 72)),
  add column next_discovery_at timestamptz,
  add column last_discovery_at timestamptz,
  add column last_discovery_status text
    check (last_discovery_status in ('running', 'succeeded', 'partial', 'failed')),
  add column discovery_lease_token uuid,
  add column discovery_lease_expires_at timestamptz,
  add column last_discovery_summary jsonb
    check (
      last_discovery_summary is null
      or (
        jsonb_typeof(last_discovery_summary) = 'object'
        and octet_length(last_discovery_summary::text) <= 4096
      )
    );

create index search_profiles_due_discovery
  on app.search_profiles (next_discovery_at, id)
  where active and jsonb_array_length(discovery_sources) > 0;

create or replace function app.validate_search_profile_update() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare configuration_changed boolean;
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.created_at is distinct from old.created_at then
    raise exception 'invalid search profile update';
  end if;
  configuration_changed := new.name is distinct from old.name
    or new.hard_constraints is distinct from old.hard_constraints
    or new.soft_preferences is distinct from old.soft_preferences
    or new.discovery_sources is distinct from old.discovery_sources
    or new.discovery_interval_hours is distinct from old.discovery_interval_hours
    or new.alert_threshold is distinct from old.alert_threshold
    or new.active is distinct from old.active;
  if (configuration_changed and new.revision <> old.revision + 1)
    or (not configuration_changed and new.revision <> old.revision) then
    raise exception 'invalid search profile revision';
  end if;
  new.updated_at := case
    when configuration_changed then clock_timestamp()
    else old.updated_at
  end;
  return new;
end
$$;

do $$ begin
  create role career_job_discovery nologin;
exception when duplicate_object then null;
end $$;
alter role career_job_discovery with nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;

create or replace function app.claim_scheduled_job_discovery(lease_seconds integer)
returns table (
  search_profile_id uuid,
  tenant_id uuid,
  owner_id uuid,
  tenant_name text,
  profile jsonb,
  lease_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  active_role text := nullif(current_setting('role', true), 'none');
  claimed app.search_profiles%rowtype;
begin
  if active_role is distinct from 'career_job_discovery'
    or not pg_has_role(session_user, 'career_job_discovery', 'member')
  then
    raise exception 'job discovery denied' using errcode = '42501';
  end if;
  if lease_seconds is null or lease_seconds < 30 or lease_seconds > 900 then
    raise exception 'invalid job discovery lease' using errcode = '22023';
  end if;

  select candidate.* into claimed
  from app.search_profiles candidate
  where candidate.active
    and jsonb_array_length(candidate.discovery_sources) > 0
    and (candidate.next_discovery_at is null
      or candidate.next_discovery_at <= clock_timestamp())
    and (candidate.discovery_lease_expires_at is null
      or candidate.discovery_lease_expires_at <= clock_timestamp())
  order by candidate.next_discovery_at nulls first, candidate.id
  for update skip locked limit 1;
  if claimed.id is null then return; end if;

  claimed.discovery_lease_token := gen_random_uuid();
  update app.search_profiles set
    last_discovery_status = 'running',
    discovery_lease_token = claimed.discovery_lease_token,
    discovery_lease_expires_at = clock_timestamp()
      + make_interval(secs => lease_seconds)
  where id = claimed.id;

  return query select claimed.id, claimed.tenant_id, tenant.owner_id, tenant.name,
    jsonb_build_object(
      'searchProfileId', claimed.id,
      'name', claimed.name,
      'hardConstraints', claimed.hard_constraints,
      'softPreferences', claimed.soft_preferences,
      'discoverySources', claimed.discovery_sources,
      'discoveryIntervalHours', claimed.discovery_interval_hours,
      'alertThreshold', claimed.alert_threshold,
      'active', claimed.active,
      'revision', claimed.revision,
      'createdAt', claimed.created_at,
      'updatedAt', claimed.updated_at
    ), claimed.discovery_lease_token
  from app.tenants tenant where tenant.id = claimed.tenant_id;
end
$$;

create or replace function app.complete_scheduled_job_discovery(
  target_profile uuid,
  target_lease_token uuid,
  target_status text,
  target_summary jsonb,
  retry_minutes integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare active_role text := nullif(current_setting('role', true), 'none');
begin
  if active_role is distinct from 'career_job_discovery'
    or not pg_has_role(session_user, 'career_job_discovery', 'member')
  then
    raise exception 'job discovery denied' using errcode = '42501';
  end if;
  if target_status not in ('succeeded', 'partial', 'failed')
    or retry_minutes is null or retry_minutes < 1 or retry_minutes > 60
    or jsonb_typeof(target_summary) <> 'object'
    or octet_length(target_summary::text) > 4096
    or target_summary - array[
      'boards', 'jobsRead', 'stored', 'filtered', 'failedBoards'
    ] <> '{}'::jsonb
    or exists (
      select 1 from jsonb_each(target_summary) field
      where jsonb_typeof(field.value) <> 'number'
        or (field.value #>> '{}')::numeric < 0
        or (field.value #>> '{}')::numeric > 100
        or trunc((field.value #>> '{}')::numeric) <> (field.value #>> '{}')::numeric
    )
  then
    raise exception 'invalid job discovery result' using errcode = '22023';
  end if;

  update app.search_profiles set
    last_discovery_at = clock_timestamp(),
    last_discovery_status = target_status,
    last_discovery_summary = target_summary,
    next_discovery_at = clock_timestamp() + case
      when target_status = 'failed' then make_interval(mins => retry_minutes)
      else make_interval(hours => discovery_interval_hours)
    end,
    discovery_lease_token = null,
    discovery_lease_expires_at = null
  where id = target_profile
    and discovery_lease_token = target_lease_token
    and discovery_lease_expires_at > clock_timestamp();
  return found;
end
$$;

create or replace function app.active_job_discovery_lease(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select nullif(current_setting('role', true), 'none') = 'career_job_discovery'
    and pg_has_role(session_user, 'career_job_discovery', 'member')
    and exists (
      select 1 from app.search_profiles profile
      where profile.tenant_id = target_tenant
        and profile.discovery_lease_token = nullif(
          current_setting('app.discovery_lease_token', true), ''
        )::uuid
        and profile.discovery_lease_expires_at > clock_timestamp()
        and profile.last_discovery_status = 'running'
    )
$$;

create policy discovered_job_discovery_lease on app.discovered_jobs
  for all to career_job_discovery
  using (app.active_job_discovery_lease(tenant_id))
  with check (app.active_job_discovery_lease(tenant_id));

alter policy discovered_job_tenant on app.discovered_jobs to career_app;
alter policy job_source_record_tenant on app.job_source_records to career_app;
alter policy job_observation_tenant on app.job_observations to career_app;
create policy job_source_discovery_lease on app.job_source_records
  for all to career_job_discovery
  using (app.active_job_discovery_lease(tenant_id))
  with check (app.active_job_discovery_lease(tenant_id));
create policy job_observation_discovery_lease on app.job_observations
  for all to career_job_discovery
  using (app.active_job_discovery_lease(tenant_id))
  with check (app.active_job_discovery_lease(tenant_id));

revoke all on app.search_profiles, app.tenants from career_job_discovery;
grant usage on schema app to career_job_discovery;
grant select, insert, update on app.discovered_jobs, app.job_source_records,
  app.job_observations to career_job_discovery;
revoke execute on function app.claim_scheduled_job_discovery(integer),
  app.complete_scheduled_job_discovery(uuid, uuid, text, jsonb, integer),
  app.active_job_discovery_lease(uuid) from public;
grant execute on function app.claim_scheduled_job_discovery(integer),
  app.complete_scheduled_job_discovery(uuid, uuid, text, jsonb, integer),
  app.active_job_discovery_lease(uuid) to career_job_discovery;
