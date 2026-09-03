do $$ begin
  create role career_recruiter_strategist nologin;
exception when duplicate_object then null;
end $$;

alter role career_recruiter_strategist nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;

do $$
declare inherited_role name;
begin
  for inherited_role in
    select granted.rolname
    from pg_auth_members membership
    join pg_roles member on member.oid = membership.member
    join pg_roles granted on granted.oid = membership.roleid
    where member.rolname = 'career_recruiter_strategist'
  loop
    execute format('revoke %I from career_recruiter_strategist', inherited_role);
  end loop;
end $$;

create function app.valid_recruiter_strategy_selection(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array['signalId','claimId','evidenceIds','rationale']
    and not exists (
      select 1 from jsonb_object_keys(candidate) key
      where key <> all(array['signalId','claimId','evidenceIds','rationale'])
    )
    and jsonb_typeof(candidate -> 'signalId') = 'string'
    and jsonb_typeof(candidate -> 'claimId') = 'string'
    and jsonb_typeof(candidate -> 'rationale') = 'string'
    and candidate ->> 'signalId' ~ '^signal-([1-9]|1[0-9]|20)$'
    and candidate ->> 'claimId' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(candidate -> 'evidenceIds') = 'array'
    and jsonb_array_length(candidate -> 'evidenceIds') between 1 and 2
    and jsonb_array_length(candidate -> 'evidenceIds') = (
      select count(distinct value)
      from jsonb_array_elements_text(candidate -> 'evidenceIds') value
    )
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'evidenceIds') evidence_id
      where jsonb_typeof(evidence_id) <> 'string'
        or evidence_id #>> '{}' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and length(candidate ->> 'rationale') between 1 and 240
$$;

create function app.recruiter_strategy_numeric_tokens(value text)
returns table (token text) language sql immutable set search_path = pg_catalog as $$
  select replace(regexp_replace(hit[1], '[[:space:]]+', '', 'g'), ',', '.')
  from regexp_matches(
    normalize(coalesce(value, ''), NFKC),
    '([0-9]+([.,][0-9]+)?[[:space:]]*%?)', 'g'
  ) hit
$$;

create function app.valid_recruiter_strategy_grounding(
  candidate jsonb, source_input jsonb
) returns boolean language sql immutable set search_path = pg_catalog as $$
  select not exists (
    select 1
    from (
      select candidate -> 'lead' selection
      union all
      select item from jsonb_array_elements(candidate -> 'supports') item
    ) selected
    cross join lateral app.recruiter_strategy_numeric_tokens(
      selected.selection ->> 'rationale'
    ) output_token
    where not exists (
      select 1
      from jsonb_array_elements(source_input -> 'signals') signal
      cross join lateral jsonb_array_elements(signal -> 'matches') matched
      cross join lateral app.recruiter_strategy_numeric_tokens(concat_ws(E'\n',
        signal ->> 'statement', signal ->> 'excerpt', matched ->> 'statement',
        (
          select string_agg(concat_ws(E'\n',
            proof ->> 'label', proof ->> 'excerpt'
          ), E'\n')
          from jsonb_array_elements(matched -> 'evidence') proof
          where proof ->> 'evidenceId' in (
            select value from jsonb_array_elements_text(
              selected.selection -> 'evidenceIds'
            ) value
          )
        )
      )) allowed_token
      where signal ->> 'signalId' = selected.selection ->> 'signalId'
        and matched ->> 'claimId' = selected.selection ->> 'claimId'
        and allowed_token.token = output_token.token
    )
  ) and not exists (
    select 1
    from jsonb_array_elements(candidate -> 'gaps') gap
    cross join lateral app.recruiter_strategy_numeric_tokens(
      gap ->> 'rationale'
    ) output_token
    where not exists (
      select 1
      from jsonb_array_elements(source_input -> 'signals') signal
      cross join lateral app.recruiter_strategy_numeric_tokens(concat_ws(E'\n',
        signal ->> 'statement', signal ->> 'excerpt'
      )) allowed_token
      where signal ->> 'signalId' = gap ->> 'signalId'
        and allowed_token.token = output_token.token
    )
  ) and not exists (
    select 1
    from app.recruiter_strategy_numeric_tokens(
      candidate #>> '{positioning,message}'
    ) output_token
    where not exists (
      select 1
      from jsonb_array_elements_text(
        candidate #> '{positioning,sourceSignalIds}'
      ) positioned(signal_id)
      cross join lateral (
        select candidate -> 'lead' selection
        where candidate #>> '{lead,signalId}' = positioned.signal_id
        union all
        select support from jsonb_array_elements(candidate -> 'supports') support
        where support ->> 'signalId' = positioned.signal_id
      ) selected
      join lateral jsonb_array_elements(source_input -> 'signals') signal
        on signal ->> 'signalId' = positioned.signal_id
      join lateral jsonb_array_elements(signal -> 'matches') matched
        on matched ->> 'claimId' = selected.selection ->> 'claimId'
      cross join lateral app.recruiter_strategy_numeric_tokens(concat_ws(E'\n',
        signal ->> 'statement', signal ->> 'excerpt', matched ->> 'statement',
        (
          select string_agg(concat_ws(E'\n',
            proof ->> 'label', proof ->> 'excerpt'
          ), E'\n')
          from jsonb_array_elements(matched -> 'evidence') proof
        )
      )) allowed_token
      where allowed_token.token = output_token.token
    )
  )
$$;

create function app.valid_recruiter_strategy_output(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array[
      'schemaVersion','purpose','profileSnapshotId','researchArtifactId',
      'researchArtifactHash','evidenceArchiveArtifactId',
      'evidenceArchiveArtifactHash','copyPolicy','positioning','lead','supports',
      'gaps','omittedSignalIds'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate) key where key <> all(array[
        'schemaVersion','purpose','profileSnapshotId','researchArtifactId',
        'researchArtifactHash','evidenceArchiveArtifactId',
        'evidenceArchiveArtifactHash','copyPolicy','positioning','lead','supports',
        'gaps','omittedSignalIds'
      ])
    )
    and candidate -> 'schemaVersion' = '1'::jsonb
    and jsonb_typeof(candidate -> 'purpose') = 'string'
    and jsonb_typeof(candidate -> 'profileSnapshotId') = 'string'
    and jsonb_typeof(candidate -> 'researchArtifactId') = 'string'
    and jsonb_typeof(candidate -> 'researchArtifactHash') = 'string'
    and jsonb_typeof(candidate -> 'evidenceArchiveArtifactId') = 'string'
    and jsonb_typeof(candidate -> 'evidenceArchiveArtifactHash') = 'string'
    and jsonb_typeof(candidate -> 'copyPolicy') = 'string'
    and candidate ->> 'purpose' = 'application'
    and candidate ->> 'copyPolicy' = 'internal-editorial-direction'
    and (candidate ->> 'profileSnapshotId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (candidate ->> 'researchArtifactId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (candidate ->> 'evidenceArchiveArtifactId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (candidate ->> 'researchArtifactHash') ~ '^[0-9a-f]{64}$'
    and (candidate ->> 'evidenceArchiveArtifactHash') ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'positioning') = 'object'
    and candidate -> 'positioning' ?& array['message','sourceSignalIds']
    and not exists (
      select 1 from jsonb_object_keys(candidate -> 'positioning') key
      where key <> all(array['message','sourceSignalIds'])
    )
    and jsonb_typeof(candidate #> '{positioning,message}') = 'string'
    and length(candidate #>> '{positioning,message}') between 20 and 320
    and jsonb_typeof(candidate #> '{positioning,sourceSignalIds}') = 'array'
    and jsonb_array_length(candidate #> '{positioning,sourceSignalIds}') between 1 and 3
    and jsonb_array_length(candidate #> '{positioning,sourceSignalIds}') = (
      select count(distinct value)
      from jsonb_array_elements_text(candidate #> '{positioning,sourceSignalIds}') value
    )
    and not exists (
      select 1 from jsonb_array_elements(
        candidate #> '{positioning,sourceSignalIds}'
      ) signal_id where jsonb_typeof(signal_id) <> 'string'
        or signal_id #>> '{}' !~ '^signal-([1-9]|1[0-9]|20)$'
    )
    and app.valid_recruiter_strategy_selection(candidate -> 'lead')
    and jsonb_typeof(candidate -> 'supports') = 'array'
    and jsonb_array_length(candidate -> 'supports') <= 4
    and jsonb_array_length(candidate -> 'supports') = (
      select count(distinct item ->> 'signalId')
      from jsonb_array_elements(candidate -> 'supports') item
    )
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'supports') item
      where not app.valid_recruiter_strategy_selection(item)
    )
    and jsonb_typeof(candidate -> 'gaps') = 'array'
    and jsonb_array_length(candidate -> 'gaps') <= 4
    and jsonb_array_length(candidate -> 'gaps') = (
      select count(distinct gap ->> 'signalId')
      from jsonb_array_elements(candidate -> 'gaps') gap
    )
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'gaps') gap
      where jsonb_typeof(gap) <> 'object'
        or not gap ?& array['signalId','treatment','rationale']
        or exists (
          select 1 from jsonb_object_keys(gap) key
          where key <> all(array['signalId','treatment','rationale'])
        )
        or jsonb_typeof(gap -> 'signalId') <> 'string'
        or jsonb_typeof(gap -> 'treatment') <> 'string'
        or jsonb_typeof(gap -> 'rationale') <> 'string'
        or gap ->> 'signalId' !~ '^signal-([1-9]|1[0-9]|20)$'
        or gap ->> 'treatment' not in ('acknowledge','interview_topic')
        or length(gap ->> 'rationale') not between 1 and 240
    )
    and jsonb_typeof(candidate -> 'omittedSignalIds') = 'array'
    and jsonb_array_length(candidate -> 'omittedSignalIds') <= 20
    and jsonb_array_length(candidate -> 'omittedSignalIds') = (
      select count(distinct value)
      from jsonb_array_elements_text(candidate -> 'omittedSignalIds') value
    )
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'omittedSignalIds') signal_id
      where jsonb_typeof(signal_id) <> 'string'
        or signal_id #>> '{}' !~ '^signal-([1-9]|1[0-9]|20)$'
    )
$$;

create function app.confirm_evidence_archive_selection(
  run_tenant uuid, run_id uuid, evidence_artifact_id uuid,
  evidence_artifact_hash text, selection_key uuid
) returns boolean language plpgsql security definer set search_path = app, pg_temp as $$
declare
  target_run app.workflow_runs%rowtype;
  archive app.artifacts%rowtype;
  research app.artifacts%rowtype;
  step_input jsonb;
  step_input_hash text;
  existing app.workflow_steps%rowtype;
begin
  if run_tenant is null or run_id is null or evidence_artifact_id is null
    or evidence_artifact_hash is null
    or evidence_artifact_hash !~ '^[0-9a-f]{64}$' or selection_key is null
    or run_tenant is distinct from app.current_tenant_id()
    or not app.active_tenant(run_tenant) then
    raise exception 'invalid evidence archive selection';
  end if;
  select * into target_run from app.workflow_runs
  where tenant_id = run_tenant and id = run_id for update;
  if not found then raise exception 'strategy run unavailable'; end if;

  select * into archive from app.artifacts
  where tenant_id = run_tenant and workflow_run_id = run_id
    and id = evidence_artifact_id and kind = 'evidence_archive' and version = 1;
  if not found
    or encode(public.digest(archive.body::text, 'sha256'), 'hex')
      is distinct from evidence_artifact_hash
    or not app.valid_evidence_archivist_output(archive.body)
    or archive.body ->> 'profileSnapshotId' is distinct from target_run.profile_id::text then
    raise exception 'evidence archive selection unavailable';
  end if;

  select * into research from app.artifacts
  where tenant_id = run_tenant and workflow_run_id = run_id
    and id = (archive.body ->> 'researchArtifactId')::uuid
    and kind = 'research' and version = 1;
  if not found or not app.valid_company_researcher_output(research.body)
    or encode(public.digest(research.body::text, 'sha256'), 'hex')
      is distinct from archive.body ->> 'researchArtifactHash' then
    raise exception 'strategy research lineage unavailable';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(archive.body -> 'signals') archived_signal,
      jsonb_array_elements(archived_signal -> 'matches') archived_match
    where not exists (
      select 1 from app.claims claim
      where claim.tenant_id = run_tenant and claim.profile_id = target_run.profile_id
        and claim.id = (archived_match ->> 'claimId')::uuid
        and claim.level::text = archived_match ->> 'provenance'
        and claim.level in ('verified', 'declared')
        and claim.sensitivity <> 'restricted'
        and 'application' = any(claim.allowed_uses)
        and not exists (
          select 1 from jsonb_array_elements_text(
            archived_match -> 'evidenceIds'
          ) selected(evidence_id)
          where not exists (
            select 1 from app.claim_evidence link
            join app.evidence proof on proof.tenant_id = link.tenant_id
              and proof.profile_id = link.profile_id and proof.id = link.evidence_id
            join app.sources source on source.tenant_id = proof.tenant_id
              and source.profile_id = proof.profile_id and source.id = proof.source_id
            where link.tenant_id = claim.tenant_id
              and link.profile_id = claim.profile_id and link.claim_id = claim.id
              and link.evidence_id = selected.evidence_id::uuid
              and link.relation = 'supports'
              and source.sensitivity <> 'restricted'
              and 'application' = any(source.allowed_uses)
          )
        )
    )
  ) then raise exception 'strategy evidence lineage unavailable'; end if;

  if not exists (
    select 1 from jsonb_array_elements(archive.body -> 'signals') archived_signal
    where jsonb_array_length(archived_signal -> 'matches') > 0
  ) then raise exception 'strategy requires at least one evidence match'; end if;

  with archived_signals as (
    select body, position
    from jsonb_array_elements(archive.body -> 'signals')
      with ordinality archived(body, position)
  ), research_signals as (
    select format('signal-%s', position) signal_id, body
    from jsonb_array_elements(research.body -> 'signals')
      with ordinality researched(body, position)
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'purpose', 'application',
    'profileSnapshotId', target_run.profile_id::text,
    'researchArtifactId', research.id::text,
    'researchArtifactHash', encode(public.digest(research.body::text, 'sha256'), 'hex'),
    'evidenceArchiveArtifactId', archive.id::text,
    'evidenceArchiveArtifactHash', evidence_artifact_hash,
    'company', research.body ->> 'company',
    'role', research.body ->> 'role',
    'signals', (
      select jsonb_agg(jsonb_build_object(
        'signalId', archived.body ->> 'signalId',
        'statement', researched.body ->> 'statement',
        'excerpt', researched.body ->> 'excerpt',
        'category', researched.body ->> 'category',
        'priority', researched.body ->> 'priority',
        'coverage', archived.body ->> 'coverage',
        'matches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'claimId', claim.id::text,
            'statement', left(claim.statement, 5000),
            'provenance', archived_match ->> 'provenance',
            'evidence', (
              select jsonb_agg(jsonb_build_object(
                'evidenceId', proof.id::text,
                'label', left(proof.label, 500),
                'excerpt', left(proof.excerpt, 2000)
              ) order by selected.position)
              from jsonb_array_elements_text(archived_match -> 'evidenceIds')
                with ordinality selected(evidence_id, position)
              join app.evidence proof on proof.tenant_id = run_tenant
                and proof.profile_id = target_run.profile_id
                and proof.id = selected.evidence_id::uuid
            )
          ) order by match_position)
          from jsonb_array_elements(archived.body -> 'matches')
            with ordinality selected_match(archived_match, match_position)
          join app.claims claim on claim.tenant_id = run_tenant
            and claim.profile_id = target_run.profile_id
            and claim.id = (archived_match ->> 'claimId')::uuid
        ), '[]'::jsonb)
      ) order by archived.position)
      from archived_signals archived
      join research_signals researched
        on researched.signal_id = archived.body ->> 'signalId'
    )
  ) into step_input;

  if step_input -> 'signals' is null
    or jsonb_array_length(step_input -> 'signals')
      <> jsonb_array_length(archive.body -> 'signals')
    or octet_length(convert_to(step_input::text, 'UTF8')) > 98304 then
    raise exception 'strategy input too large or incomplete';
  end if;
  step_input_hash := encode(public.digest(step_input::text, 'sha256'), 'hex');

  select * into existing from app.workflow_steps
  where tenant_id = run_tenant and workflow_run_id = run_id
    and stage = 'recruiter-strategist';
  if found then
    if existing.input is distinct from step_input
      or existing.input_hash is distinct from step_input_hash then
      raise exception 'strategy selection conflict';
    end if;
    return false;
  end if;
  if target_run.status <> 'paused' or target_run.state <> 'strategy' then
    raise exception 'strategy run unavailable';
  end if;
  insert into app.workflow_steps (
    tenant_id, workflow_run_id, stage, status, idempotency_key, input, input_hash
  ) values (
    run_tenant, run_id, 'recruiter-strategist', 'pending',
    'recruiter-strategist:' || selection_key::text, step_input, step_input_hash
  );
  update app.workflow_runs set status = 'running', state = 'strategy',
    deadline_at = clock_timestamp() + interval '1 hour'
  where tenant_id = run_tenant and id = run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    run_tenant, run_id, 'human', 'evidence_archive_confirmed',
    'Human confirmed the evidence archive used for strategy.',
    jsonb_build_object('evidenceArchiveArtifactId', archive.id, 'costMicros', 0)
  );
  return true;
end $$;

create function app.claim_recruiter_strategist_step(lease_seconds integer)
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

create function app.mark_recruiter_strategist_in_flight(
  target_step uuid, target_lease_token uuid, target_provider text,
  target_model text, reserve_tokens integer, reserve_cost bigint
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  generated_reservation uuid;
begin
  if target_step is null or target_lease_token is null
    or target_provider <> 'openai-compatible-local'
    or target_model is null or length(target_model) not between 1 and 200
    or reserve_tokens is null or reserve_tokens not between 1 and 132096
    or reserve_cost is distinct from 0 then
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
  update app.workflow_runs set reserved_tokens = reserved_tokens + reserve_tokens
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and status = 'running' and state = 'strategy' and deadline_at > clock_timestamp()
    and used_tokens + reserved_tokens + reserve_tokens <= token_budget
    and used_cost_micros + reserved_cost_micros <= cost_budget_micros;
  if not found then raise exception 'recruiter strategist budget rejected'; end if;
  insert into app.run_budget_reservations (
    tenant_id, workflow_run_id, idempotency_key, owner_id,
    requested_tokens, requested_cost_micros, lease_expires_at
  ) values (
    step.tenant_id, step.workflow_run_id,
    format('workflow-step:%s:attempt:%s', step.id, step.attempt),
    target_lease_token, reserve_tokens, 0, step.lease_expires_at
  ) returning id into generated_reservation;
  update app.workflow_steps set status = 'in_flight',
    reservation_id = generated_reservation, provider = target_provider,
    model = target_model, dispatched_at = clock_timestamp()
  where id = step.id;
end $$;

create function app.complete_recruiter_strategist_step(
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
    or total_tokens > 2147483647 or actual_cost is distinct from 0
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
      or usage.output_tokens <> actual_output_tokens or usage.cost_micros <> 0
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
    or reservation.requested_cost_micros <> 0 then
    raise exception 'recruiter strategist reservation rejected';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    used_tokens = used_tokens + total_tokens::integer
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = total_tokens::integer, actual_cost_micros = 0,
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
    step.provider, step.model, actual_input_tokens, actual_output_tokens, 0,
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
    jsonb_build_object('artifactId', artifact_id, 'costMicros', 0)
  );
  return artifact_id;
end $$;

create function app.fail_recruiter_strategist_step(
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
    or reservation.requested_cost_micros <> 0 then
    raise exception 'recruiter strategist reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    used_tokens = used_tokens + reservation.requested_tokens,
    state = case when status = 'running' then 'strategy' else state end,
    status = case when status = 'running' then 'failed' else status end
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = 0,
    finished_at = clock_timestamp() where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'recruiter_strategist',
    step.provider, step.model, reservation.requested_tokens, 0, 0, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'recruiter_strategist', 'failed',
    'Recruiter strategist step failed.', jsonb_build_object('costMicros', 0)
  );
end $$;

create function app.reap_expired_recruiter_strategist_step()
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
    or reservation.requested_cost_micros <> 0 then
    raise exception 'recruiter strategist reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    used_tokens = used_tokens + reservation.requested_tokens,
    state = case when status = 'running' then 'strategy' else state end,
    status = case when status = 'running' then 'failed' else status end
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations set status = 'settled',
    actual_tokens = requested_tokens, actual_cost_micros = 0,
    finished_at = clock_timestamp() where id = reservation.id;
  insert into app.model_usage (
    tenant_id, workflow_run_id, workflow_step_id, actor, provider, model,
    input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, usage_basis
  ) values (
    step.tenant_id, step.workflow_run_id, step.id, 'recruiter_strategist',
    step.provider, step.model, reservation.requested_tokens, 0, 0, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed',
    failure_code = 'provider_outcome_unknown', completed_at = clock_timestamp(),
    lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'recruiter_strategist', 'failed',
    'Recruiter strategist step failed.', jsonb_build_object('costMicros', 0)
  );
  return step.id;
end $$;

create table app.strategy_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  strategy_artifact_id uuid not null,
  strategy_artifact_hash text not null check (
    strategy_artifact_hash ~ '^[0-9a-f]{64}$'
  ),
  idempotency_key uuid not null,
  approved_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, workflow_run_id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, workflow_run_id)
    references app.workflow_runs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, strategy_artifact_id)
    references app.artifacts(tenant_id, id)
);
alter table app.strategy_approvals enable row level security;
alter table app.strategy_approvals force row level security;
create policy strategy_approval_tenant on app.strategy_approvals
  using (app.active_tenant(tenant_id)) with check (app.active_tenant(tenant_id));

create function app.approve_recruiter_strategy(
  run_tenant uuid, run_id uuid, strategy_artifact_id uuid,
  strategy_artifact_hash text, approval_key uuid
) returns boolean language plpgsql security definer set search_path = app, pg_temp as $$
declare
  target_run app.workflow_runs%rowtype;
  strategy app.artifacts%rowtype;
  strategy_step app.workflow_steps%rowtype;
  existing app.strategy_approvals%rowtype;
  actor_id uuid := app.current_user_id();
begin
  if run_tenant is null or run_id is null or strategy_artifact_id is null
    or strategy_artifact_hash is null
    or strategy_artifact_hash !~ '^[0-9a-f]{64}$'
    or approval_key is null or actor_id is null
    or run_tenant is distinct from app.current_tenant_id()
    or not app.active_tenant(run_tenant) then
    raise exception 'invalid strategy approval';
  end if;
  select * into target_run from app.workflow_runs
  where tenant_id = run_tenant and id = run_id for update;
  if not found then raise exception 'strategy approval run unavailable'; end if;
  select * into strategy from app.artifacts
  where tenant_id = run_tenant and workflow_run_id = run_id
    and id = strategy_artifact_id and kind = 'strategy' and version = 1;
  if not found or encode(public.digest(strategy.body::text, 'sha256'), 'hex')
      is distinct from strategy_artifact_hash
    or not app.valid_recruiter_strategy_output(strategy.body) then
    raise exception 'strategy approval artifact unavailable';
  end if;
  select * into strategy_step from app.workflow_steps
  where tenant_id = run_tenant and workflow_run_id = run_id
    and stage = 'recruiter-strategist' and status = 'completed'
    and output_artifact_id = strategy.id;
  if not found
    or encode(public.digest(strategy_step.input::text, 'sha256'), 'hex')
      is distinct from strategy_step.input_hash
    or not app.valid_recruiter_strategy_grounding(
      strategy.body, strategy_step.input
    ) then
    raise exception 'strategy approval artifact unavailable';
  end if;
  select * into existing from app.strategy_approvals
  where tenant_id = run_tenant and workflow_run_id = run_id;
  if found then
    if existing.strategy_artifact_id is distinct from strategy_artifact_id
      or existing.strategy_artifact_hash is distinct from strategy_artifact_hash
      or existing.idempotency_key is distinct from approval_key
      or existing.approved_by is distinct from actor_id then
      raise exception 'strategy approval conflict';
    end if;
    return false;
  end if;
  if target_run.status <> 'paused' or target_run.state <> 'strategy_review' then
    raise exception 'strategy approval run unavailable';
  end if;
  insert into app.strategy_approvals (
    tenant_id, workflow_run_id, strategy_artifact_id, strategy_artifact_hash,
    idempotency_key, approved_by
  ) values (
    run_tenant, run_id, strategy_artifact_id, strategy_artifact_hash,
    approval_key, actor_id
  );
  update app.workflow_runs set status = 'paused', state = 'page_spec'
  where tenant_id = run_tenant and id = run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    run_tenant, run_id, 'human', 'strategy_approved',
    'Human approved the recruiter strategy.',
    jsonb_build_object('strategyArtifactId', strategy.id, 'costMicros', 0)
  );
  return true;
end $$;

grant execute on function app.confirm_evidence_archive_selection(
  uuid, uuid, uuid, text, uuid
) to career_app;
grant execute on function app.approve_recruiter_strategy(
  uuid, uuid, uuid, text, uuid
) to career_app;
grant select on app.strategy_approvals to career_app;

grant usage on schema app to career_recruiter_strategist;
revoke all on all tables in schema app from career_recruiter_strategist;
revoke usage, select on all sequences in schema app from career_recruiter_strategist;
grant execute on function app.claim_recruiter_strategist_step(integer),
  app.mark_recruiter_strategist_in_flight(uuid, uuid, text, text, integer, bigint),
  app.complete_recruiter_strategist_step(
    uuid, uuid, jsonb, integer, integer, bigint, integer, boolean, text
  ),
  app.fail_recruiter_strategist_step(uuid, uuid, text),
  app.reap_expired_recruiter_strategist_step()
to career_recruiter_strategist;

revoke execute on function app.confirm_evidence_archive_selection(
  uuid, uuid, uuid, text, uuid
) from public;
revoke execute on function app.approve_recruiter_strategy(
  uuid, uuid, uuid, text, uuid
) from public;
revoke execute on function app.claim_recruiter_strategist_step(integer),
  app.mark_recruiter_strategist_in_flight(uuid, uuid, text, text, integer, bigint),
  app.complete_recruiter_strategist_step(
    uuid, uuid, jsonb, integer, integer, bigint, integer, boolean, text
  ),
  app.fail_recruiter_strategist_step(uuid, uuid, text),
  app.reap_expired_recruiter_strategist_step()
from public;
revoke execute on all functions in schema app from public;
revoke execute on all functions in schema auth from public;
revoke usage on schema app, auth from public;
