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
select set_config('request.jwt.claim.worker_id', '31000000-0000-0000-0000-000000000001', true);
set local role career_worker;
select app.reserve_run_budget(
  '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
  'first-call', 60, 60, 300
) as budget_reservation_id \gset
select app.reserve_run_budget(
  '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
  'first-call', 60, 60, 300
) as budget_retry_id \gset
select 1 / ((:'budget_reservation_id'::uuid = :'budget_retry_id'::uuid)::integer)
  as idempotent_reservation_retry;
select set_config('test.budget_reservation_id', :'budget_reservation_id', true);
do $$ begin
  begin
    perform app.reserve_run_budget(
      '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
      'over-budget', 41, 41, 300
    );
    raise exception 'budget over-reservation succeeded';
  exception when others then
    if sqlerrm = 'budget over-reservation succeeded' then raise; end if;
  end;
end $$;

do $$ begin
  begin
    perform app.reserve_run_budget(
      '21000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001',
      'wrong-tenant', 1, 1, 300
    );
    raise exception 'cross-tenant budget call succeeded';
  exception when others then
    if sqlerrm = 'cross-tenant budget call succeeded' then raise; end if;
  end;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000002', true);
  begin
    perform app.settle_run_budget(current_setting('test.budget_reservation_id')::uuid, 40, 30);
    raise exception 'cross-tenant settlement succeeded';
  exception when others then
    if sqlerrm = 'cross-tenant settlement succeeded' then raise; end if;
  end;
  perform set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claim.worker_id', '31000000-0000-0000-0000-000000000002', true);
  begin
    perform app.settle_run_budget(current_setting('test.budget_reservation_id')::uuid, 40, 30);
    raise exception 'cross-worker settlement succeeded';
  exception when others then
    if sqlerrm = 'cross-worker settlement succeeded' then raise; end if;
  end;
  perform set_config('request.jwt.claim.worker_id', '31000000-0000-0000-0000-000000000001', true);
end $$;

select app.settle_run_budget(:'budget_reservation_id'::uuid, 40, 30);
do $$ begin
  begin
    perform app.settle_run_budget(current_setting('test.budget_reservation_id')::uuid, 40, 30);
    raise exception 'double settlement succeeded';
  exception when others then
    if sqlerrm = 'double settlement succeeded' then raise; end if;
  end;
end $$;
do $$ begin
  begin
    perform app.reserve_run_budget(
      '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
      'first-call', 60, 60, 300
    );
    raise exception 'finalized idempotency key reused';
  exception when others then
    if sqlerrm = 'finalized idempotency key reused' then raise; end if;
  end;
end $$;

select app.reserve_run_budget(
  '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
  'release-call', 10, 10, 300
) as release_reservation_id \gset
select set_config('test.release_reservation_id', :'release_reservation_id', true);
do $$ begin
  perform set_config('request.jwt.claim.worker_id', '31000000-0000-0000-0000-000000000002', true);
  begin
    perform app.release_run_budget(current_setting('test.release_reservation_id')::uuid);
    raise exception 'cross-worker release succeeded';
  exception when others then
    if sqlerrm = 'cross-worker release succeeded' then raise; end if;
  end;
  perform set_config('request.jwt.claim.worker_id', '31000000-0000-0000-0000-000000000001', true);
end $$;
select app.release_run_budget(:'release_reservation_id'::uuid);
do $$ begin
  begin
    perform app.release_run_budget(current_setting('test.release_reservation_id')::uuid);
    raise exception 'double release succeeded';
  exception when others then
    if sqlerrm = 'double release succeeded' then raise; end if;
  end;
end $$;

select app.reserve_run_budget(
  '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
  'expiring-call', 10, 10, 1
);
select pg_sleep(1.1);
select app.reserve_run_budget(
  '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
  'after-expiry', 60, 60, 300
) as after_expiry_reservation_id \gset
select app.release_run_budget(:'after_expiry_reservation_id'::uuid);

reset role;
do $$ begin
  if not exists(select 1 from app.workflow_runs
    where id = '51000000-0000-0000-0000-000000000001'
      and used_tokens = 40 and used_cost_micros = 30
      and reserved_tokens = 0 and reserved_cost_micros = 0) then
    raise exception 'budget settlement failed';
  end if;
end $$;
do $$ begin
  if to_regprocedure('app.reserve_run_budget(uuid,uuid,integer,bigint)') is not null
    or to_regprocedure('app.settle_run_budget(uuid,uuid,integer,bigint,integer,bigint)') is not null then
    raise exception 'unsafe legacy budget functions remain callable';
  end if;
  if not has_function_privilege(
    'career_worker', 'app.reserve_run_budget(uuid,uuid,text,integer,bigint,integer)', 'execute'
  ) or has_function_privilege(
    'career_app', 'app.reserve_run_budget(uuid,uuid,text,integer,bigint,integer)', 'execute'
  ) or has_table_privilege('career_worker', 'app.run_budget_reservations', 'select') then
    raise exception 'budget reservation privileges are unsafe';
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
