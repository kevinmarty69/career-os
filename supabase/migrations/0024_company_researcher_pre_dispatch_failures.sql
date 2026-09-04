create or replace function app.fail_company_researcher_step(
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
  if step.stage = 'company-researcher' and step.status = 'leased'
    and step.dispatched_at is null and step.reservation_id is null
    and step.lease_expires_at > clock_timestamp()
    and target_failure_code = 'invalid_step_input' then
    update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
      completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
    update app.workflow_runs set state = 'research', status = 'failed'
    where tenant_id = step.tenant_id and id = step.workflow_run_id
      and status = 'running';
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      step.tenant_id, step.workflow_run_id, 'company_researcher', 'failed',
      'Company researcher step failed.',
      jsonb_build_object('failureCode', target_failure_code, 'costMicros', 0)
    );
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
end
$$;

create or replace function app.reap_expired_company_researcher_step()
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
  select workflow_step.id, workflow_step.tenant_id, workflow_step.workflow_run_id
  into candidate_id, candidate_tenant, candidate_run
  from app.workflow_steps workflow_step
  join app.workflow_runs workflow_run
    on workflow_run.tenant_id = workflow_step.tenant_id
    and workflow_run.id = workflow_step.workflow_run_id
  where workflow_step.stage = 'company-researcher' and (
    (workflow_step.status = 'in_flight'
      and workflow_step.lease_expires_at <= clock_timestamp())
    or (workflow_step.status in ('pending', 'leased')
      and workflow_run.status = 'running' and workflow_run.state = 'research'
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
        and id = step.workflow_run_id and status = 'running' and state = 'research'
        and deadline_at <= clock_timestamp()
    ) then return null; end if;
    update app.workflow_steps set status = 'failed', failure_code = 'deadline_exceeded',
      completed_at = clock_timestamp(), lease_owner = null, lease_expires_at = null
    where id = step.id;
    update app.workflow_runs set status = 'failed', state = 'research'
    where tenant_id = step.tenant_id and id = step.workflow_run_id;
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      step.tenant_id, step.workflow_run_id, 'company_researcher', 'failed',
      'Company researcher deadline exceeded.',
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
end
$$;

revoke execute on function app.fail_company_researcher_step(uuid, uuid, text),
  app.reap_expired_company_researcher_step()
from public;
