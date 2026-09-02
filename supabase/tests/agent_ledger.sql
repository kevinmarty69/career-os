\set ON_ERROR_STOP on

begin;
insert into app.tenants (id, owner_id, name) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ledger tenant'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'Other tenant');
insert into app.opportunities (id, tenant_id, company, role, raw_text, extraction_status) values
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Northstar', 'Engineer', 'workflow', 'ready');
insert into app.workflow_runs (id, tenant_id, opportunity_id, state, token_budget, cost_budget_micros, deadline_at) values
  ('51000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'running', 100, 100, now() + interval '1 hour');

select set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000001', true);
select app.reserve_run_budget('21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 60, 60);
do $$ begin
  begin
    perform app.reserve_run_budget('21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 41, 41);
    raise exception 'budget over-reservation succeeded';
  exception when others then
    if sqlerrm = 'budget over-reservation succeeded' then raise; end if;
  end;
end $$;

do $$ begin
  begin
    perform app.reserve_run_budget('21000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 1, 1);
    raise exception 'cross-tenant budget call succeeded';
  exception when others then
    if sqlerrm = 'cross-tenant budget call succeeded' then raise; end if;
  end;
end $$;
select app.settle_run_budget('21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 60, 60, 40, 30);
do $$ begin
  if not exists(select 1 from app.workflow_runs where used_tokens = 40 and used_cost_micros = 30 and reserved_tokens = 0) then
    raise exception 'budget settlement failed';
  end if;
end $$;

set local role career_app;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    insert into app.reviews (tenant_id, page_spec_id, reviewer, verdict, page_spec_hash)
    values ('21000000-0000-0000-0000-000000000001', gen_random_uuid(), 'factuality', 'pass', 'forged');
    raise exception 'career_app forged a review';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into app.publications (tenant_id, page_spec_id, page_spec_hash)
    values ('21000000-0000-0000-0000-000000000001', gen_random_uuid(), 'forged');
    raise exception 'career_app forged a publication';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'agent ledger security ok' as result;
