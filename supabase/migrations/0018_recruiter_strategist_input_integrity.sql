create or replace function app.claim_recruiter_strategist_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate app.workflow_steps%rowtype;
  generated_token uuid := gen_random_uuid();
begin
  if lease_seconds is null or lease_seconds not between 1 and 300 then
    raise exception 'invalid recruiter strategist claim';
  end if;
  select step.* into candidate from app.workflow_steps step
  join app.workflow_runs run on run.tenant_id = step.tenant_id
    and run.id = step.workflow_run_id
  where step.stage = 'recruiter-strategist' and step.dispatched_at is null
    and (step.status = 'pending' or
      (step.status = 'leased' and step.lease_expires_at <= clock_timestamp()))
    and run.status = 'running' and run.state = 'strategy'
    and run.deadline_at > clock_timestamp()
  order by step.created_at, step.id for update of step skip locked limit 1;
  if not found then return; end if;
  if candidate.input_hash is distinct from pg_catalog.encode(
    public.digest(candidate.input::text, 'sha256'), 'hex'
  ) then
    update app.workflow_steps set status = 'failed',
      failure_code = 'input_integrity_mismatch', completed_at = clock_timestamp(),
      lease_owner = null, lease_expires_at = null
    where id = candidate.id;
    update app.workflow_runs set status = 'failed', state = 'strategy'
    where tenant_id = candidate.tenant_id and id = candidate.workflow_run_id;
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      candidate.tenant_id, candidate.workflow_run_id, 'recruiter_strategist',
      'failed', 'Recruiter strategist input integrity check failed.',
      jsonb_build_object('failureCode', 'input_integrity_mismatch', 'costMicros', 0)
    );
    return;
  end if;
  update app.workflow_steps claimed_step set status = 'leased',
    attempt = case when candidate.status = 'pending' then candidate.attempt
      else candidate.attempt + 1 end,
    lease_owner = generated_token::text,
    lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds),
    failure_code = null where claimed_step.id = candidate.id
  returning claimed_step.id, claimed_step.workflow_run_id, claimed_step.attempt,
    generated_token, claimed_step.input, claimed_step.input_hash
  into step_id, workflow_run_id, attempt, lease_token, input, input_hash;
  return next;
end $$;
