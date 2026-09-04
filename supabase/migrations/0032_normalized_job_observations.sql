alter table app.discovered_jobs
  add column location text check (
    location is null or char_length(location) between 1 and 300
  ),
  add column remote_mode text not null default 'unknown' check (
    remote_mode in ('unknown', 'onsite', 'hybrid', 'remote')
  ),
  add column contract_type text not null default 'unknown' check (
    contract_type in (
      'unknown', 'full_time', 'part_time', 'internship', 'contract', 'temporary'
    )
  ),
  add column salary_min numeric check (
    salary_min is null or salary_min between 0 and 1000000000
  ),
  add column salary_max numeric check (
    salary_max is null or salary_max between 0 and 1000000000
  ),
  add column salary_currency text check (
    salary_currency is null or salary_currency ~ '^[A-Z]{3}$'
  ),
  add column published_at timestamptz,
  add column external_id text check (
    external_id is null or char_length(external_id) between 1 and 300
  ),
  add column source_kind text not null default 'generic_html' check (
    source_kind in ('generic_html', 'greenhouse', 'ashby')
  ),
  add column lifecycle text not null default 'open' check (
    lifecycle in ('open', 'changed', 'closed', 'reposted')
  ),
  add column fingerprint text check (
    fingerprint is null or fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add check (salary_min is null or salary_max is null or salary_min <= salary_max),
  add check (
    (salary_min is null and salary_max is null and salary_currency is null)
    or (salary_currency is not null and (salary_min is not null or salary_max is not null))
  );

alter table app.job_source_records
  drop constraint job_source_records_tenant_id_requested_url_key,
  drop constraint job_source_records_content_type_check,
  add column fetched_url text check (
    fetched_url is null or (
      char_length(fetched_url) between 1 and 2048 and fetched_url ~ '^https?://'
    )
  ),
  add column source_kind text not null default 'generic_html' check (
    source_kind in ('generic_html', 'greenhouse', 'ashby')
  ),
  add column external_id text check (
    external_id is null or char_length(external_id) between 1 and 300
  ),
  add column matched_by text not null default 'new' check (
    matched_by in ('new', 'exact_source', 'canonical_url', 'fingerprint')
  ),
  add check (content_type in ('text/html', 'text/plain', 'application/json'));

update app.job_source_records set fetched_url = final_url;
alter table app.job_source_records alter column fetched_url set not null;

create unique index job_source_records_external_identity
  on app.job_source_records (tenant_id, source_kind, external_id)
  where external_id is not null;
create unique index job_source_records_url_identity
  on app.job_source_records (tenant_id, requested_url)
  where external_id is null;
create index discovered_jobs_fingerprint
  on app.discovered_jobs (tenant_id, fingerprint)
  where fingerprint is not null;

create table app.job_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  discovered_job_id uuid not null,
  source_record_id uuid not null,
  observed_at timestamptz not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  change_kind text not null check (
    change_kind in ('first_seen', 'unchanged', 'changed', 'closed', 'reposted')
  ),
  lifecycle_signal text not null check (
    lifecycle_signal in ('unknown', 'open', 'closed')
  ),
  matched_by text not null check (
    matched_by in ('new', 'exact_source', 'canonical_url', 'fingerprint')
  ),
  normalized jsonb not null check (
    jsonb_typeof(normalized) = 'object'
    and octet_length(normalized::text) <= 8192
  ),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, discovered_job_id)
    references app.discovered_jobs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_record_id)
    references app.job_source_records(tenant_id, id) on delete cascade
);

create index job_observations_job_time
  on app.job_observations (tenant_id, discovered_job_id, observed_at desc, id desc);

alter table app.job_observations enable row level security;
alter table app.job_observations force row level security;
create policy job_observation_tenant on app.job_observations
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

grant select, insert, update, delete on app.job_observations to career_app;
