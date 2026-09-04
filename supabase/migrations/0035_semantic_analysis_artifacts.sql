create unique index job_matches_exact_lineage on app.job_matches (
  tenant_id, id, discovered_job_id, job_revision, search_profile_id,
  search_profile_revision, living_profile_id, living_profile_revision
) nulls not distinct;

create or replace function app.reject_profile_revision_mutation()
returns trigger language plpgsql set search_path = app, pg_temp as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Career Memory revision history is immutable';
end
$$;

create table app.semantic_analyses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  schema_version integer not null check (schema_version = 1),
  job_match_id uuid not null,
  discovered_job_id uuid not null,
  job_revision bigint not null check (job_revision > 0),
  search_profile_id uuid not null,
  search_profile_revision bigint not null check (search_profile_revision > 0),
  living_profile_id uuid not null,
  living_profile_revision bigint not null check (living_profile_revision > 0),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  input jsonb not null check (
    jsonb_typeof(input) = 'object' and octet_length(input::text) <= 131072
  ),
  artifact jsonb not null check (
    jsonb_typeof(artifact) = 'object' and octet_length(artifact::text) <= 262144
  ),
  provider text not null check (char_length(provider) between 1 and 120),
  model text not null check (char_length(model) between 1 and 200),
  provider_request_id text check (
    provider_request_id is null or char_length(provider_request_id) between 1 and 200
  ),
  reserved_tokens integer not null check (reserved_tokens >= 0),
  input_tokens integer not null check (input_tokens between 0 and 1000000),
  output_tokens integer not null check (output_tokens between 0 and 1000000),
  cost_budget_micros bigint not null default 0 check (cost_budget_micros = 0),
  cost_micros bigint not null check (cost_micros = 0),
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, input_hash),
  unique (tenant_id, job_match_id, version),
  foreign key (
    tenant_id, job_match_id, discovered_job_id, job_revision,
    search_profile_id, search_profile_revision,
    living_profile_id, living_profile_revision
  ) references app.job_matches (
    tenant_id, id, discovered_job_id, job_revision,
    search_profile_id, search_profile_revision,
    living_profile_id, living_profile_revision
  ) on delete cascade
);

create index semantic_analyses_lookup on app.semantic_analyses (
  tenant_id, discovered_job_id, search_profile_id, created_at desc, id desc
);

alter table app.semantic_analyses enable row level security;
alter table app.semantic_analyses force row level security;
create policy semantic_analysis_tenant on app.semantic_analyses
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

create trigger semantic_analysis_immutable
before update or delete on app.semantic_analyses
for each row execute function app.immutable_gate_row();

grant select, insert on app.semantic_analyses to career_app;
