-- Remote BYOK uses the same fenced steps and atomic budget ledger as local inference.
-- Costs are conservative operator-rate estimates, not provider invoices.
alter table app.semantic_analyses
  drop constraint semantic_analyses_cost_budget_micros_check,
  drop constraint semantic_analyses_cost_micros_check,
  add constraint semantic_analyses_cost_budget_micros_check check (cost_budget_micros >= 0),
  add constraint semantic_analyses_cost_micros_check check (cost_micros >= 0 and cost_micros <= cost_budget_micros);

alter table app.model_usage add column cost_basis text generated always as (
  case when usage_basis = 'reserved_unknown' then 'reserved_upper_bound'
    when provider = 'openai-compatible-remote' or cost_micros > 0 then 'configured_rate_estimate'
    else 'local_no_api_charge' end
) stored;

create or replace function app.mark_recruiter_strategist_in_flight(
  target_step uuid, target_lease_token uuid, target_provider text,
  target_model text, reserve_tokens integer, reserve_cost bigint
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  generated_reservation uuid;
begin
  if target_step is null or target_lease_token is null
    or target_provider is null or target_provider not in ('openai-compatible-local', 'openai-compatible-remote')
    or target_model is null or length(target_model) not between 1 and 200
    or reserve_tokens is null or reserve_tokens not between 1 and 132096
    or reserve_cost is null or reserve_cost < 0 then
    raise exception 'invalid recruiter strategist dispatch';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'recruiter strategist step not found'; end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.stage <> 'recruiter-strategist' or step.status <> 'leased'
    or step.lease_owner is distinct from target_lease_token::text
    or step.lease_expires_at <= clock_timestamp() or step.dispatched_at is not null then
    raise exception 'recruiter strategist lease rejected';
  end if;
  update app.workflow_runs set reserved_tokens = reserved_tokens + reserve_tokens,
    reserved_cost_micros = reserved_cost_micros + reserve_cost
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and status = 'running' and state = 'strategy' and deadline_at > clock_timestamp()
    and used_tokens + reserved_tokens + reserve_tokens <= token_budget
    and used_cost_micros + reserved_cost_micros + reserve_cost <= cost_budget_micros;
  if not found then raise exception 'recruiter strategist budget rejected'; end if;
  insert into app.run_budget_reservations (
    tenant_id, workflow_run_id, idempotency_key, owner_id,
    requested_tokens, requested_cost_micros, lease_expires_at
  ) values (
    step.tenant_id, step.workflow_run_id,
    format('workflow-step:%s:attempt:%s', step.id, step.attempt),
    target_lease_token, reserve_tokens, reserve_cost, step.lease_expires_at
  ) returning id into generated_reservation;
  update app.workflow_steps set status = 'in_flight',
    reservation_id = generated_reservation, provider = target_provider,
    model = target_model, dispatched_at = clock_timestamp()
  where id = step.id;
end $$;

create or replace function app.complete_recruiter_strategist_step(
  target_step uuid, target_lease_token uuid, step_output jsonb,
  actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint,
  actual_latency integer, was_cache_hit boolean, request_id text default null
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  target_run app.workflow_runs%rowtype;
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
    or total_tokens > 2147483647 or actual_cost is null or actual_cost < 0
    or actual_latency is null or actual_latency < 0 or actual_latency > 3600000
    or was_cache_hit is null or (request_id is not null and length(request_id) > 200)
    or not app.valid_recruiter_strategy_output(step_output) then
    raise exception 'invalid recruiter strategist completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'recruiter strategist step not found'; end if;
  if step_output ->> 'profileSnapshotId' is distinct from step.input ->> 'profileSnapshotId'
    or step_output ->> 'researchArtifactId' is distinct from step.input ->> 'researchArtifactId'
    or step_output ->> 'researchArtifactHash' is distinct from step.input ->> 'researchArtifactHash'
    or step_output ->> 'evidenceArchiveArtifactId' is distinct from step.input ->> 'evidenceArchiveArtifactId'
    or step_output ->> 'evidenceArchiveArtifactHash' is distinct from step.input ->> 'evidenceArchiveArtifactHash'
    or step_output ->> 'purpose' is distinct from step.input ->> 'purpose' then
    raise exception 'invalid recruiter strategist lineage';
  end if;
  if (select count(*) from (
      select step_output #>> '{lead,signalId}' signal_id
      union all
      select item ->> 'signalId' from jsonb_array_elements(step_output -> 'supports') item
      union all
      select item ->> 'signalId' from jsonb_array_elements(step_output -> 'gaps') item
      union all
      select value from jsonb_array_elements_text(step_output -> 'omittedSignalIds') value
    ) partitioned) <> (select count(*) from jsonb_array_elements(step.input -> 'signals'))
    or (select count(distinct signal_id) from (
      select step_output #>> '{lead,signalId}' signal_id
      union all
      select item ->> 'signalId' from jsonb_array_elements(step_output -> 'supports') item
      union all
      select item ->> 'signalId' from jsonb_array_elements(step_output -> 'gaps') item
      union all
      select value from jsonb_array_elements_text(step_output -> 'omittedSignalIds') value
    ) partitioned) <> (select count(*) from jsonb_array_elements(step.input -> 'signals'))
    or exists (
      select signal ->> 'signalId' from jsonb_array_elements(step.input -> 'signals') signal
      except
      select signal_id from (
        select step_output #>> '{lead,signalId}' signal_id
        union all
        select item ->> 'signalId' from jsonb_array_elements(step_output -> 'supports') item
        union all
        select item ->> 'signalId' from jsonb_array_elements(step_output -> 'gaps') item
        union all
        select value from jsonb_array_elements_text(step_output -> 'omittedSignalIds') value
      ) ids
    ) then raise exception 'invalid recruiter strategist signal partition'; end if;
  if exists (
    select 1 from (
      select step_output -> 'lead' selection
      union all
      select item from jsonb_array_elements(step_output -> 'supports') item
    ) selected
    where not exists (
      select 1 from jsonb_array_elements(step.input -> 'signals') signal,
        jsonb_array_elements(signal -> 'matches') match
      where signal ->> 'signalId' = selected.selection ->> 'signalId'
        and match ->> 'claimId' = selected.selection ->> 'claimId'
        and not exists (
          select 1 from jsonb_array_elements_text(
            selected.selection -> 'evidenceIds'
          ) output_id
          where not exists (
            select 1 from jsonb_array_elements(match -> 'evidence') proof
            where proof ->> 'evidenceId' = output_id
          )
        )
    )
  ) then raise exception 'invalid recruiter strategist proof selection'; end if;
  if exists (
    select selected.selection ->> 'claimId'
    from (
      select step_output -> 'lead' selection
      union all
      select item from jsonb_array_elements(step_output -> 'supports') item
    ) selected
    group by selected.selection ->> 'claimId'
    having count(*) > 2
  ) then raise exception 'invalid recruiter strategist proof reuse'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(
      step_output #> '{positioning,sourceSignalIds}'
    ) positioned(signal_id)
    where positioned.signal_id <> step_output #>> '{lead,signalId}'
      and not exists (
        select 1 from jsonb_array_elements(step_output -> 'supports') support
        where support ->> 'signalId' = positioned.signal_id
      )
  ) or step_output #>> '{positioning,sourceSignalIds,0}'
      is distinct from step_output #>> '{lead,signalId}' then
    raise exception 'invalid recruiter strategist positioning sources';
  end if;
  if not app.valid_recruiter_strategy_grounding(step_output, step.input) then
    raise exception 'invalid recruiter strategist grounding';
  end if;

  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'recruiter strategist run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'recruiter strategist lease token mismatch';
  end if;
  if step.status = 'completed' then
    select body into stored_output from app.artifacts where id = step.output_artifact_id;
    select * into usage from app.model_usage where workflow_step_id = step.id;
    if not found or stored_output is distinct from step_output
      or usage.input_tokens <> actual_input_tokens
      or usage.output_tokens <> actual_output_tokens or usage.cost_micros <> actual_cost
      or usage.latency_ms <> actual_latency or usage.cache_hit <> was_cache_hit
      or usage.provider is distinct from step.provider
      or usage.model is distinct from step.model
      or usage.provider_request_id is distinct from request_id then
      raise exception 'recruiter strategist completion conflict';
    end if;
    return step.output_artifact_id;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'strategy'
    or target_run.deadline_at <= clock_timestamp()
    or step.stage <> 'recruiter-strategist' or step.status <> 'in_flight'
    or step.lease_expires_at <= clock_timestamp() or step.reservation_id is null then
    raise exception 'recruiter strategist completion rejected';
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.owner_id <> target_lease_token or reservation.status <> 'reserved'
    or reservation.lease_expires_at <= clock_timestamp()
    or total_tokens > reservation.requested_tokens
    or actual_cost > reservation.requested_cost_micros then
    raise exception 'recruiter strategist reservation rejected';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_cost_micros = used_cost_micros + actual_cost,
    used_tokens = used_tokens + total_tokens::integer
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = total_tokens::integer, actual_cost_micros = actual_cost,
    finished_at = clock_timestamp() where id = reservation.id;
  artifact_id := gen_random_uuid();
  insert into app.artifacts (
    id, tenant_id, workflow_run_id, kind, version, schema_version, body, created_by
  ) values (
    artifact_id, step.tenant_id, step.workflow_run_id, 'strategy', 1, 1,
    step_output, 'recruiter_strategist'
  );
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit,
    usage_basis, provider_request_id
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'recruiter_strategist',
    step.provider, step.model, actual_input_tokens, actual_output_tokens, actual_cost,
    actual_latency, was_cache_hit, 'actual', request_id
  );
  update app.workflow_steps set status = 'completed', output_artifact_id = artifact_id,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  update app.workflow_runs set state = 'strategy_review', status = 'paused'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'recruiter_strategist',
    'artifact_written', 'Recruiter strategist wrote the durable strategy artifact.',
    jsonb_build_object('artifactId', artifact_id, 'costMicros', actual_cost)
  );
  return artifact_id;
end $$;

create or replace function app.fail_recruiter_strategist_step(
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
begin
  if target_step is null or target_lease_token is null
    or target_failure_code is null
    or target_failure_code !~ '^[a-z0-9_]{1,100}$' then
    raise exception 'invalid recruiter strategist failure';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'recruiter strategist step not found'; end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'recruiter strategist lease token mismatch';
  end if;
  if step.status = 'failed' then
    if step.failure_code is distinct from target_failure_code then
      raise exception 'recruiter strategist failure conflict';
    end if;
    return;
  end if;
  if step.stage = 'recruiter-strategist' and step.status = 'leased'
    and step.dispatched_at is null and step.reservation_id is null
    and step.lease_expires_at > clock_timestamp()
    and target_failure_code = 'invalid_step_input' then
    update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
      completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
    update app.workflow_runs set
      state = case when status = 'running' then 'strategy' else state end,
      status = case when status = 'running' then 'failed' else status end
    where tenant_id = step.tenant_id and id = step.workflow_run_id;
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      step.tenant_id, step.workflow_run_id, 'recruiter_strategist', 'failed',
      'Recruiter strategist step failed.', jsonb_build_object('costMicros', 0)
    );
    return;
  end if;
  if step.stage <> 'recruiter-strategist' or step.status <> 'in_flight'
    or step.reservation_id is null then
    raise exception 'recruiter strategist failure rejected';
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.owner_id <> target_lease_token or reservation.status <> 'reserved'
    or reservation.requested_cost_micros < 0 then
    raise exception 'recruiter strategist reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_cost_micros = used_cost_micros + reservation.requested_cost_micros,
    used_tokens = used_tokens + reservation.requested_tokens,
    state = case when status = 'running' then 'strategy' else state end,
    status = case when status = 'running' then 'failed' else status end
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = requested_cost_micros,
    finished_at = clock_timestamp() where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'recruiter_strategist',
    step.provider, step.model, reservation.requested_tokens, 0, reservation.requested_cost_micros, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'recruiter_strategist', 'failed',
    'Recruiter strategist step failed.', jsonb_build_object('costMicros', reservation.requested_cost_micros)
  );
end $$;

create or replace function app.reap_expired_recruiter_strategist_step()
returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate_id uuid;
  candidate_tenant uuid;
  candidate_run uuid;
  step app.workflow_steps%rowtype;
  reservation app.run_budget_reservations%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('recruiter-strategist-global-reaper', 0)
  );
  select workflow_step.id, workflow_step.tenant_id, workflow_step.workflow_run_id
  into candidate_id, candidate_tenant, candidate_run
  from app.workflow_steps workflow_step
  join app.workflow_runs workflow_run
    on workflow_run.tenant_id = workflow_step.tenant_id
    and workflow_run.id = workflow_step.workflow_run_id
  where workflow_step.stage = 'recruiter-strategist' and (
    (workflow_step.status = 'in_flight'
      and workflow_step.lease_expires_at <= clock_timestamp())
    or (workflow_step.status in ('pending', 'leased')
      and workflow_run.status = 'running' and workflow_run.state = 'strategy'
      and workflow_run.deadline_at <= clock_timestamp())
  )
  order by coalesce(workflow_step.lease_expires_at, workflow_run.deadline_at),
    workflow_step.id limit 1;
  if not found then return null; end if;
  perform 1 from app.workflow_runs
  where tenant_id = candidate_tenant and id = candidate_run for update;
  select * into step from app.workflow_steps
  where tenant_id = candidate_tenant and id = candidate_id for update;
  if not found then return null; end if;

  if step.status in ('pending', 'leased') then
    if not exists (
      select 1 from app.workflow_runs where tenant_id = step.tenant_id
        and id = step.workflow_run_id and status = 'running' and state = 'strategy'
        and deadline_at <= clock_timestamp()
    ) then return null; end if;
    update app.workflow_steps set status = 'failed', failure_code = 'deadline_exceeded',
      completed_at = clock_timestamp(), lease_owner = null, lease_expires_at = null
    where id = step.id;
    update app.workflow_runs set status = 'failed', state = 'strategy'
    where tenant_id = step.tenant_id and id = step.workflow_run_id;
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      step.tenant_id, step.workflow_run_id, 'recruiter_strategist', 'failed',
      'Recruiter strategist deadline exceeded.',
      jsonb_build_object('failureCode', 'deadline_exceeded', 'costMicros', 0)
    );
    return step.id;
  end if;
  if step.status <> 'in_flight' or step.lease_expires_at > clock_timestamp() then
    return null;
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.status <> 'reserved'
    or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.requested_cost_micros < 0 then
    raise exception 'recruiter strategist reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_cost_micros = used_cost_micros + reservation.requested_cost_micros,
    used_tokens = used_tokens + reservation.requested_tokens,
    state = case when status = 'running' then 'strategy' else state end,
    status = case when status = 'running' then 'failed' else status end
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = requested_cost_micros,
    finished_at = clock_timestamp() where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'recruiter_strategist',
    step.provider, step.model, reservation.requested_tokens, 0, reservation.requested_cost_micros, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed',
    failure_code = 'provider_outcome_unknown', completed_at = clock_timestamp(),
    lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'recruiter_strategist', 'failed',
    'Recruiter strategist step failed.', jsonb_build_object('costMicros', reservation.requested_cost_micros)
  );
  return step.id;
end $$;

create or replace function app.mark_durable_reviewer_in_flight(
  target_stage text, target_state text, target_step uuid,
  target_lease_token uuid, target_provider text, target_model text,
  reserve_tokens integer, reserve_cost bigint
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare step app.workflow_steps%rowtype; generated_reservation uuid;
begin
  if (target_stage, target_state) not in (
      ('recruiter-reviewer','review_recruiter'),
      ('hiring-manager-reviewer','review_hiring_manager')
    ) or target_step is null or target_lease_token is null
    or target_provider is null or target_provider not in ('openai-compatible-local', 'openai-compatible-remote')
    or target_model is null or length(target_model) not between 1 and 200
    or reserve_tokens is null or reserve_tokens not between 1 and 99328
    or reserve_cost is null or reserve_cost < 0 then
    raise exception 'invalid durable reviewer dispatch';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'durable reviewer step not found'; end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.stage <> target_stage or step.status <> 'leased'
    or step.lease_owner is distinct from target_lease_token::text
    or step.lease_expires_at <= clock_timestamp()
    or step.dispatched_at is not null then
    raise exception 'durable reviewer lease rejected';
  end if;
  update app.workflow_runs set reserved_tokens = reserved_tokens + reserve_tokens,
    reserved_cost_micros = reserved_cost_micros + reserve_cost
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and status = 'running' and state = target_state
    and deadline_at > clock_timestamp()
    and used_tokens + reserved_tokens + reserve_tokens <= token_budget
    and used_cost_micros + reserved_cost_micros + reserve_cost <= cost_budget_micros;
  if not found then raise exception 'durable reviewer budget rejected'; end if;
  insert into app.run_budget_reservations (
    tenant_id, workflow_run_id, idempotency_key, owner_id,
    requested_tokens, requested_cost_micros, lease_expires_at
  ) values (
    step.tenant_id, step.workflow_run_id,
    format('workflow-step:%s:attempt:%s', step.id, step.attempt),
    target_lease_token, reserve_tokens, reserve_cost, step.lease_expires_at
  ) returning id into generated_reservation;
  update app.workflow_steps set status = 'in_flight',
    reservation_id = generated_reservation, provider = target_provider,
    model = target_model, dispatched_at = clock_timestamp()
  where id = step.id;
end $$;

create or replace function app.complete_durable_provider_review_step(
  target_stage text, target_state text, target_reviewer text,
  target_actor app.actor_role, target_version integer,
  target_step uuid, target_lease_token uuid, step_output jsonb,
  actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint,
  actual_latency integer, was_cache_hit boolean, request_id text default null
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare step app.workflow_steps%rowtype; target_run app.workflow_runs%rowtype;
  reservation app.run_budget_reservations%rowtype; usage app.model_usage%rowtype;
  stored_output jsonb; artifact_id uuid; review_id uuid; total_tokens bigint;
  next_reviewer text; next_state text; next_input jsonb;
begin
  total_tokens := actual_input_tokens::bigint + actual_output_tokens::bigint;
  if (target_stage, target_state, target_reviewer, target_actor::text, target_version)
      not in (
        ('recruiter-reviewer','review_recruiter','recruiter','recruiter',1),
        ('hiring-manager-reviewer','review_hiring_manager','hiring_manager',
          'hiring_manager',2)
      )
    or target_step is null or target_lease_token is null
    or actual_input_tokens is null or actual_input_tokens < 0
    or actual_output_tokens is null or actual_output_tokens < 0
    or total_tokens > 2147483647 or actual_cost is null or actual_cost < 0
    or actual_latency is null or actual_latency < 0 or actual_latency > 3600000
    or was_cache_hit is null or (request_id is not null and length(request_id) > 200)
    or not app.valid_durable_review_output(step_output) then
    raise exception 'invalid durable reviewer completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found or step.stage <> target_stage
    or step.input ->> 'reviewer' <> target_reviewer
    or not app.durable_review_output_grounded(step_output, step.input)
    or step.input_hash is distinct from encode(
      extensions.digest(step.input::text, 'sha256'), 'hex'
    ) then raise exception 'invalid durable reviewer provenance'; end if;
  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'durable reviewer run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'durable reviewer lease token mismatch';
  end if;
  if step.status = 'completed' then
    select body into stored_output from app.artifacts where id = step.output_artifact_id;
    select * into usage from app.model_usage where workflow_step_id = step.id;
    if not found or stored_output is distinct from step_output
      or usage.input_tokens <> actual_input_tokens
      or usage.output_tokens <> actual_output_tokens or usage.cost_micros <> actual_cost
      or usage.latency_ms <> actual_latency or usage.cache_hit <> was_cache_hit
      or usage.provider is distinct from step.provider
      or usage.model is distinct from step.model
      or usage.provider_request_id is distinct from request_id then
      raise exception 'durable reviewer completion conflict';
    end if;
    return step.output_artifact_id;
  end if;
  if target_run.status <> 'running' or target_run.state <> target_state
    or target_run.deadline_at <= clock_timestamp()
    or step.status <> 'in_flight' or step.lease_expires_at <= clock_timestamp()
    or step.reservation_id is null then
    raise exception 'durable reviewer completion rejected';
  end if;
  if not exists (
    select 1 from app.review_starts started
    join app.page_specs page on page.tenant_id = started.tenant_id
      and page.id = started.page_spec_id and page.workflow_run_id = started.workflow_run_id
      and page.invalidated_at is null and page.spec_hash = started.page_spec_hash
      and page.source_artifact_id = started.page_spec_artifact_id
    join app.artifacts page_artifact on page_artifact.tenant_id = started.tenant_id
      and page_artifact.workflow_run_id = started.workflow_run_id
      and page_artifact.id = started.page_spec_artifact_id
      and encode(extensions.digest(page_artifact.body::text, 'sha256'), 'hex')
        = started.page_spec_artifact_hash
    where started.tenant_id = step.tenant_id
      and started.workflow_run_id = step.workflow_run_id
      and started.id::text = step.input ->> 'reviewStartId'
      and started.page_spec_id::text = step.input ->> 'pageSpecId'
      and started.page_spec_hash = step.input ->> 'pageSpecHash'
      and started.page_spec_artifact_id::text = step.input ->> 'pageSpecArtifactId'
      and started.page_spec_artifact_hash = step.input ->> 'pageSpecArtifactHash'
  ) then raise exception 'durable reviewer lineage rejected'; end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.owner_id <> target_lease_token or reservation.status <> 'reserved'
    or reservation.lease_expires_at <= clock_timestamp()
    or total_tokens > reservation.requested_tokens
    or actual_cost > reservation.requested_cost_micros then
    raise exception 'durable reviewer reservation rejected';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_cost_micros = used_cost_micros + actual_cost,
    used_tokens = used_tokens + total_tokens::integer
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = total_tokens::integer, actual_cost_micros = actual_cost,
    finished_at = clock_timestamp() where id = reservation.id;

  artifact_id := gen_random_uuid();
  review_id := gen_random_uuid();
  insert into app.artifacts (
    id, tenant_id, workflow_run_id, kind, version, schema_version, body, created_by
  ) values (
    artifact_id, step.tenant_id, step.workflow_run_id, 'review', target_version,
    1, step_output, target_actor
  );
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit,
    usage_basis, provider_request_id
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, target_actor,
    step.provider, step.model, actual_input_tokens, actual_output_tokens, actual_cost,
    actual_latency, was_cache_hit, 'actual', request_id
  );
  insert into app.reviews (
    id, tenant_id, workflow_run_id, workflow_step_id, output_artifact_id,
    page_spec_id, page_spec_hash, reviewer, verdict, issues
  ) values (
    review_id, step.tenant_id, step.workflow_run_id, step.id, artifact_id,
    (step.input ->> 'pageSpecId')::uuid, step.input ->> 'pageSpecHash',
    target_reviewer, step_output ->> 'verdict', step_output -> 'issues'
  );
  update app.workflow_steps set status = 'completed', output_artifact_id = artifact_id,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;

  if target_reviewer = 'recruiter' then
    next_reviewer := 'hiring_manager'; next_state := 'review_hiring_manager';
  else
    next_reviewer := 'factuality'; next_state := 'review_factuality';
  end if;
  next_input := app.build_durable_review_input(
    step.tenant_id, step.workflow_run_id, (step.input ->> 'pageSpecId')::uuid,
    (step.input ->> 'reviewStartId')::uuid, next_reviewer
  );
  if next_input is null or not app.valid_durable_review_input(next_input) then
    raise exception 'next durable review input unavailable';
  end if;
  perform app.enqueue_durable_review_step(
    step.tenant_id, step.workflow_run_id, next_reviewer, next_input
  );
  update app.workflow_runs set status = 'running', state = next_state,
    deadline_at = clock_timestamp() + interval '1 hour'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, target_actor, 'review_completed',
    case target_reviewer when 'recruiter'
      then 'Recruiter review completed.' else 'Hiring manager review completed.' end,
    jsonb_build_object(
      'reviewId', review_id, 'artifactId', artifact_id,
      'verdict', step_output ->> 'verdict', 'costMicros', actual_cost
    )
  );
  return artifact_id;
end $$;

create or replace function app.fail_durable_provider_review_step(
  target_stage text, target_state text, target_actor app.actor_role,
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare step app.workflow_steps%rowtype; reservation app.run_budget_reservations%rowtype;
begin
  if (target_stage, target_state, target_actor::text) not in (
      ('recruiter-reviewer','review_recruiter','recruiter'),
      ('hiring-manager-reviewer','review_hiring_manager','hiring_manager')
    ) or target_step is null or target_lease_token is null
    or target_failure_code is null
    or target_failure_code !~ '^[a-z0-9_]{1,100}$' then
    raise exception 'invalid durable reviewer failure';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'durable reviewer step not found'; end if;
  perform 1 from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'durable reviewer lease token mismatch';
  end if;
  if step.status = 'failed' then
    if step.failure_code is distinct from target_failure_code then
      raise exception 'durable reviewer failure conflict';
    end if;
    return;
  end if;
  if step.stage = target_stage and step.status = 'leased'
    and step.dispatched_at is null and step.reservation_id is null
    and step.lease_expires_at > clock_timestamp()
    and target_failure_code = 'invalid_step_input' then
    update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
      completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
    update app.workflow_runs set status = case when status = 'running'
        then 'failed' else status end,
      state = case when status = 'running' then target_state else state end
    where tenant_id = step.tenant_id and id = step.workflow_run_id;
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      step.tenant_id, step.workflow_run_id, target_actor, 'failed',
      'Durable reviewer step failed.', jsonb_build_object('costMicros', 0)
    );
    return;
  end if;
  if step.stage <> target_stage or step.status <> 'in_flight'
    or step.reservation_id is null then
    raise exception 'durable reviewer failure rejected';
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.owner_id <> target_lease_token or reservation.status <> 'reserved'
    or reservation.requested_cost_micros < 0 then
    raise exception 'durable reviewer reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_cost_micros = used_cost_micros + reservation.requested_cost_micros,
    used_tokens = used_tokens + reservation.requested_tokens,
    status = case when status = 'running' then 'failed' else status end,
    state = case when status = 'running' then target_state else state end
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = requested_cost_micros,
    finished_at = clock_timestamp() where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, target_actor,
    step.provider, step.model, reservation.requested_tokens, 0, reservation.requested_cost_micros, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, target_actor, 'failed',
    'Durable reviewer step failed.', jsonb_build_object('costMicros', reservation.requested_cost_micros)
  );
end $$;

create or replace function app.reap_expired_durable_provider_review_step(
  target_stage text, target_state text, target_actor app.actor_role
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare candidate_id uuid; candidate_tenant uuid; candidate_run uuid;
  step app.workflow_steps%rowtype; reservation app.run_budget_reservations%rowtype;
begin
  if (target_stage, target_state, target_actor::text) not in (
      ('recruiter-reviewer','review_recruiter','recruiter'),
      ('hiring-manager-reviewer','review_hiring_manager','hiring_manager')
    ) then raise exception 'invalid durable reviewer reaper'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_stage || ':reaper', 0));
  select workflow_step.id, workflow_step.tenant_id, workflow_step.workflow_run_id
  into candidate_id, candidate_tenant, candidate_run
  from app.workflow_steps workflow_step
  join app.workflow_runs workflow_run
    on workflow_run.tenant_id = workflow_step.tenant_id
    and workflow_run.id = workflow_step.workflow_run_id
  where workflow_step.stage = target_stage and (
    (workflow_step.status = 'in_flight'
      and workflow_step.lease_expires_at <= clock_timestamp())
    or (workflow_step.status in ('pending','leased')
      and workflow_run.status = 'running' and workflow_run.state = target_state
      and workflow_run.deadline_at <= clock_timestamp())
  )
  order by coalesce(workflow_step.lease_expires_at, workflow_run.deadline_at),
    workflow_step.id limit 1;
  if not found then return null; end if;
  perform 1 from app.workflow_runs
  where tenant_id = candidate_tenant and id = candidate_run for update;
  select * into step from app.workflow_steps
  where tenant_id = candidate_tenant and id = candidate_id for update;
  if not found then return null; end if;
  if step.status in ('pending','leased') then
    if not exists (
      select 1 from app.workflow_runs where tenant_id = step.tenant_id
        and id = step.workflow_run_id and status = 'running'
        and state = target_state and deadline_at <= clock_timestamp()
    ) then return null; end if;
    update app.workflow_steps set status = 'failed', failure_code = 'deadline_exceeded',
      completed_at = clock_timestamp(), lease_owner = null, lease_expires_at = null
    where id = step.id;
    update app.workflow_runs set status = 'failed', state = target_state
    where tenant_id = step.tenant_id and id = step.workflow_run_id;
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      step.tenant_id, step.workflow_run_id, target_actor, 'failed',
      'Durable reviewer deadline exceeded.',
      jsonb_build_object('failureCode', 'deadline_exceeded', 'costMicros', 0)
    );
    return step.id;
  end if;
  if step.status <> 'in_flight' or step.lease_expires_at > clock_timestamp() then
    return null;
  end if;
  select * into reservation from app.run_budget_reservations
  where id = step.reservation_id for update;
  if not found or reservation.status <> 'reserved'
    or reservation.tenant_id <> step.tenant_id
    or reservation.workflow_run_id <> step.workflow_run_id
    or reservation.requested_cost_micros < 0 then
    raise exception 'durable reviewer reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
    used_cost_micros = used_cost_micros + reservation.requested_cost_micros,
    used_tokens = used_tokens + reservation.requested_tokens,
    status = case when status = 'running' then 'failed' else status end,
    state = case when status = 'running' then target_state else state end
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = requested_cost_micros,
    finished_at = clock_timestamp() where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, target_actor,
    step.provider, step.model, reservation.requested_tokens, 0, reservation.requested_cost_micros, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed',
    failure_code = 'provider_outcome_unknown', completed_at = clock_timestamp(),
    lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, target_actor, 'failed',
    'Durable reviewer step failed.', jsonb_build_object('costMicros', reservation.requested_cost_micros)
  );
  return step.id;
end $$;

