create schema if not exists app;

do $$ begin
  create role career_app nologin;
exception when duplicate_object then null;
end $$;

create function app.current_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create type app.provenance_level as enum ('verified', 'declared', 'inferred');
create type app.sensitivity as enum ('public', 'private', 'restricted');
create type app.actor_role as enum (
  'human', 'system', 'evidence_archivist', 'company_researcher', 'recruiter_strategist',
  'hiring_manager', 'page_composer', 'fact_checker'
);

create table app.tenants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique,
  name text not null
);

create table app.profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  name text not null,
  headline text not null,
  unique (tenant_id, id)
);

create table app.sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  kind text not null check (kind in ('document', 'web', 'manual')),
  title text not null,
  locator text,
  trust text not null default 'untrusted-data' check (trust = 'untrusted-data'),
  sensitivity app.sensitivity not null,
  allowed_uses text[] not null,
  unique (tenant_id, id)
);

create table app.claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  statement text not null,
  level app.provenance_level not null,
  sensitivity app.sensitivity not null,
  allowed_uses text[] not null,
  unique (tenant_id, id)
);

create table app.evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  source_id uuid not null,
  label text not null,
  excerpt text not null,
  unique (tenant_id, id),
  foreign key (tenant_id, source_id) references app.sources(tenant_id, id) on delete cascade
);

create table app.claim_evidence (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  claim_id uuid not null,
  evidence_id uuid not null,
  relation text not null default 'supports' check (relation in ('supports', 'contradicts')),
  primary key (tenant_id, claim_id, evidence_id),
  foreign key (tenant_id, claim_id) references app.claims(tenant_id, id) on delete cascade,
  foreign key (tenant_id, evidence_id) references app.evidence(tenant_id, id) on delete cascade
);

create table app.opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company text not null,
  role text not null,
  raw_text text,
  url text,
  extraction_status text not null check (extraction_status in ('not_requested', 'blocked', 'ready', 'failed')),
  unique (tenant_id, id)
);

create table app.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  opportunity_id uuid not null,
  state text not null,
  version integer not null default 1,
  revision_count integer not null default 0 check (revision_count between 0 and 3),
  status text not null default 'running' check (status in ('running', 'paused', 'completed', 'failed', 'cancelled')),
  token_budget integer not null check (token_budget > 0),
  cost_budget_micros bigint not null check (cost_budget_micros >= 0),
  deadline_at timestamptz not null,
  unique (tenant_id, id),
  foreign key (tenant_id, opportunity_id) references app.opportunities(tenant_id, id)
);

create table app.workflow_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  actor app.actor_role not null,
  event_type text not null,
  summary text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workflow_run_id) references app.workflow_runs(tenant_id, id) on delete cascade
);

create table app.artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  kind text not null check (kind in ('research', 'strategy', 'page_spec', 'review_issue')),
  version integer not null check (version > 0),
  schema_version integer not null default 1,
  body jsonb not null,
  created_by app.actor_role not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (workflow_run_id, kind, version),
  foreign key (tenant_id, workflow_run_id) references app.workflow_runs(tenant_id, id) on delete cascade
);

create table app.page_specs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  version integer not null,
  spec jsonb not null,
  unique (tenant_id, id),
  unique (workflow_run_id, version),
  foreign key (tenant_id, workflow_run_id) references app.workflow_runs(tenant_id, id) on delete cascade
);

create table app.page_spec_claims (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  page_spec_id uuid not null,
  claim_id uuid not null,
  primary key (tenant_id, page_spec_id, claim_id),
  foreign key (tenant_id, page_spec_id) references app.page_specs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, claim_id) references app.claims(tenant_id, id)
);

create table app.reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  page_spec_id uuid not null,
  reviewer text not null check (reviewer in ('recruiter', 'hiring_manager', 'factuality')),
  verdict text not null check (verdict in ('pass', 'changes_required')),
  issues jsonb not null default '[]',
  unique (page_spec_id, reviewer),
  foreign key (tenant_id, page_spec_id) references app.page_specs(tenant_id, id) on delete cascade
);

create table app.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  page_spec_id uuid not null unique,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  foreign key (tenant_id, page_spec_id) references app.page_specs(tenant_id, id) on delete cascade
);

create table app.publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  page_spec_id uuid not null unique,
  published_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, page_spec_id) references app.page_specs(tenant_id, id)
);

create table app.share_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  publication_id uuid not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (tenant_id, publication_id) references app.publications(tenant_id, id) on delete cascade
);

create table app.model_usage (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  actor app.actor_role not null,
  provider text not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cost_micros bigint not null check (cost_micros >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  cache_hit boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workflow_run_id) references app.workflow_runs(tenant_id, id) on delete cascade
);

create function app.owns_tenant(candidate uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp
as $$ select exists(select 1 from tenants where id = candidate and owner_id = app.current_user_id()) $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','sources','claims','evidence','claim_evidence','opportunities',
    'workflow_runs','workflow_events','artifacts','page_specs','page_spec_claims','reviews',
    'approvals','publications','share_links','model_usage'
  ] loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format('alter table app.%I force row level security', table_name);
    execute format('create policy tenant_isolation on app.%I using (app.owns_tenant(tenant_id)) with check (app.owns_tenant(tenant_id))', table_name);
    execute format('grant select, insert, update, delete on app.%I to career_app', table_name);
  end loop;
end $$;

alter table app.tenants enable row level security;
alter table app.tenants force row level security;
create policy tenant_owner on app.tenants using (owner_id = app.current_user_id()) with check (owner_id = app.current_user_id());
grant select, insert, update, delete on app.tenants to career_app;

grant usage on schema app to career_app;
grant usage on type app.provenance_level, app.sensitivity, app.actor_role to career_app;
grant usage, select on all sequences in schema app to career_app;
grant execute on function app.current_user_id() to career_app;
grant execute on function app.owns_tenant(uuid) to career_app;

create function app.check_publication() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if (select count(*) from reviews where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id and verdict = 'pass') <> 3 then
    raise exception 'publication requires three passing reviews';
  end if;
  if not exists(select 1 from approvals where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id) then
    raise exception 'publication requires human approval';
  end if;
  if exists(
    select 1 from page_spec_claims psc join claims c on c.tenant_id = psc.tenant_id and c.id = psc.claim_id
    where psc.tenant_id = new.tenant_id and psc.page_spec_id = new.page_spec_id
      and (c.sensitivity = 'restricted' or not ('application' = any(c.allowed_uses)) or
        (c.level = 'verified' and not exists(select 1 from claim_evidence ce where ce.tenant_id = c.tenant_id and ce.claim_id = c.id and ce.relation = 'supports')))
  ) then
    raise exception 'publication contains an ineligible claim';
  end if;
  return new;
end $$;

create trigger publication_gate before insert on app.publications
for each row execute function app.check_publication();
