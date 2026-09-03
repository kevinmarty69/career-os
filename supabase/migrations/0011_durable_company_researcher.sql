alter table app.workflow_steps
  drop constraint workflow_steps_status_check,
  add constraint workflow_steps_status_check check (
    status in ('pending', 'leased', 'in_flight', 'completed', 'failed', 'cancelled')
  ),
  add column input jsonb,
  add column input_hash text,
  add column provider text,
  add column model text,
  add column reservation_id uuid,
  add column dispatched_at timestamptz,
  add column failure_code text,
  add unique (tenant_id, id);

alter table app.workflow_runs
  drop constraint workflow_runs_status_check,
  add constraint workflow_runs_status_check check (status in (
    'running', 'paused', 'awaiting_approval', 'completed', 'blocked',
    'budget_exhausted', 'cancelled', 'failed'
  ));

alter table app.run_budget_reservations
  add unique (tenant_id, workflow_run_id, id);

alter table app.workflow_steps
  add foreign key (tenant_id, workflow_run_id, reservation_id)
    references app.run_budget_reservations (tenant_id, workflow_run_id, id);

alter table app.model_usage
  add column workflow_step_id uuid,
  add column usage_basis text not null default 'actual'
    check (usage_basis in ('actual', 'reserved_unknown')),
  add column provider_request_id text,
  add foreign key (tenant_id, workflow_step_id)
    references app.workflow_steps (tenant_id, id),
  add unique (workflow_step_id);

create function app.valid_company_researcher_input(candidate jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array['schemaVersion', 'company', 'role', 'description', 'source']
    and not exists (
      select 1 from jsonb_object_keys(candidate) key
      where key <> all(array['schemaVersion', 'company', 'role', 'description', 'source'])
    )
    and candidate -> 'schemaVersion' = '1'::jsonb
    and jsonb_typeof(candidate -> 'company') = 'string'
    and length(candidate ->> 'company') between 1 and 200
    and jsonb_typeof(candidate -> 'role') = 'string'
    and length(candidate ->> 'role') between 1 and 200
    and jsonb_typeof(candidate -> 'description') = 'string'
    and length(candidate ->> 'description') between 1 and 20000
    and jsonb_typeof(candidate -> 'source') = 'object'
    and (candidate -> 'source') ?& array['kind', 'trust']
    and not exists (
      select 1 from jsonb_object_keys(candidate -> 'source') key
      where key <> all(array['kind', 'url', 'trust'])
    )
    and candidate #>> '{source,kind}' = 'job-posting'
    and candidate #>> '{source,trust}' = 'untrusted-data'
    and (not (candidate -> 'source') ? 'url' or (
      jsonb_typeof(candidate #> '{source,url}') = 'string'
      and length(candidate #>> '{source,url}') between 1 and 2048
      and candidate #>> '{source,url}' ~ '^https?://'
    ))
$$;

create function app.valid_company_researcher_output(candidate jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array['company', 'role', 'signals', 'source']
    and not exists (
      select 1 from jsonb_object_keys(candidate) key
      where key <> all(array['company', 'role', 'signals', 'source'])
    )
    and jsonb_typeof(candidate -> 'company') = 'string'
    and length(candidate ->> 'company') between 1 and 200
    and jsonb_typeof(candidate -> 'role') = 'string'
    and length(candidate ->> 'role') between 1 and 200
    and jsonb_typeof(candidate -> 'signals') = 'array'
    and jsonb_array_length(candidate -> 'signals') between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'signals') item
      where jsonb_typeof(item) <> 'object'
        or not item ?& array['statement', 'excerpt', 'category', 'priority']
        or exists (
          select 1 from jsonb_object_keys(item) key
          where key <> all(array['statement', 'excerpt', 'category', 'priority'])
        )
        or jsonb_typeof(item -> 'statement') <> 'string'
        or length(item ->> 'statement') not between 1 and 500
        or jsonb_typeof(item -> 'excerpt') <> 'string'
        or length(item ->> 'excerpt') not between 1 and 1000
        or item ->> 'category' not in (
          'responsibility', 'requirement', 'culture', 'constraint'
        )
        or item ->> 'priority' not in ('high', 'medium', 'low')
    )
    and jsonb_typeof(candidate -> 'source') = 'object'
    and (candidate -> 'source') ?& array['kind', 'trust']
    and not exists (
      select 1 from jsonb_object_keys(candidate -> 'source') key
      where key <> all(array['kind', 'url', 'trust'])
    )
    and candidate #>> '{source,kind}' = 'job-posting'
    and candidate #>> '{source,trust}' = 'untrusted-data'
    and (not (candidate -> 'source') ? 'url' or (
      jsonb_typeof(candidate #> '{source,url}') = 'string'
      and length(candidate #>> '{source,url}') between 1 and 2048
      and candidate #>> '{source,url}' ~ '^https?://'
    ))
$$;

create function app.enqueue_company_researcher_step(
  run_tenant uuid, run_id uuid, step_input jsonb
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  existing app.workflow_steps%rowtype;
  step_id uuid;
  step_input_hash text;
begin
  step_input_hash := pg_catalog.encode(
    public.digest(step_input::text, 'sha256'), 'hex'
  );
  if run_tenant is null or run_id is null
    or run_tenant is distinct from app.current_tenant_id()
    or not app.active_tenant(run_tenant)
    or not app.valid_company_researcher_input(step_input) then
    raise exception 'invalid company researcher step';
  end if;

  perform 1 from app.workflow_runs
  where tenant_id = run_tenant and id = run_id and status = 'running'
    and deadline_at > clock_timestamp() for update;
  if not found then raise exception 'company researcher run unavailable'; end if;
  if exists(select 1 from app.artifacts
      where tenant_id = run_tenant and workflow_run_id = run_id and kind = 'research') then
    raise exception 'company researcher output already exists';
  end if;

  select * into existing from app.workflow_steps
  where tenant_id = run_tenant and workflow_run_id = run_id
    and idempotency_key = 'company-researcher-v1';
  if found then
    if existing.stage <> 'company-researcher'
      or existing.input_hash is distinct from step_input_hash
      or existing.input is distinct from step_input then
      raise exception 'company researcher step conflict';
    end if;
    return existing.id;
  end if;

  insert into app.workflow_steps (
    tenant_id, workflow_run_id, stage, status, idempotency_key, input, input_hash
  ) values (
    run_tenant, run_id, 'company-researcher', 'pending',
    'company-researcher-v1', step_input, step_input_hash
  ) returning id into step_id;
  return step_id;
end $$;

create function app.claim_company_researcher_step(
  run_tenant uuid, lease_seconds integer
) returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, input jsonb, input_hash text
) language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  candidate app.workflow_steps%rowtype;
begin
  if run_tenant is null or worker_id is null
    or run_tenant is distinct from app.current_tenant_id()
    or lease_seconds is null or lease_seconds not between 1 and 300 then
    raise exception 'invalid company researcher claim';
  end if;

  select ws.* into candidate
  from app.workflow_steps ws
  join app.workflow_runs wr on wr.tenant_id = ws.tenant_id
    and wr.id = ws.workflow_run_id
  where ws.tenant_id = run_tenant and ws.stage = 'company-researcher'
    and ws.dispatched_at is null
    and (ws.status = 'pending' or (
      ws.status = 'leased' and ws.lease_expires_at <= clock_timestamp()
    ))
    and wr.status = 'running' and wr.deadline_at > clock_timestamp()
  order by ws.created_at, ws.id
  for update of ws skip locked
  limit 1;
  if not found then return; end if;

  update app.workflow_steps ws set
    status = 'leased',
    attempt = case when candidate.status = 'pending'
      then candidate.attempt else candidate.attempt + 1 end,
    lease_owner = worker_id::text,
    lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds),
    failure_code = null
  where ws.id = candidate.id
  returning ws.id, ws.workflow_run_id, ws.attempt, ws.input, ws.input_hash
  into step_id, workflow_run_id, attempt, input, input_hash;
  return next;
end $$;

create function app.mark_company_researcher_in_flight(
  target_step uuid, target_reservation uuid, target_provider text, target_model text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
begin
  if target_step is null or target_reservation is null or worker_id is null
    or target_provider is null or length(target_provider) not between 1 and 100
    or target_model is null or length(target_model) not between 1 and 200 then
    raise exception 'invalid company researcher dispatch';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found or step.tenant_id is distinct from app.current_tenant_id() then
    raise exception 'company researcher step not found';
  end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.stage <> 'company-researcher' or step.status <> 'leased'
    or step.lease_owner is distinct from worker_id::text
    or step.lease_expires_at <= clock_timestamp() or step.dispatched_at is not null then
    raise exception 'company researcher lease rejected';
  end if;
  select * into reservation from app.run_budget_reservations
  where id = target_reservation for update;
  if not found or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.owner_id <> worker_id or reservation.status <> 'reserved'
    or reservation.lease_expires_at <= clock_timestamp()
    or reservation.idempotency_key <> format(
      'workflow-step:%s:attempt:%s', step.id, step.attempt
    ) then
    raise exception 'company researcher reservation rejected';
  end if;
  update app.workflow_steps set status = 'in_flight', reservation_id = reservation.id,
    provider = target_provider, model = target_model, dispatched_at = clock_timestamp()
  where id = step.id;
end $$;

create function app.protect_in_flight_reservation() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if old.status = 'reserved' and new.status = 'released' and exists(
    select 1 from app.workflow_steps ws
    where ws.reservation_id = old.id and ws.status = 'in_flight'
  ) then
    raise exception 'in-flight budget reservation cannot be released';
  end if;
  return new;
end $$;

create trigger protect_in_flight_reservation
before update of status on app.run_budget_reservations
for each row execute function app.protect_in_flight_reservation();

create function app.complete_company_researcher_step(
  target_step uuid, step_output jsonb, actual_input_tokens integer,
  actual_output_tokens integer, actual_cost bigint, actual_latency integer,
  was_cache_hit boolean, request_id text default null
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
  usage app.model_usage%rowtype;
  stored_output jsonb;
  artifact_id uuid;
  total_tokens bigint;
begin
  total_tokens := actual_input_tokens::bigint + actual_output_tokens::bigint;
  if target_step is null or worker_id is null
    or not app.valid_company_researcher_output(step_output)
    or actual_input_tokens is null or actual_input_tokens < 0
    or actual_output_tokens is null or actual_output_tokens < 0
    or total_tokens > 2147483647
    or actual_cost is null or actual_cost < 0
    or actual_latency is null or actual_latency < 0 or actual_latency > 3600000
    or was_cache_hit is null or (request_id is not null and length(request_id) > 200) then
    raise exception 'invalid company researcher completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found or step.tenant_id is distinct from app.current_tenant_id() then
    raise exception 'company researcher step not found';
  end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from worker_id::text then
    raise exception 'company researcher worker mismatch';
  end if;

  if step.status = 'completed' then
    select body into stored_output from app.artifacts where id = step.output_artifact_id;
    select * into usage from app.model_usage where workflow_step_id = step.id;
    if stored_output is distinct from step_output or not found
      or usage.input_tokens <> actual_input_tokens
      or usage.output_tokens <> actual_output_tokens
      or usage.cost_micros <> actual_cost or usage.latency_ms <> actual_latency
      or usage.cache_hit <> was_cache_hit
      or usage.provider is distinct from step.provider
      or usage.model is distinct from step.model
      or usage.provider_request_id is distinct from request_id then
      raise exception 'company researcher completion conflict';
    end if;
    return step.output_artifact_id;
  end if;
  if step.stage <> 'company-researcher' or step.status <> 'in_flight'
    or step.lease_expires_at <= clock_timestamp() or step.reservation_id is null then
    raise exception 'company researcher completion rejected';
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found then raise exception 'company researcher reservation missing'; end if;

  perform app.settle_run_budget(
    reservation.id, total_tokens::integer, actual_cost
  );
  artifact_id := gen_random_uuid();
  insert into app.artifacts (
    id, tenant_id, workflow_run_id, kind, version, schema_version, body, created_by
  ) values (
    artifact_id, step.tenant_id, step.workflow_run_id, 'research', 1, 1,
    step_output, 'company_researcher'
  );
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit,
    usage_basis, provider_request_id
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'company_researcher',
    step.provider, step.model, actual_input_tokens, actual_output_tokens,
    actual_cost, actual_latency, was_cache_hit, 'actual', request_id
  );
  update app.workflow_steps set status = 'completed', output_artifact_id = artifact_id,
    completed_at = clock_timestamp(), lease_expires_at = null
  where id = step.id;
  update app.workflow_runs set state = 'evidence_archive', status = 'paused'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'company_researcher',
    'artifact_written', 'Company researcher wrote the durable research artifact.',
    jsonb_build_object('artifactId', artifact_id, 'costMicros', actual_cost)
  );
  return artifact_id;
end $$;

create function app.fail_company_researcher_step(
  target_step uuid, target_failure_code text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
begin
  if target_step is null or worker_id is null or target_failure_code is null
    or target_failure_code !~ '^[a-z0-9_]{1,100}$' then
    raise exception 'invalid company researcher failure';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found or step.tenant_id is distinct from app.current_tenant_id() then
    raise exception 'company researcher step not found';
  end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from worker_id::text then
    raise exception 'company researcher worker mismatch';
  end if;
  if step.status = 'failed' then
    if step.failure_code is distinct from target_failure_code then
      raise exception 'company researcher failure conflict';
    end if;
    return;
  end if;
  if step.stage <> 'company-researcher' or step.status <> 'in_flight'
    or step.reservation_id is null then
    raise exception 'company researcher failure rejected';
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.status <> 'reserved' then
    raise exception 'company researcher reservation missing';
  end if;

  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_tokens = used_tokens + reservation.requested_tokens,
    used_cost_micros = used_cost_micros + reservation.requested_cost_micros
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = requested_cost_micros,
    finished_at = clock_timestamp()
  where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'company_researcher',
    step.provider, step.model, reservation.requested_tokens, 0,
    reservation.requested_cost_micros, 0, false, 'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null
  where id = step.id;
  update app.workflow_runs set state = 'research', status = 'failed'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'company_researcher', 'failed',
    'Company researcher step failed.',
    jsonb_build_object('costMicros', reservation.requested_cost_micros)
  );
end $$;

create function app.reap_expired_company_researcher_step(run_tenant uuid)
returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  candidate_id uuid;
  candidate_run uuid;
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
begin
  if run_tenant is null or worker_id is null
    or run_tenant is distinct from app.current_tenant_id() then
    raise exception 'invalid company researcher reaper';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('company-researcher-reaper:' || run_tenant::text, 0)
  );
  select id, workflow_run_id into candidate_id, candidate_run
  from app.workflow_steps
  where tenant_id = run_tenant and stage = 'company-researcher'
    and status = 'in_flight' and lease_expires_at <= clock_timestamp()
  order by lease_expires_at, id limit 1;
  if not found then return null; end if;

  perform 1 from app.workflow_runs
  where tenant_id = run_tenant and id = candidate_run for update;
  select * into step from app.workflow_steps
  where tenant_id = run_tenant and id = candidate_id for update;
  if not found or step.status <> 'in_flight'
    or step.lease_expires_at > clock_timestamp() then
    return null;
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.status <> 'reserved'
    or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id then
    raise exception 'company researcher reservation missing';
  end if;

  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_tokens = used_tokens + reservation.requested_tokens,
    used_cost_micros = used_cost_micros + reservation.requested_cost_micros,
    state = 'research', status = 'failed'
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = requested_cost_micros,
    finished_at = clock_timestamp()
  where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'company_researcher',
    step.provider, step.model, reservation.requested_tokens, 0,
    reservation.requested_cost_micros, 0, false, 'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed',
    failure_code = 'provider_outcome_unknown', completed_at = clock_timestamp(),
    lease_expires_at = null
  where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'company_researcher', 'failed',
    'Company researcher step failed.',
    jsonb_build_object('costMicros', reservation.requested_cost_micros)
  );
  return step.id;
end $$;

revoke all on app.workflow_steps, app.model_usage from career_worker;
grant select on app.workflow_steps to career_app;
grant execute on function app.enqueue_company_researcher_step(uuid, uuid, jsonb)
  to career_app;
grant execute on function app.claim_company_researcher_step(uuid, integer),
  app.mark_company_researcher_in_flight(uuid, uuid, text, text),
  app.complete_company_researcher_step(uuid, jsonb, integer, integer, bigint, integer, boolean, text),
  app.fail_company_researcher_step(uuid, text),
  app.reap_expired_company_researcher_step(uuid) to career_worker;
revoke execute on function app.valid_company_researcher_input(jsonb),
  app.valid_company_researcher_output(jsonb),
  app.protect_in_flight_reservation(),
  app.enqueue_company_researcher_step(uuid, uuid, jsonb),
  app.claim_company_researcher_step(uuid, integer),
  app.mark_company_researcher_in_flight(uuid, uuid, text, text),
  app.complete_company_researcher_step(uuid, jsonb, integer, integer, bigint, integer, boolean, text),
  app.fail_company_researcher_step(uuid, text),
  app.reap_expired_company_researcher_step(uuid) from public;
