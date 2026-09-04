create table app.discovered_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company text check (company is null or char_length(company) between 1 and 200),
  role text check (role is null or char_length(role) between 1 and 200),
  description text check (
    description is null or char_length(description) between 1 and 20000
  ),
  canonical_url text not null check (
    char_length(canonical_url) between 1 and 2048
    and canonical_url ~ '^https?://'
  ),
  revision bigint not null default 1 check (revision > 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (company is not null or role is not null or description is not null),
  check (last_seen_at >= first_seen_at),
  unique (tenant_id, id),
  unique (tenant_id, canonical_url)
);

create table app.job_source_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  discovered_job_id uuid not null,
  requested_url text not null check (
    char_length(requested_url) between 1 and 2048
    and requested_url ~ '^https?://'
  ),
  final_url text not null check (
    char_length(final_url) between 1 and 2048
    and final_url ~ '^https?://'
  ),
  fetched_at timestamptz not null,
  content_type text not null check (content_type in ('text/html', 'text/plain')),
  bytes integer not null check (bytes between 0 and 1048576),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  trust text not null default 'untrusted-data' check (trust = 'untrusted-data'),
  extraction jsonb not null check (jsonb_typeof(extraction) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, requested_url),
  foreign key (tenant_id, discovered_job_id)
    references app.discovered_jobs(tenant_id, id) on delete cascade
);

create index discovered_jobs_last_seen
  on app.discovered_jobs (tenant_id, last_seen_at desc, id desc);
create index job_source_records_job
  on app.job_source_records (tenant_id, discovered_job_id, fetched_at desc);

alter table app.discovered_jobs enable row level security;
alter table app.discovered_jobs force row level security;
create policy discovered_job_tenant on app.discovered_jobs
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

alter table app.job_source_records enable row level security;
alter table app.job_source_records force row level security;
create policy job_source_record_tenant on app.job_source_records
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

grant select, insert, update, delete on app.discovered_jobs,
  app.job_source_records to career_app;
