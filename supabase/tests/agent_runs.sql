\set ON_ERROR_STOP on

begin;

insert into auth."user" (id, name, email, "emailVerified") values
  ('17000000-0000-0000-0000-000000000001', 'Run Owner', 'run-owner@example.test', true),
  ('17000000-0000-0000-0000-000000000002', 'Other Owner', 'run-other@example.test', true);
insert into auth.organization (id, name, slug, "createdAt") values
  ('27000000-0000-0000-0000-000000000001', 'Run Tenant', 'run-tenant', now()),
  ('27000000-0000-0000-0000-000000000002', 'Other Tenant', 'run-other', now());
insert into auth."member" (id, "organizationId", "userId", role, "createdAt") values
  ('37000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', 'owner', now()),
  ('37000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000002', 'owner', now());
insert into app.tenants (id, owner_id, name) values
  ('27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', 'Run Tenant'),
  ('27000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000002', 'Other Tenant');

insert into app.profiles (id, tenant_id, name, headline, profile_kind, revision) values
  ('47000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'Living', 'Living profile', 'living', 2),
  ('47000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001', 'Snapshot', 'Immutable snapshot', 'snapshot', 2),
  ('47000000-0000-0000-0000-000000000003', '27000000-0000-0000-0000-000000000002', 'Other', 'Other snapshot', 'snapshot', 1);
insert into app.opportunities (id, tenant_id, company, role, extraction_status) values
  ('57000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'Northstar', 'Engineer', 'ready'),
  ('57000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', 'Other', 'Engineer', 'ready');
insert into app.workflow_runs (
  id, tenant_id, opportunity_id, profile_id, source_profile_id,
  source_profile_revision, idempotency_key, state, status, token_budget,
  cost_budget_micros, deadline_at
) values (
  '67000000-0000-0000-0000-000000000001',
  '27000000-0000-0000-0000-000000000001',
  '57000000-0000-0000-0000-000000000001',
  '47000000-0000-0000-0000-000000000002',
  '47000000-0000-0000-0000-000000000001', 2,
  '77000000-0000-0000-0000-000000000001', 'human_approval',
  'awaiting_approval', 10000, 0, now() + interval '1 hour'
), (
  '67000000-0000-0000-0000-000000000002',
  '27000000-0000-0000-0000-000000000002',
  '57000000-0000-0000-0000-000000000002',
  '47000000-0000-0000-0000-000000000003', null, null, null,
  'failed', 'failed', 10000, 0, now() + interval '1 hour'
);
insert into app.page_specs (
  id, tenant_id, workflow_run_id, version, spec
) values (
  '68000000-0000-0000-0000-000000000001',
  '27000000-0000-0000-0000-000000000001',
  '67000000-0000-0000-0000-000000000001', 1,
  '{"blocks":[]}'::jsonb
);
insert into app.reviews (
  tenant_id, page_spec_id, reviewer, verdict, page_spec_hash
)
select '27000000-0000-0000-0000-000000000001',
  '68000000-0000-0000-0000-000000000001', reviewer, 'pass', spec_hash
from app.page_specs cross join (
  values ('recruiter'), ('hiring_manager'), ('factuality')
) reviewers(reviewer)
where id = '68000000-0000-0000-0000-000000000001';
insert into app.approvals (
  tenant_id, page_spec_id, page_spec_hash, approved_by
)
select tenant_id, id, spec_hash,
  '17000000-0000-0000-0000-000000000001'
from app.page_specs
where id = '68000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    insert into app.workflow_runs (
      tenant_id, opportunity_id, profile_id, source_profile_id,
      source_profile_revision, idempotency_key, state, status, token_budget,
      cost_budget_micros, deadline_at
    ) values (
      '27000000-0000-0000-0000-000000000001',
      '57000000-0000-0000-0000-000000000001',
      '47000000-0000-0000-0000-000000000002',
      '47000000-0000-0000-0000-000000000001', 2,
      '77000000-0000-0000-0000-000000000001', 'research', 'running',
      10000, 0, now() + interval '1 hour'
    );
    raise exception 'duplicate run idempotency key was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into app.workflow_runs (
      tenant_id, opportunity_id, profile_id, source_profile_id,
      state, status, token_budget, cost_budget_micros, deadline_at
    ) values (
      '27000000-0000-0000-0000-000000000001',
      '57000000-0000-0000-0000-000000000001',
      '47000000-0000-0000-0000-000000000002',
      '47000000-0000-0000-0000-000000000001', 'research', 'running',
      10000, 0, now() + interval '1 hour'
    );
    raise exception 'partial source profile metadata was accepted';
  exception when check_violation then null;
  end;
  begin
    update app.profiles set headline = 'Mutated snapshot'
    where id = '47000000-0000-0000-0000-000000000002';
    raise exception 'snapshot profile mutation was accepted';
  exception when raise_exception then
    if sqlerrm <> 'agent run profile snapshots are immutable' then raise; end if;
  end;
  begin
    update app.profiles set headline = 'Updated living profile'
    where id = '47000000-0000-0000-0000-000000000001';
    if not found then raise exception 'living profile update failed'; end if;
  end;
  begin
    delete from app.reviews
    where page_spec_id = '68000000-0000-0000-0000-000000000001';
    raise exception 'direct review deletion was accepted';
  exception when raise_exception then
    if sqlerrm <> 'reviews rows are immutable' then raise; end if;
  end;
  begin
    delete from app.approvals
    where page_spec_id = '68000000-0000-0000-0000-000000000001';
    raise exception 'direct approval deletion was accepted';
  exception when raise_exception then
    if sqlerrm <> 'approvals rows are immutable' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '27000000-0000-0000-0000-000000000001', true);
set local role career_app;

do $$
begin
  if (select count(*) from app.workflow_runs) <> 1 then
    raise exception 'tenant-scoped run read leaked another organization';
  end if;
  if exists(
    select 1 from app.workflow_runs
    where id = '67000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'cross-tenant run was readable';
  end if;
end $$;

delete from app.tenants
where id = '27000000-0000-0000-0000-000000000001';
reset role;

do $$
begin
  if exists(
    select 1 from app.workflow_runs
    where tenant_id = '27000000-0000-0000-0000-000000000001'
  ) or exists(
    select 1 from app.page_specs
    where tenant_id = '27000000-0000-0000-0000-000000000001'
  ) or exists(
    select 1 from app.reviews
    where tenant_id = '27000000-0000-0000-0000-000000000001'
  ) or exists(
    select 1 from app.approvals
    where tenant_id = '27000000-0000-0000-0000-000000000001'
  ) or exists(
    select 1 from app.profiles
    where tenant_id = '27000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'tenant cascade left agent run children behind';
  end if;
end $$;

rollback;
select 'agent runs ok' as result;
