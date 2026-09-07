-- Semantic inference uses the durable workers' expiring lease/token fencing
-- protocol without coupling an inbox analysis to an application workflow run.
create table app.semantic_analysis_leases (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  job_match_id uuid not null,
  lease_token uuid not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'in_flight', 'outcome_unknown')),
  expires_at timestamptz not null,
  primary key (tenant_id, input_hash),
  foreign key (tenant_id, job_match_id)
    references app.job_matches(tenant_id, id) on delete cascade
);

alter table app.semantic_analysis_leases enable row level security;
alter table app.semantic_analysis_leases force row level security;
create policy semantic_analysis_lease_tenant on app.semantic_analysis_leases
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

grant select, insert, update, delete on app.semantic_analysis_leases to career_app;
