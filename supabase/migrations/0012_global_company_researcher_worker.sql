do $$ begin
  create role career_company_researcher nologin;
exception when duplicate_object then null;
end $$;

alter role career_company_researcher nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;

do $$
declare inherited_role name;
begin
  for inherited_role in
    select granted.rolname
    from pg_auth_members membership
    join pg_roles member on member.oid = membership.member
    join pg_roles granted on granted.oid = membership.roleid
    where member.rolname = 'career_company_researcher'
  loop
    execute format(
      'revoke %I from career_company_researcher', inherited_role
    );
  end loop;
end $$;

create index workflow_steps_tenant_stage_created
  on app.workflow_steps (tenant_id, stage, created_at desc);

create function app.claim_company_researcher_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate app.workflow_steps%rowtype;
  generated_lease_token uuid := gen_random_uuid();
begin
  if lease_seconds is null or lease_seconds not between 1 and 300 then
    raise exception 'invalid company researcher claim';
  end if;

  select ws.* into candidate
  from app.workflow_steps ws
  join app.workflow_runs wr on wr.tenant_id = ws.tenant_id
    and wr.id = ws.workflow_run_id
  where ws.stage = 'company-researcher'
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
    lease_owner = generated_lease_token::text,
    lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds),
    failure_code = null
  where ws.id = candidate.id
  returning ws.id, ws.workflow_run_id, ws.attempt, generated_lease_token,
    ws.input, ws.input_hash
  into step_id, workflow_run_id, attempt, lease_token, input, input_hash;
  return next;
end $$;

create function app.mark_company_researcher_in_flight(
  target_step uuid, target_lease_token uuid, target_provider text,
  target_model text, reserve_tokens integer, reserve_cost bigint
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  expired_tokens bigint;
  expired_cost bigint;
  reclaim_before timestamptz;
  generated_reservation_id uuid;
begin
  if target_step is null or target_lease_token is null
    or target_provider is null or length(target_provider) not between 1 and 100
    or target_model is null or length(target_model) not between 1 and 200
    or reserve_tokens is null or reserve_cost is null
    or reserve_tokens < 0 or reserve_cost < 0
    or (reserve_tokens = 0 and reserve_cost = 0) then
    raise exception 'invalid company researcher dispatch';
  end if;

  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'company researcher step not found'; end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.stage <> 'company-researcher' or step.status <> 'leased'
    or step.lease_owner is distinct from target_lease_token::text
    or step.lease_expires_at <= clock_timestamp() or step.dispatched_at is not null then
    raise exception 'company researcher lease rejected';
  end if;

  reclaim_before := clock_timestamp();
  select coalesce(sum(r.requested_tokens), 0),
    coalesce(sum(r.requested_cost_micros), 0)
  into expired_tokens, expired_cost
  from app.run_budget_reservations r
  where r.tenant_id = step.tenant_id and r.workflow_run_id = step.workflow_run_id
    and r.status = 'reserved' and r.lease_expires_at <= reclaim_before
    and not exists(
      select 1 from app.workflow_steps in_flight
      where in_flight.reservation_id = r.id and in_flight.status = 'in_flight'
    );
  if expired_tokens > 0 or expired_cost > 0 then
    update app.workflow_runs set
      reserved_tokens = reserved_tokens - expired_tokens,
      reserved_cost_micros = reserved_cost_micros - expired_cost
    where tenant_id = step.tenant_id and id = step.workflow_run_id
      and reserved_tokens >= expired_tokens and reserved_cost_micros >= expired_cost;
    if not found then raise exception 'budget reservation aggregate corrupted'; end if;
    update app.run_budget_reservations r set
      status = 'released', finished_at = clock_timestamp()
    where r.tenant_id = step.tenant_id and r.workflow_run_id = step.workflow_run_id
      and r.status = 'reserved' and r.lease_expires_at <= reclaim_before
      and not exists(
        select 1 from app.workflow_steps in_flight
        where in_flight.reservation_id = r.id and in_flight.status = 'in_flight'
      );
  end if;

  update app.workflow_runs set
    reserved_tokens = reserved_tokens + reserve_tokens,
    reserved_cost_micros = reserved_cost_micros + reserve_cost
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and status = 'running' and deadline_at > clock_timestamp()
    and used_tokens + reserved_tokens + reserve_tokens <= token_budget
    and used_cost_micros + reserved_cost_micros + reserve_cost <= cost_budget_micros;
  if not found then raise exception 'company researcher budget rejected'; end if;

  insert into app.run_budget_reservations (
    tenant_id, workflow_run_id, idempotency_key, owner_id,
    requested_tokens, requested_cost_micros, lease_expires_at
  ) values (
    step.tenant_id, step.workflow_run_id,
    format('workflow-step:%s:attempt:%s', step.id, step.attempt),
    target_lease_token, reserve_tokens, reserve_cost, step.lease_expires_at
  ) returning id into generated_reservation_id;
  update app.workflow_steps set status = 'in_flight',
    reservation_id = generated_reservation_id,
    provider = target_provider, model = target_model, dispatched_at = clock_timestamp()
  where id = step.id;
end $$;

create function app.complete_company_researcher_step(
  target_step uuid, target_lease_token uuid, step_output jsonb,
  actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint,
  actual_latency integer, was_cache_hit boolean, request_id text default null
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
  usage app.model_usage%rowtype;
  stored_output jsonb;
  artifact_id uuid;
  total_tokens bigint;
begin
  total_tokens := actual_input_tokens::bigint + actual_output_tokens::bigint;
  if target_step is null or target_lease_token is null
    or actual_input_tokens is null or actual_input_tokens < 0
    or actual_output_tokens is null or actual_output_tokens < 0
    or total_tokens > 2147483647
    or actual_cost is null or actual_cost < 0
    or actual_latency is null or actual_latency < 0 or actual_latency > 3600000
    or was_cache_hit is null or (request_id is not null and length(request_id) > 200) then
    raise exception 'invalid company researcher completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'company researcher step not found'; end if;
  if not app.valid_company_researcher_output(step_output)
    or step_output ->> 'company' is distinct from step.input ->> 'company'
    or step_output ->> 'role' is distinct from step.input ->> 'role'
    or step_output -> 'source' is distinct from step.input -> 'source'
    or exists (
      select 1 from jsonb_array_elements(step_output -> 'signals') signal
      where strpos(step.input ->> 'description', signal ->> 'excerpt') = 0
    ) then
    raise exception 'invalid company researcher provenance';
  end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'company researcher lease token mismatch';
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
  if not found or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.owner_id <> target_lease_token or reservation.status <> 'reserved'
    or reservation.lease_expires_at <= clock_timestamp()
    or total_tokens > reservation.requested_tokens
    or actual_cost > reservation.requested_cost_micros then
    raise exception 'company researcher reservation rejected';
  end if;

  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_tokens = used_tokens + total_tokens::integer,
    used_cost_micros = used_cost_micros + actual_cost
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = total_tokens::integer, actual_cost_micros = actual_cost,
    finished_at = clock_timestamp()
  where id = reservation.id;

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
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
begin
  if target_step is null or target_lease_token is null
    or target_failure_code is null
    or target_failure_code !~ '^[a-z0-9_]{1,100}$' then
    raise exception 'invalid company researcher failure';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'company researcher step not found'; end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'company researcher lease token mismatch';
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
  if not found or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.owner_id <> target_lease_token or reservation.status <> 'reserved' then
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

create function app.reap_expired_company_researcher_step()
returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate_id uuid;
  candidate_tenant uuid;
  candidate_run uuid;
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('company-researcher-global-reaper', 0)
  );
  select id, tenant_id, workflow_run_id
  into candidate_id, candidate_tenant, candidate_run
  from app.workflow_steps
  where stage = 'company-researcher' and status = 'in_flight'
    and lease_expires_at <= clock_timestamp()
  order by lease_expires_at, id limit 1;
  if not found then return null; end if;

  perform 1 from app.workflow_runs
  where tenant_id = candidate_tenant and id = candidate_run for update;
  select * into step from app.workflow_steps
  where tenant_id = candidate_tenant and id = candidate_id for update;
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

revoke execute on function
  app.reserve_run_budget(uuid, uuid, text, integer, bigint, integer),
  app.settle_run_budget(uuid, integer, bigint), app.release_run_budget(uuid),
  app.claim_company_researcher_step(uuid, integer),
  app.mark_company_researcher_in_flight(uuid, uuid, text, text),
  app.complete_company_researcher_step(uuid, jsonb, integer, integer, bigint, integer, boolean, text),
  app.fail_company_researcher_step(uuid, text),
  app.reap_expired_company_researcher_step(uuid) from career_worker;

grant execute on function app.current_tenant_id(), app.current_worker_id(),
  app.active_tenant(uuid) to career_worker;

grant usage on schema app to career_company_researcher;
revoke all on all tables in schema app from career_company_researcher;
revoke usage, select on all sequences in schema app from career_company_researcher;
grant execute on function app.claim_company_researcher_step(integer),
  app.mark_company_researcher_in_flight(uuid, uuid, text, text, integer, bigint),
  app.complete_company_researcher_step(uuid, uuid, jsonb, integer, integer, bigint, integer, boolean, text),
  app.fail_company_researcher_step(uuid, uuid, text),
  app.reap_expired_company_researcher_step() to career_company_researcher;
revoke execute on function app.claim_company_researcher_step(integer),
  app.mark_company_researcher_in_flight(uuid, uuid, text, text, integer, bigint),
  app.complete_company_researcher_step(uuid, uuid, jsonb, integer, integer, bigint, integer, boolean, text),
  app.fail_company_researcher_step(uuid, uuid, text),
  app.reap_expired_company_researcher_step() from public;

revoke execute on all functions in schema app from public;
revoke execute on all functions in schema auth from public;
revoke usage on schema app, auth from public;
