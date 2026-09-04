alter table app.discovered_jobs
  add column salary_period text not null default 'unknown' check (
    salary_period in ('unknown', 'year', 'month', 'hour')
  ),
  add check (
    salary_min is not null or salary_max is not null or salary_period = 'unknown'
  );

update app.job_observations
set normalized = normalized || '{"salaryPeriod":"unknown"}'::jsonb
where not normalized ? 'salaryPeriod';

create table app.job_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  discovered_job_id uuid not null,
  job_revision bigint not null check (job_revision > 0),
  search_profile_id uuid not null,
  search_profile_revision bigint not null check (search_profile_revision > 0),
  living_profile_id uuid,
  living_profile_revision bigint,
  decision text not null check (decision in ('priority', 'ineligible')),
  job_snapshot jsonb not null check (
    jsonb_typeof(job_snapshot) = 'object'
    and octet_length(job_snapshot::text) <= 32768
  ),
  search_profile_snapshot jsonb not null check (
    jsonb_typeof(search_profile_snapshot) = 'object'
    and octet_length(search_profile_snapshot::text) <= 131072
  ),
  criteria jsonb not null check (
    jsonb_typeof(criteria) = 'array'
    and octet_length(criteria::text) <= 65536
  ),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  check (
    (living_profile_id is null and living_profile_revision is null)
    or (living_profile_id is not null and living_profile_revision > 0)
  ),
  foreign key (tenant_id, discovered_job_id)
    references app.discovered_jobs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, search_profile_id)
    references app.search_profiles(tenant_id, id) on delete cascade,
  foreign key (tenant_id, living_profile_id, living_profile_revision)
    references app.profile_revisions(tenant_id, profile_id, revision)
    on delete cascade
);

create unique index job_matches_version_identity on app.job_matches (
  tenant_id,
  discovered_job_id,
  job_revision,
  search_profile_id,
  search_profile_revision,
  coalesce(living_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(living_profile_revision, -1)
);
create index job_matches_lookup on app.job_matches (
  tenant_id, discovered_job_id, search_profile_id, created_at desc, id desc
);

alter table app.job_matches enable row level security;
alter table app.job_matches force row level security;
create policy job_match_tenant on app.job_matches
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));
grant select, insert on app.job_matches to career_app;
