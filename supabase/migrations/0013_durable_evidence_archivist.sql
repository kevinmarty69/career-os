alter table app.artifacts
  drop constraint artifacts_kind_check,
  add constraint artifacts_kind_check check (
    kind in (
      'research', 'evidence_archive', 'strategy', 'page_spec', 'review',
      'review_issue'
    )
  );

do $$ begin
  create role career_evidence_archivist nologin;
exception when duplicate_object then null;
end $$;

alter role career_evidence_archivist nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;

do $$
declare inherited_role name;
begin
  for inherited_role in
    select granted.rolname
    from pg_auth_members membership
    join pg_roles member on member.oid = membership.member
    join pg_roles granted on granted.oid = membership.roleid
    where member.rolname = 'career_evidence_archivist'
  loop
    execute format('revoke %I from career_evidence_archivist', inherited_role);
  end loop;
end $$;

create function app.confirm_research_signal_selection(
  run_tenant uuid,
  run_id uuid,
  research_artifact_id uuid,
  selected_signal_ids text[],
  selection_key uuid
) returns boolean language plpgsql security definer set search_path = app, pg_temp as $$
declare
  target_run app.workflow_runs%rowtype;
  research app.artifacts%rowtype;
  step_input jsonb;
  step_input_hash text;
  existing app.workflow_steps%rowtype;
  eligible_claim_count integer;
begin
  if run_tenant is null or run_id is null or research_artifact_id is null
    or selection_key is null or selected_signal_ids is null
    or cardinality(selected_signal_ids) not between 1 and 20
    or exists (
      select 1 from unnest(selected_signal_ids) signal_id
      where signal_id !~ '^signal-([1-9]|1[0-9]|20)$'
    )
    or cardinality(selected_signal_ids) <> (
      select count(distinct signal_id) from unnest(selected_signal_ids) signal_id
    )
    or run_tenant is distinct from app.current_tenant_id()
    or not app.active_tenant(run_tenant) then
    raise exception 'invalid research selection';
  end if;

  select * into target_run from app.workflow_runs
  where tenant_id = run_tenant and id = run_id for update;
  if not found then raise exception 'research selection run unavailable'; end if;

  select * into research from app.artifacts
  where tenant_id = run_tenant and workflow_run_id = run_id
    and id = research_artifact_id and kind = 'research' and version = 1;
  if not found or not app.valid_company_researcher_output(research.body) then
    raise exception 'research selection artifact unavailable';
  end if;

  if exists (
    select 1 from unnest(selected_signal_ids) selected(signal_id)
    where not exists (
      select 1 from jsonb_array_elements(research.body -> 'signals')
        with ordinality signal(body, position)
      where selected.signal_id = format('signal-%s', signal.position)
    )
  ) then raise exception 'research selection contains an unknown signal'; end if;

  select count(*) into eligible_claim_count
  from app.claims claim
  where claim.tenant_id = run_tenant and claim.profile_id = target_run.profile_id
    and claim.level in ('verified', 'declared')
    and claim.sensitivity <> 'restricted'
    and 'application' = any(claim.allowed_uses)
    and exists (
      select 1 from app.claim_evidence link
      join app.evidence proof on proof.tenant_id = link.tenant_id
        and proof.id = link.evidence_id and proof.profile_id = link.profile_id
      join app.sources source on source.tenant_id = proof.tenant_id
        and source.id = proof.source_id and source.profile_id = proof.profile_id
      where link.tenant_id = claim.tenant_id and link.profile_id = claim.profile_id
        and link.claim_id = claim.id and link.relation = 'supports'
        and source.sensitivity <> 'restricted'
        and 'application' = any(source.allowed_uses)
    )
    and not exists (
      select 1 from app.claim_evidence link
      left join app.evidence proof on proof.tenant_id = link.tenant_id
        and proof.id = link.evidence_id and proof.profile_id = link.profile_id
      left join app.sources source on source.tenant_id = proof.tenant_id
        and source.id = proof.source_id and source.profile_id = proof.profile_id
      where link.tenant_id = claim.tenant_id and link.profile_id = claim.profile_id
        and link.claim_id = claim.id
        and (proof.id is null or source.id is null
          or source.sensitivity = 'restricted'
          or not ('application' = any(source.allowed_uses)))
    );
  if eligible_claim_count > 40 then
    raise exception 'evidence archive input too large';
  end if;

  with selected_signals as (
    select format('signal-%s', signal.position) signal_id,
      signal.body, signal.position
    from jsonb_array_elements(research.body -> 'signals')
      with ordinality signal(body, position)
    where format('signal-%s', signal.position) = any(selected_signal_ids)
  ), eligible_claims as (
    select claim.*, row_number() over(order by claim.position, claim.id) - 1 rank
    from app.claims claim
    where claim.tenant_id = run_tenant and claim.profile_id = target_run.profile_id
      and claim.level in ('verified', 'declared')
      and claim.sensitivity <> 'restricted'
      and 'application' = any(claim.allowed_uses)
      and exists (
        select 1 from app.claim_evidence link
        join app.evidence proof on proof.tenant_id = link.tenant_id
          and proof.id = link.evidence_id and proof.profile_id = link.profile_id
        join app.sources source on source.tenant_id = proof.tenant_id
          and source.id = proof.source_id and source.profile_id = proof.profile_id
        where link.tenant_id = claim.tenant_id and link.profile_id = claim.profile_id
          and link.claim_id = claim.id and link.relation = 'supports'
          and source.sensitivity <> 'restricted'
          and 'application' = any(source.allowed_uses)
      )
      and not exists (
        select 1 from app.claim_evidence link
        left join app.evidence proof on proof.tenant_id = link.tenant_id
          and proof.id = link.evidence_id and proof.profile_id = link.profile_id
        left join app.sources source on source.tenant_id = proof.tenant_id
          and source.id = proof.source_id and source.profile_id = proof.profile_id
        where link.tenant_id = claim.tenant_id and link.profile_id = claim.profile_id
          and link.claim_id = claim.id
          and (proof.id is null or source.id is null
            or source.sensitivity = 'restricted'
            or not ('application' = any(source.allowed_uses)))
      )
  ), candidates as (
    select jsonb_build_object(
      'claimId', claim.id::text,
      'position', claim.rank,
      'statement', claim.statement,
      'level', claim.level::text,
      'evidence', (
        select jsonb_agg(jsonb_build_object(
          'evidenceId', safe_proof.id::text,
          'label', left(safe_proof.label, 500),
          'excerpt', left(safe_proof.excerpt, 2000)
        ) order by safe_proof.position, safe_proof.id)
        from (
          select proof.id, proof.label, proof.excerpt, link.position
          from app.claim_evidence link
          join app.evidence proof on proof.tenant_id = link.tenant_id
            and proof.id = link.evidence_id and proof.profile_id = link.profile_id
          join app.sources source on source.tenant_id = proof.tenant_id
            and source.id = proof.source_id and source.profile_id = proof.profile_id
          where link.tenant_id = claim.tenant_id and link.profile_id = claim.profile_id
            and link.claim_id = claim.id and link.relation = 'supports'
            and source.sensitivity <> 'restricted'
            and 'application' = any(source.allowed_uses)
          order by link.position, proof.id limit 3
        ) safe_proof
      )
    ) body, claim.rank
    from eligible_claims claim
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'purpose', 'application',
    'profileSnapshotId', target_run.profile_id::text,
    'researchArtifactId', research.id::text,
    'researchArtifactHash', encode(public.digest(research.body::text, 'sha256'), 'hex'),
    'signals', (select jsonb_agg(jsonb_build_object(
      'signalId', signal_id,
      'statement', body ->> 'statement',
      'excerpt', body ->> 'excerpt',
      'category', body ->> 'category',
      'priority', body ->> 'priority'
    ) order by position) from selected_signals),
    'candidates', coalesce((select jsonb_agg(body order by rank) from candidates), '[]'::jsonb)
  ) into step_input;

  step_input_hash := encode(public.digest(step_input::text, 'sha256'), 'hex');
  select * into existing from app.workflow_steps
  where tenant_id = run_tenant and workflow_run_id = run_id
    and stage = 'evidence-archivist';
  if found then
    if existing.input_hash is distinct from step_input_hash
      or existing.input is distinct from step_input then
      raise exception 'research selection conflict';
    end if;
    return false;
  end if;

  if target_run.status <> 'paused' or target_run.state <> 'evidence_archive' then
    raise exception 'research selection run unavailable';
  end if;
  insert into app.workflow_steps (
    tenant_id, workflow_run_id, stage, status, idempotency_key, input, input_hash
  ) values (
    run_tenant, run_id, 'evidence-archivist', 'pending',
    'evidence-archivist:' || selection_key::text, step_input, step_input_hash
  );
  update app.workflow_runs set status = 'running', state = 'evidence_archive',
    deadline_at = clock_timestamp() + interval '1 hour'
  where tenant_id = run_tenant and id = run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    run_tenant, run_id, 'human', 'research_signals_confirmed',
    'Human confirmed the hiring signals used for evidence selection.',
    jsonb_build_object(
      'researchArtifactId', research.id,
      'selectedSignalIds', to_jsonb(selected_signal_ids),
      'costMicros', 0
    )
  );
  return true;
end $$;

create function app.valid_evidence_archivist_output(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array[
      'schemaVersion', 'purpose', 'profileSnapshotId', 'researchArtifactId',
      'researchArtifactHash', 'signals'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate) key
      where key <> all(array[
        'schemaVersion', 'purpose', 'profileSnapshotId', 'researchArtifactId',
        'researchArtifactHash', 'signals'
      ])
    )
    and candidate -> 'schemaVersion' = '1'::jsonb
    and candidate ->> 'purpose' = 'application'
    and (candidate ->> 'profileSnapshotId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (candidate ->> 'researchArtifactId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (candidate ->> 'researchArtifactHash') ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'signals') = 'array'
    and jsonb_array_length(candidate -> 'signals') between 1 and 20
    and jsonb_array_length(candidate -> 'signals') = (
      select count(distinct signal ->> 'signalId')
      from jsonb_array_elements(candidate -> 'signals') signal
    )
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'signals') signal
      where jsonb_typeof(signal) <> 'object'
        or not signal ?& array['signalId', 'coverage', 'matches']
        or exists (
          select 1 from jsonb_object_keys(signal) key
          where key <> all(array['signalId', 'coverage', 'matches'])
        )
        or signal ->> 'signalId' !~ '^signal-([1-9]|1[0-9]|20)$'
        or signal ->> 'coverage' not in (
          'verified_candidate', 'declared_candidate', 'unmatched'
        )
        or jsonb_typeof(signal -> 'matches') <> 'array'
        or jsonb_array_length(signal -> 'matches') > 3
        or jsonb_array_length(signal -> 'matches') <> (
          select count(distinct match ->> 'claimId')
          from jsonb_array_elements(signal -> 'matches') match
        )
        or ((signal ->> 'coverage' = 'unmatched') <>
          (jsonb_array_length(signal -> 'matches') = 0))
        or exists (
          select 1 from jsonb_array_elements(signal -> 'matches') match
          where jsonb_typeof(match) <> 'object'
            or not match ?& array[
              'claimId', 'evidenceIds', 'provenance', 'relevanceScore'
            ]
            or exists (
              select 1 from jsonb_object_keys(match) key
              where key <> all(array[
                'claimId', 'evidenceIds', 'provenance', 'relevanceScore'
              ])
            )
            or match ->> 'claimId' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or match ->> 'provenance' not in ('verified', 'declared')
            or jsonb_typeof(match -> 'relevanceScore') <> 'number'
            or match ->> 'relevanceScore' !~ '^(100|[0-9]{1,2})$'
            or jsonb_typeof(match -> 'evidenceIds') <> 'array'
            or jsonb_array_length(match -> 'evidenceIds') not between 1 and 3
            or jsonb_array_length(match -> 'evidenceIds') <> (
              select count(distinct evidence_id)
              from jsonb_array_elements_text(match -> 'evidenceIds') evidence_id
            )
            or exists (
              select 1 from jsonb_array_elements_text(match -> 'evidenceIds') evidence_id
              where evidence_id !~
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
        )
    )
$$;

create function app.claim_evidence_archivist_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate app.workflow_steps%rowtype;
  generated_lease_token uuid := gen_random_uuid();
begin
  if lease_seconds is null or lease_seconds not between 1 and 300 then
    raise exception 'invalid evidence archivist claim';
  end if;
  select step.* into candidate
  from app.workflow_steps step
  join app.workflow_runs run on run.tenant_id = step.tenant_id
    and run.id = step.workflow_run_id
  where step.stage = 'evidence-archivist'
    and (step.status = 'pending' or (
      step.status = 'leased' and step.lease_expires_at <= clock_timestamp()
    ))
    and run.status = 'running' and run.deadline_at > clock_timestamp()
  order by step.created_at, step.id
  for update of step skip locked limit 1;
  if not found then return; end if;

  update app.workflow_steps step set
    status = 'leased',
    attempt = case when candidate.status = 'pending'
      then candidate.attempt else candidate.attempt + 1 end,
    lease_owner = generated_lease_token::text,
    lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds),
    failure_code = null
  where step.id = candidate.id
  returning step.id, step.workflow_run_id, step.attempt, generated_lease_token,
    step.input, step.input_hash
  into step_id, workflow_run_id, attempt, lease_token, input, input_hash;
  return next;
end $$;

create function app.complete_evidence_archivist_step(
  target_step uuid, target_lease_token uuid, step_output jsonb
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  target_run app.workflow_runs%rowtype;
  stored_output jsonb;
  artifact_id uuid;
begin
  if target_step is null or target_lease_token is null
    or not app.valid_evidence_archivist_output(step_output) then
    raise exception 'invalid evidence archivist completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'evidence archivist step not found'; end if;
  if step_output ->> 'profileSnapshotId' is distinct from
      step.input ->> 'profileSnapshotId'
    or step_output ->> 'researchArtifactId' is distinct from
      step.input ->> 'researchArtifactId'
    or step_output ->> 'researchArtifactHash' is distinct from
      step.input ->> 'researchArtifactHash'
    or step_output ->> 'purpose' is distinct from step.input ->> 'purpose'
    or exists (
      (select signal ->> 'signalId'
       from jsonb_array_elements(step_output -> 'signals') signal
       except
       select signal ->> 'signalId'
       from jsonb_array_elements(step.input -> 'signals') signal)
      union all
      (select signal ->> 'signalId'
       from jsonb_array_elements(step.input -> 'signals') signal
       except
       select signal ->> 'signalId'
       from jsonb_array_elements(step_output -> 'signals') signal)
    )
    or exists (
      select 1
      from jsonb_array_elements(step_output -> 'signals') signal,
        jsonb_array_elements(signal -> 'matches') match
      where not exists (
        select 1 from jsonb_array_elements(step.input -> 'candidates') candidate
        where candidate ->> 'claimId' = match ->> 'claimId'
          and candidate ->> 'level' = match ->> 'provenance'
          and not exists (
            select 1 from jsonb_array_elements_text(match -> 'evidenceIds') output_id
            where not exists (
              select 1 from jsonb_array_elements(candidate -> 'evidence') proof
              where proof ->> 'evidenceId' = output_id
            )
          )
      )
    )
    or exists (
      select 1 from jsonb_array_elements(step_output -> 'signals') signal
      where (signal ->> 'coverage' = 'verified_candidate' and
          signal #>> '{matches,0,provenance}' <> 'verified')
        or (signal ->> 'coverage' = 'declared_candidate' and
          signal #>> '{matches,0,provenance}' <> 'declared')
    ) then raise exception 'invalid evidence archivist provenance'; end if;

  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'evidence archivist run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'evidence archivist lease token mismatch';
  end if;
  if step.status = 'completed' then
    select body into stored_output from app.artifacts where id = step.output_artifact_id;
    if not found or stored_output is distinct from step_output then
      raise exception 'evidence archivist completion conflict';
    end if;
    return step.output_artifact_id;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'evidence_archive'
    or target_run.deadline_at <= clock_timestamp() then
    raise exception 'evidence archivist run unavailable';
  end if;
  if step.stage <> 'evidence-archivist' or step.status <> 'leased'
    or step.lease_expires_at <= clock_timestamp() then
    raise exception 'evidence archivist completion rejected';
  end if;

  artifact_id := gen_random_uuid();
  insert into app.artifacts (
    id, tenant_id, workflow_run_id, kind, version, schema_version, body, created_by
  ) values (
    artifact_id, step.tenant_id, step.workflow_run_id, 'evidence_archive', 1, 1,
    step_output, 'evidence_archivist'
  );
  update app.workflow_steps set status = 'completed', output_artifact_id = artifact_id,
    completed_at = clock_timestamp(), lease_expires_at = null
  where id = step.id;
  update app.workflow_runs set state = 'strategy', status = 'paused'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'evidence_archivist',
    'artifact_written', 'Evidence archivist mapped safe proof candidates.',
    jsonb_build_object('artifactId', artifact_id, 'costMicros', 0)
  );
  return artifact_id;
end $$;

create function app.fail_evidence_archivist_step(
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  target_run app.workflow_runs%rowtype;
begin
  if target_step is null or target_lease_token is null
    or target_failure_code is null
    or target_failure_code !~ '^[a-z0-9_]{1,100}$' then
    raise exception 'invalid evidence archivist failure';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'evidence archivist step not found'; end if;
  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'evidence archivist run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'evidence archivist lease token mismatch';
  end if;
  if step.status = 'failed' then
    if step.failure_code is distinct from target_failure_code then
      raise exception 'evidence archivist failure conflict';
    end if;
    return;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'evidence_archive'
    or target_run.deadline_at <= clock_timestamp() then
    raise exception 'evidence archivist run unavailable';
  end if;
  if step.stage <> 'evidence-archivist' or step.status <> 'leased'
    or step.lease_expires_at <= clock_timestamp() then
    raise exception 'evidence archivist failure rejected';
  end if;
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  update app.workflow_runs set state = 'evidence_archive', status = 'failed'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'evidence_archivist', 'failed',
    'Evidence archivist step failed.', jsonb_build_object('costMicros', 0)
  );
end $$;

create function app.reap_expired_evidence_archivist_step()
returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate_id uuid;
  candidate_tenant uuid;
  candidate_run uuid;
  step app.workflow_steps%rowtype;
  target_run app.workflow_runs%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('evidence-archivist-global-reaper', 0)
  );
  select workflow_step.id, workflow_step.tenant_id, workflow_step.workflow_run_id
  into candidate_id, candidate_tenant, candidate_run
  from app.workflow_steps workflow_step
  join app.workflow_runs workflow_run
    on workflow_run.tenant_id = workflow_step.tenant_id
    and workflow_run.id = workflow_step.workflow_run_id
  where workflow_step.stage = 'evidence-archivist'
    and workflow_step.status in ('pending', 'leased')
    and workflow_run.status = 'running'
    and workflow_run.state = 'evidence_archive'
    and workflow_run.deadline_at <= clock_timestamp()
  order by workflow_run.deadline_at, workflow_step.id limit 1;
  if not found then return null; end if;

  select * into target_run from app.workflow_runs
  where tenant_id = candidate_tenant and id = candidate_run for update;
  select * into step from app.workflow_steps
  where tenant_id = candidate_tenant and id = candidate_id for update;
  if not found or target_run.status <> 'running'
    or target_run.state <> 'evidence_archive'
    or target_run.deadline_at > clock_timestamp()
    or step.stage <> 'evidence-archivist'
    or step.status not in ('pending', 'leased') then
    return null;
  end if;

  update app.workflow_steps set status = 'failed', failure_code = 'deadline_exceeded',
    completed_at = clock_timestamp(), lease_owner = null, lease_expires_at = null
  where id = step.id;
  update app.workflow_runs set status = 'failed', state = 'evidence_archive'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'evidence_archivist', 'failed',
    'Evidence archivist deadline exceeded.',
    jsonb_build_object('failureCode', 'deadline_exceeded', 'costMicros', 0)
  );
  return step.id;
end $$;

grant execute on function app.confirm_research_signal_selection(
  uuid, uuid, uuid, text[], uuid
) to career_app;

grant usage on schema app to career_evidence_archivist;
revoke all on all tables in schema app from career_evidence_archivist;
revoke usage, select on all sequences in schema app from career_evidence_archivist;
grant execute on function app.claim_evidence_archivist_step(integer),
  app.complete_evidence_archivist_step(uuid, uuid, jsonb),
  app.fail_evidence_archivist_step(uuid, uuid, text),
  app.reap_expired_evidence_archivist_step()
to career_evidence_archivist;

revoke execute on function app.confirm_research_signal_selection(
  uuid, uuid, uuid, text[], uuid
) from public;
revoke execute on function app.claim_evidence_archivist_step(integer),
  app.complete_evidence_archivist_step(uuid, uuid, jsonb),
  app.fail_evidence_archivist_step(uuid, uuid, text),
  app.reap_expired_evidence_archivist_step()
from public;

revoke execute on all functions in schema app from public;
revoke execute on all functions in schema auth from public;
revoke usage on schema app, auth from public;
