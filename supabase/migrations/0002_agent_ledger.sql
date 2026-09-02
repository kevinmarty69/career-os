create extension if not exists pgcrypto;

do $$ begin create role career_worker nologin; exception when duplicate_object then null; end $$;
do $$ begin create role career_reviewer nologin; exception when duplicate_object then null; end $$;
do $$ begin create role career_publisher nologin; exception when duplicate_object then null; end $$;

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function app.current_tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.tenant_id', true), '')::uuid
$$;

alter table app.workflow_runs
  add column input_hash text not null default '',
  add column used_tokens integer not null default 0 check (used_tokens >= 0),
  add column used_cost_micros bigint not null default 0 check (used_cost_micros >= 0),
  add column reserved_tokens integer not null default 0 check (reserved_tokens >= 0),
  add column reserved_cost_micros bigint not null default 0 check (reserved_cost_micros >= 0);

alter table app.page_specs
  add column input_hash text not null default '',
  add column spec_hash text generated always as (encode(digest(spec::text, 'sha256'), 'hex')) stored,
  add column invalidated_at timestamptz,
  add constraint page_spec_not_empty check (spec <> '{}'::jsonb and jsonb_typeof(spec -> 'blocks') = 'array');

alter table app.reviews add column page_spec_hash text not null default '';
alter table app.approvals add column page_spec_hash text not null default '';
alter table app.publications add column page_spec_hash text not null default '';

create table app.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  stage text not null,
  attempt integer not null default 1 check (attempt > 0),
  status text not null check (status in ('pending','leased','completed','failed','cancelled')),
  idempotency_key text not null,
  lease_owner text,
  lease_expires_at timestamptz,
  output_artifact_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, workflow_run_id, idempotency_key),
  foreign key (tenant_id, workflow_run_id) references app.workflow_runs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, output_artifact_id) references app.artifacts(tenant_id, id)
);

alter table app.workflow_steps enable row level security;
alter table app.workflow_steps force row level security;
create policy workflow_step_tenant on app.workflow_steps
  using (app.owns_tenant(tenant_id)) with check (app.owns_tenant(tenant_id));

create function app.reserve_run_budget(
  run_tenant uuid, run_id uuid, reserve_tokens integer, reserve_cost bigint
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if reserve_tokens < 0 or reserve_cost < 0 then raise exception 'invalid reservation'; end if;
  if run_tenant is distinct from current_tenant_id() then raise exception 'tenant context mismatch'; end if;
  update workflow_runs
  set reserved_tokens = reserved_tokens + reserve_tokens,
      reserved_cost_micros = reserved_cost_micros + reserve_cost
  where tenant_id = run_tenant and id = run_id and status = 'running'
    and deadline_at > now()
    and used_tokens + reserved_tokens + reserve_tokens <= token_budget
    and used_cost_micros + reserved_cost_micros + reserve_cost <= cost_budget_micros;
  if not found then raise exception 'budget reservation rejected'; end if;
end $$;

create function app.settle_run_budget(
  run_tenant uuid, run_id uuid, reserve_tokens integer, reserve_cost bigint,
  actual_tokens integer, actual_cost bigint
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if actual_tokens < 0 or actual_cost < 0 or actual_tokens > reserve_tokens or actual_cost > reserve_cost then
    raise exception 'usage exceeds reservation';
  end if;
  if run_tenant is distinct from current_tenant_id() then raise exception 'tenant context mismatch'; end if;
  update workflow_runs
  set reserved_tokens = reserved_tokens - reserve_tokens,
      reserved_cost_micros = reserved_cost_micros - reserve_cost,
      used_tokens = used_tokens + actual_tokens,
      used_cost_micros = used_cost_micros + actual_cost
  where tenant_id = run_tenant and id = run_id
    and reserved_tokens >= reserve_tokens and reserved_cost_micros >= reserve_cost;
  if not found then raise exception 'reservation not found'; end if;
end $$;

create function app.approve_page_spec(target_page_spec uuid) returns uuid
language plpgsql security definer set search_path = app, pg_temp as $$
declare approval_id uuid; target_tenant uuid; target_hash text;
begin
  select tenant_id, spec_hash into target_tenant, target_hash from page_specs
  where id = target_page_spec and invalidated_at is null;
  if target_tenant is null or not owns_tenant(target_tenant) then raise exception 'approval denied'; end if;
  if (select count(*) from reviews where tenant_id = target_tenant and page_spec_id = target_page_spec
      and page_spec_hash = target_hash and verdict = 'pass') <> 3 then
    raise exception 'approval requires three passing reviews';
  end if;
  insert into approvals (tenant_id, page_spec_id, page_spec_hash, approved_by)
  values (target_tenant, target_page_spec, target_hash, current_user_id()) returning id into approval_id;
  return approval_id;
end $$;

create function app.invalidate_dependent_pages() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare affected_tenant uuid := old.tenant_id;
begin
  update publications p set revoked_at = coalesce(p.revoked_at, now())
  from page_specs ps, workflow_runs wr
  where p.tenant_id = affected_tenant and p.page_spec_id = ps.id
    and ps.workflow_run_id = wr.id
    and (tg_table_name <> 'opportunities' or wr.opportunity_id = old.id);
  update page_specs ps set invalidated_at = coalesce(ps.invalidated_at, now())
  from workflow_runs wr
  where ps.tenant_id = affected_tenant and ps.workflow_run_id = wr.id
    and (tg_table_name <> 'opportunities' or wr.opportunity_id = old.id);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger invalidate_profile before update or delete on app.profiles
for each row execute function app.invalidate_dependent_pages();
create trigger invalidate_source before update or delete on app.sources
for each row execute function app.invalidate_dependent_pages();
create trigger invalidate_claim before update or delete on app.claims
for each row execute function app.invalidate_dependent_pages();
create trigger invalidate_evidence before update or delete on app.evidence
for each row execute function app.invalidate_dependent_pages();
create trigger invalidate_opportunity before update or delete on app.opportunities
for each row execute function app.invalidate_dependent_pages();

create function app.immutable_gate_row() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin raise exception '% rows are immutable', tg_table_name; end $$;
create trigger reviews_immutable before update or delete on app.reviews
for each row execute function app.immutable_gate_row();
create trigger approvals_immutable before update or delete on app.approvals
for each row execute function app.immutable_gate_row();

create or replace function app.check_publication() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare actual_hash text;
begin
  select spec_hash into actual_hash from page_specs
  where tenant_id = new.tenant_id and id = new.page_spec_id and invalidated_at is null;
  if actual_hash is null or new.page_spec_hash <> actual_hash then
    raise exception 'publication requires the current immutable PageSpec hash';
  end if;
  if (select count(*) from reviews where tenant_id = new.tenant_id
      and page_spec_id = new.page_spec_id and page_spec_hash = actual_hash and verdict = 'pass') <> 3 then
    raise exception 'publication requires three passing reviews for this hash';
  end if;
  if not exists(select 1 from approvals where tenant_id = new.tenant_id
    and page_spec_id = new.page_spec_id and page_spec_hash = actual_hash) then
    raise exception 'publication requires human approval for this hash';
  end if;
  if not exists(select 1 from page_spec_claims where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id)
    or exists(
      select 1 from page_spec_claims psc
      left join claims c on c.tenant_id = psc.tenant_id and c.id = psc.claim_id
      where psc.tenant_id = new.tenant_id and psc.page_spec_id = new.page_spec_id
        and (c.id is null or c.sensitivity = 'restricted' or not ('application' = any(c.allowed_uses))
          or not exists(select 1 from claim_evidence ce
            join evidence e on e.tenant_id = ce.tenant_id and e.id = ce.evidence_id
            join sources s on s.tenant_id = e.tenant_id and s.id = e.source_id
            where ce.tenant_id = c.tenant_id and ce.claim_id = c.id and ce.relation = 'supports'
              and s.sensitivity <> 'restricted' and 'application' = any(s.allowed_uses))
          or exists(select 1 from claim_evidence ce
            join evidence e on e.tenant_id = ce.tenant_id and e.id = ce.evidence_id
            join sources s on s.tenant_id = e.tenant_id and s.id = e.source_id
            where ce.tenant_id = c.tenant_id and ce.claim_id = c.id
              and (s.sensitivity = 'restricted' or not ('application' = any(s.allowed_uses)))))
    ) then raise exception 'publication contains an unknown, restricted or unsupported claim';
  end if;
  if exists(
    (select claim_value.value from page_specs ps, jsonb_array_elements(ps.spec -> 'blocks') block,
      jsonb_array_elements_text(coalesce(block -> 'claimIds', '[]'::jsonb)) claim_value(value)
      where ps.tenant_id = new.tenant_id and ps.id = new.page_spec_id
     except select claim_id::text from page_spec_claims where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id)
    union
    (select claim_id::text from page_spec_claims where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id
     except select claim_value.value from page_specs ps, jsonb_array_elements(ps.spec -> 'blocks') block,
      jsonb_array_elements_text(coalesce(block -> 'claimIds', '[]'::jsonb)) claim_value(value)
      where ps.tenant_id = new.tenant_id and ps.id = new.page_spec_id)
  ) then raise exception 'PageSpec claim mapping mismatch'; end if;
  return new;
end $$;

drop trigger publication_gate on app.publications;
create trigger publication_gate before insert or update of page_spec_id, page_spec_hash, revoked_at on app.publications
for each row when (new.revoked_at is null) execute function app.check_publication();

create function app.revoke_only() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if old.revoked_at is not null or new.revoked_at is null
    or new.tenant_id <> old.tenant_id or new.page_spec_id <> old.page_spec_id
    or new.page_spec_hash <> old.page_spec_hash then
    raise exception 'publication can only be revoked once';
  end if;
  return new;
end $$;
create trigger publication_revoke_only before update on app.publications
for each row execute function app.revoke_only();

revoke all on app.workflow_events, app.artifacts, app.page_specs, app.page_spec_claims,
  app.reviews, app.approvals, app.publications, app.share_links, app.model_usage,
  app.workflow_steps from career_app;
grant select on app.workflow_events, app.artifacts, app.page_specs, app.page_spec_claims,
  app.reviews, app.approvals, app.publications, app.model_usage to career_app;
grant select, insert on app.workflow_events, app.artifacts, app.page_specs,
  app.page_spec_claims, app.model_usage, app.workflow_steps to career_worker;
grant select on app.page_specs, app.page_spec_claims, app.claims, app.claim_evidence to career_reviewer;
grant insert on app.reviews to career_reviewer;
grant select on app.page_specs, app.reviews, app.approvals to career_publisher;
grant insert, update (revoked_at) on app.publications to career_publisher;
grant usage on schema app to career_worker, career_reviewer, career_publisher;
grant usage on type app.actor_role to career_worker;
grant execute on function app.approve_page_spec(uuid) to career_app;
grant execute on function app.reserve_run_budget(uuid, uuid, integer, bigint),
  app.settle_run_budget(uuid, uuid, integer, bigint, integer, bigint) to career_worker;
revoke execute on function app.reserve_run_budget(uuid, uuid, integer, bigint),
  app.settle_run_budget(uuid, uuid, integer, bigint, integer, bigint) from public;
revoke execute on function app.approve_page_spec(uuid) from public;
grant execute on function app.current_tenant_id() to career_worker;
revoke usage, select on all sequences in schema app from career_app;
