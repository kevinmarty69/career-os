\set ON_ERROR_STOP on

begin;

delete from app.worker_heartbeats;

do $$
declare
  column_names text[];
begin
  select array_agg(column_name order by ordinal_position)
  into column_names
  from information_schema.columns
  where table_schema = 'app' and table_name = 'worker_heartbeats';

  if column_names is distinct from array['service', 'last_seen_at'] then
    raise exception 'heartbeat table contains unexpected data: %', column_names;
  end if;
end;
$$;

set local role career_app;
do $$
declare
  observed record;
begin
  select * into observed
  from app.worker_service_status('company-researcher');
  if observed.service <> 'company-researcher'
    or observed.last_seen_at is not null
    or observed.status <> 'missing'
  then
    raise exception 'missing service status is incorrect: %', row_to_json(observed);
  end if;

  begin
    perform app.worker_service_status('unknown-service');
    raise exception 'unknown service was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform app.record_worker_heartbeat('company-researcher');
    raise exception 'career_app recorded a worker heartbeat';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role career_company_researcher;
select app.record_worker_heartbeat('company-researcher');
do $$ begin
  begin
    perform app.record_worker_heartbeat('evidence-archivist');
    raise exception 'company researcher spoofed evidence archivist';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role career_evidence_archivist;
select app.record_worker_heartbeat('evidence-archivist');
do $$ begin
  begin
    perform app.record_worker_heartbeat('company-researcher');
    raise exception 'evidence archivist spoofed company researcher';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role career_recruiter_strategist;
select app.record_worker_heartbeat('recruiter-strategist');
reset role;

set local role career_page_composer;
select app.record_worker_heartbeat('page-composer');
reset role;

set local role career_recruiter_reviewer;
select app.record_worker_heartbeat('recruiter-reviewer');
reset role;

set local role career_hiring_manager_reviewer;
select app.record_worker_heartbeat('hiring-manager-reviewer');
reset role;

set local role career_factuality_reviewer;
select app.record_worker_heartbeat('factuality-reviewer');
do $$ begin
  begin
    perform 1 from app.worker_heartbeats;
    raise exception 'worker read heartbeat table directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role career_reader;
do $$ begin
  begin
    perform app.worker_service_status('company-researcher');
    raise exception 'career_reader read worker status';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role career_app;
do $$
declare
  observed record;
begin
  select * into observed
  from app.worker_service_status('company-researcher');
  if observed.status <> 'fresh' or observed.last_seen_at is null then
    raise exception 'recorded heartbeat is not fresh: %', row_to_json(observed);
  end if;

  if (select count(*) from app.worker_service_status('evidence-archivist')) <> 1
    or (select status from app.worker_service_status('evidence-archivist')) <> 'fresh'
  then
    raise exception 'status projection did not return one fresh row';
  end if;
end;
$$;
reset role;

update app.worker_heartbeats
set last_seen_at = clock_timestamp() - interval '16 seconds'
where service = 'company-researcher';

set local role career_app;
do $$
declare
  observed record;
begin
  select * into observed
  from app.worker_service_status('company-researcher');
  if observed.status <> 'stale' or observed.last_seen_at is null then
    raise exception 'expired heartbeat is not stale: %', row_to_json(observed);
  end if;
end;
$$;
reset role;

create temporary table expected_worker_functions (
  role_name name not null,
  signature text not null,
  primary key (role_name, signature)
) on commit drop;

insert into expected_worker_functions (role_name, signature) values
  ('career_company_researcher', 'claim_company_researcher_step(lease_seconds integer)'),
  ('career_company_researcher', 'mark_company_researcher_in_flight(target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint)'),
  ('career_company_researcher', 'complete_company_researcher_step(target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text)'),
  ('career_company_researcher', 'fail_company_researcher_step(target_step uuid, target_lease_token uuid, target_failure_code text)'),
  ('career_company_researcher', 'reap_expired_company_researcher_step()'),
  ('career_company_researcher', 'record_worker_heartbeat(target_service text)'),
  ('career_evidence_archivist', 'claim_evidence_archivist_step(lease_seconds integer)'),
  ('career_evidence_archivist', 'complete_evidence_archivist_step(target_step uuid, target_lease_token uuid, step_output jsonb)'),
  ('career_evidence_archivist', 'fail_evidence_archivist_step(target_step uuid, target_lease_token uuid, target_failure_code text)'),
  ('career_evidence_archivist', 'reap_expired_evidence_archivist_step()'),
  ('career_evidence_archivist', 'record_worker_heartbeat(target_service text)'),
  ('career_recruiter_strategist', 'claim_recruiter_strategist_step(lease_seconds integer)'),
  ('career_recruiter_strategist', 'mark_recruiter_strategist_in_flight(target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint)'),
  ('career_recruiter_strategist', 'complete_recruiter_strategist_step(target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text)'),
  ('career_recruiter_strategist', 'fail_recruiter_strategist_step(target_step uuid, target_lease_token uuid, target_failure_code text)'),
  ('career_recruiter_strategist', 'reap_expired_recruiter_strategist_step()'),
  ('career_recruiter_strategist', 'record_worker_heartbeat(target_service text)'),
  ('career_page_composer', 'claim_page_composer_step(lease_seconds integer)'),
  ('career_page_composer', 'complete_page_composer_step(target_step uuid, target_lease_token uuid, step_output jsonb)'),
  ('career_page_composer', 'fail_page_composer_step(target_step uuid, target_lease_token uuid, target_failure_code text)'),
  ('career_page_composer', 'reap_expired_page_composer_step()'),
  ('career_page_composer', 'record_worker_heartbeat(target_service text)'),
  ('career_recruiter_reviewer', 'claim_recruiter_reviewer_step(lease_seconds integer)'),
  ('career_recruiter_reviewer', 'mark_recruiter_reviewer_in_flight(target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint)'),
  ('career_recruiter_reviewer', 'complete_recruiter_reviewer_step(target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text)'),
  ('career_recruiter_reviewer', 'fail_recruiter_reviewer_step(target_step uuid, target_lease_token uuid, target_failure_code text)'),
  ('career_recruiter_reviewer', 'reap_expired_recruiter_reviewer_step()'),
  ('career_recruiter_reviewer', 'record_worker_heartbeat(target_service text)'),
  ('career_hiring_manager_reviewer', 'claim_hiring_manager_reviewer_step(lease_seconds integer)'),
  ('career_hiring_manager_reviewer', 'mark_hiring_manager_reviewer_in_flight(target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint)'),
  ('career_hiring_manager_reviewer', 'complete_hiring_manager_reviewer_step(target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text)'),
  ('career_hiring_manager_reviewer', 'fail_hiring_manager_reviewer_step(target_step uuid, target_lease_token uuid, target_failure_code text)'),
  ('career_hiring_manager_reviewer', 'reap_expired_hiring_manager_reviewer_step()'),
  ('career_hiring_manager_reviewer', 'record_worker_heartbeat(target_service text)'),
  ('career_factuality_reviewer', 'claim_factuality_reviewer_step(lease_seconds integer)'),
  ('career_factuality_reviewer', 'complete_factuality_reviewer_step(target_step uuid, target_lease_token uuid, step_output jsonb)'),
  ('career_factuality_reviewer', 'fail_factuality_reviewer_step(target_step uuid, target_lease_token uuid, target_failure_code text)'),
  ('career_factuality_reviewer', 'reap_expired_factuality_reviewer_step()'),
  ('career_factuality_reviewer', 'record_worker_heartbeat(target_service text)');

do $$
begin
  if exists (
    with worker_roles(role_name) as (
      values
        ('career_company_researcher'::name),
        ('career_evidence_archivist'::name),
        ('career_recruiter_strategist'::name),
        ('career_page_composer'::name),
        ('career_recruiter_reviewer'::name),
        ('career_hiring_manager_reviewer'::name),
        ('career_factuality_reviewer'::name)
    ), actual as (
      select worker.role_name,
        procedure.proname || '(' ||
          pg_get_function_identity_arguments(procedure.oid) || ')' as signature
      from worker_roles worker
      cross join pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('app', 'auth')
        and has_function_privilege(worker.role_name, procedure.oid, 'execute')
    )
    select 1
    from actual
    full join expected_worker_functions expected
      using (role_name, signature)
    where actual.signature is null or expected.signature is null
  ) then
    raise exception 'worker function allowlist differs from the expected final ACL';
  end if;

  if exists (
    select 1
    from expected_worker_functions worker
    where has_table_privilege(
      worker.role_name,
      'app.worker_heartbeats',
      'select,insert,update,delete,truncate,references,trigger'
    )
  ) then
    raise exception 'a worker has direct heartbeat table access';
  end if;

  if has_table_privilege(
    'career_app', 'app.worker_heartbeats',
    'select,insert,update,delete,truncate,references,trigger'
  ) then
    raise exception 'career_app has direct heartbeat table access';
  end if;

  if has_function_privilege(
    'public', 'app.record_worker_heartbeat(text)', 'execute'
  ) or has_function_privilege(
    'public', 'app.worker_service_status(text)', 'execute'
  ) then
    raise exception 'PUBLIC can execute a heartbeat function';
  end if;
end;
$$;

rollback;
select 'worker heartbeats ok' as result;
