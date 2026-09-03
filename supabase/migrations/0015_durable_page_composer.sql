do $$ begin
  create role career_page_composer nologin;
exception when duplicate_object then null;
end $$;

alter role career_page_composer nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;

do $$
declare inherited_role name;
begin
  for inherited_role in
    select granted.rolname
    from pg_auth_members membership
    join pg_roles member on member.oid = membership.member
    join pg_roles granted on granted.oid = membership.roleid
    where member.rolname = 'career_page_composer'
  loop
    execute format('revoke %I from career_page_composer', inherited_role);
  end loop;
end $$;

alter table app.opportunities
  add column accent text not null default '#5847e8';
do $$
begin
  alter table app.opportunities disable trigger opportunity_snapshot_immutable;
  alter table app.opportunities disable trigger invalidate_opportunity;
  update app.opportunities opportunity set accent = application.accent
  from app.applications application
  where application.tenant_id = opportunity.tenant_id
    and application.id = opportunity.application_id
    and application.revision = opportunity.application_revision;
  alter table app.opportunities enable trigger invalidate_opportunity;
  alter table app.opportunities enable trigger opportunity_snapshot_immutable;
exception when others then
  alter table app.opportunities enable trigger invalidate_opportunity;
  alter table app.opportunities enable trigger opportunity_snapshot_immutable;
  raise;
end $$;
alter table app.opportunities add constraint opportunities_accent_format
  check (accent ~ '^#[0-9a-fA-F]{6}$');

alter table app.page_specs
  add column source_artifact_id uuid,
  add foreign key (tenant_id, source_artifact_id)
    references app.artifacts(tenant_id, id);

alter table app.workflow_steps
  add column page_spec_id uuid,
  add foreign key (tenant_id, page_spec_id)
    references app.page_specs(tenant_id, id);

create table app.page_spec_evidence (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  page_spec_id uuid not null,
  claim_id uuid not null,
  evidence_id uuid not null,
  position integer not null check (position >= 0),
  primary key (tenant_id, page_spec_id, claim_id, evidence_id),
  unique (tenant_id, page_spec_id, position),
  foreign key (tenant_id, page_spec_id, claim_id)
    references app.page_spec_claims(tenant_id, page_spec_id, claim_id)
    on delete cascade,
  foreign key (tenant_id, claim_id, evidence_id)
    references app.claim_evidence(tenant_id, claim_id, evidence_id)
);
alter table app.page_spec_evidence enable row level security;
alter table app.page_spec_evidence force row level security;
create policy page_spec_evidence_tenant on app.page_spec_evidence
  using (app.active_tenant(tenant_id)) with check (app.active_tenant(tenant_id));

create function app.valid_page_composer_proof(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array[
      'signalId','claimId','statement','provenance','evidenceIds'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate) key
      where key <> all(array[
        'signalId','claimId','statement','provenance','evidenceIds'
      ])
    )
    and jsonb_typeof(candidate -> 'signalId') = 'string'
    and candidate ->> 'signalId' ~ '^signal-([1-9]|1[0-9]|20)$'
    and jsonb_typeof(candidate -> 'claimId') = 'string'
    and candidate ->> 'claimId' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(candidate -> 'statement') = 'string'
    and length(candidate ->> 'statement') between 1 and 5000
    and jsonb_typeof(candidate -> 'provenance') = 'string'
    and candidate ->> 'provenance' in ('verified','declared')
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
$$;

create function app.valid_page_composer_input(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array[
      'schemaVersion','purpose','profileSnapshotId','researchArtifactId',
      'researchArtifactHash','strategyArtifactId','strategyArtifactHash','evidenceArchiveArtifactId',
      'evidenceArchiveArtifactHash','strategyApprovalId','candidateName',
      'company','lead','supports'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate) key where key <> all(array[
        'schemaVersion','purpose','profileSnapshotId','researchArtifactId',
        'researchArtifactHash','strategyArtifactId','strategyArtifactHash','evidenceArchiveArtifactId',
        'evidenceArchiveArtifactHash','strategyApprovalId','candidateName',
        'company','lead','supports'
      ])
    )
    and candidate -> 'schemaVersion' = '1'::jsonb
    and candidate ->> 'purpose' = 'application'
    and jsonb_typeof(candidate -> 'purpose') = 'string'
    and not exists (
      select 1 from jsonb_array_elements(jsonb_build_array(
        candidate -> 'profileSnapshotId', candidate -> 'researchArtifactId',
        candidate -> 'strategyArtifactId', candidate -> 'evidenceArchiveArtifactId',
        candidate -> 'strategyApprovalId'
      )) id
      where jsonb_typeof(id) <> 'string' or id #>> '{}' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and jsonb_typeof(candidate -> 'researchArtifactHash') = 'string'
    and candidate ->> 'researchArtifactHash' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'strategyArtifactHash') = 'string'
    and candidate ->> 'strategyArtifactHash' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'evidenceArchiveArtifactHash') = 'string'
    and candidate ->> 'evidenceArchiveArtifactHash' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'candidateName') = 'string'
    and length(candidate ->> 'candidateName') between 1 and 200
    and jsonb_typeof(candidate -> 'company') = 'object'
    and candidate -> 'company' ?& array['name','role','accent']
    and not exists (
      select 1 from jsonb_object_keys(candidate -> 'company') key
      where key <> all(array['name','role','accent'])
    )
    and jsonb_typeof(candidate #> '{company,name}') = 'string'
    and length(candidate #>> '{company,name}') between 1 and 200
    and jsonb_typeof(candidate #> '{company,role}') = 'string'
    and length(candidate #>> '{company,role}') between 1 and 200
    and jsonb_typeof(candidate #> '{company,accent}') = 'string'
    and candidate #>> '{company,accent}' ~ '^#[0-9a-fA-F]{6}$'
    and app.valid_page_composer_proof(candidate -> 'lead')
    and jsonb_typeof(candidate -> 'supports') = 'array'
    and jsonb_array_length(candidate -> 'supports') <= 4
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'supports') support
      where not app.valid_page_composer_proof(support)
    )
    and (
      select count(*) = count(distinct proof ->> 'signalId')
      from (
        select candidate -> 'lead' proof
        union all
        select support from jsonb_array_elements(candidate -> 'supports') support
      ) selections
    )
    and not exists (
      select 1
      from (
        select proof ->> 'claimId' claim_id,
          count(*) uses,
          count(distinct jsonb_build_object(
            'statement', proof ->> 'statement',
            'provenance', proof ->> 'provenance',
            'evidenceIds', proof -> 'evidenceIds'
          )) canonical_versions
        from (
          select candidate -> 'lead' proof
          union all
          select support from jsonb_array_elements(candidate -> 'supports') support
        ) selections
        group by proof ->> 'claimId'
      ) claims
      where uses > 2 or canonical_versions <> 1
    )
    and octet_length(convert_to(candidate::text, 'UTF8')) <= 65536
$$;

create function app.materialize_page_composer_spec(candidate jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  with ordered_claims as (
    select claim_id, min(position) position from (
      select candidate #>> '{lead,claimId}' claim_id, 0::bigint position
      union all
      select support ->> 'claimId', ordinality
      from jsonb_array_elements(candidate -> 'supports')
        with ordinality selected(support, ordinality)
    ) proof_claims group by claim_id
  )
  select jsonb_build_object(
    'version', 1,
    'company', candidate -> 'company',
    'hero', jsonb_build_object(
      'eyebrow', 'Private application',
      'title', concat(candidate ->> 'candidateName', ' × ', candidate #>> '{company,name}'),
      'thesis', candidate #>> '{lead,statement}'
    ),
    'blocks', jsonb_build_array(jsonb_build_object(
      'type', 'fit',
      'title', 'Relevant experience',
      'claimIds', (
        select jsonb_agg(claim_id order by position) from ordered_claims
      )
    ))
  )
$$;

create or replace function app.approve_recruiter_strategy(
  run_tenant uuid, run_id uuid, strategy_artifact_id uuid,
  strategy_artifact_hash text, approval_key uuid
) returns boolean language plpgsql security definer set search_path = app, pg_temp as $$
declare
  target_run app.workflow_runs%rowtype;
  strategy app.artifacts%rowtype;
  strategy_step app.workflow_steps%rowtype;
  existing app.strategy_approvals%rowtype;
  existing_step app.workflow_steps%rowtype;
  approval_id uuid;
  composer_input jsonb;
  composer_hash text;
  actor_id uuid := app.current_user_id();
  created_approval boolean := false;
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
    approval_id := existing.id;
  else
    if target_run.status <> 'paused' or target_run.state <> 'strategy_review' then
      raise exception 'strategy approval run unavailable';
    end if;
    insert into app.strategy_approvals (
      tenant_id, workflow_run_id, strategy_artifact_id, strategy_artifact_hash,
      idempotency_key, approved_by
    ) values (
      run_tenant, run_id, strategy_artifact_id, strategy_artifact_hash,
      approval_key, actor_id
    ) returning id into approval_id;
    created_approval := true;
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'purpose', 'application',
    'profileSnapshotId', target_run.profile_id::text,
    'researchArtifactId', strategy.body ->> 'researchArtifactId',
    'researchArtifactHash', strategy.body ->> 'researchArtifactHash',
    'strategyArtifactId', strategy.id::text,
    'strategyArtifactHash', strategy_artifact_hash,
    'evidenceArchiveArtifactId', strategy.body ->> 'evidenceArchiveArtifactId',
    'evidenceArchiveArtifactHash', strategy.body ->> 'evidenceArchiveArtifactHash',
    'strategyApprovalId', approval_id::text,
    'candidateName', profile.name,
    'company', jsonb_build_object(
      'name', opportunity.company, 'role', opportunity.role,
      'accent', opportunity.accent
    ),
    'lead', (
      select jsonb_build_object(
        'signalId', selected ->> 'signalId',
        'claimId', matched ->> 'claimId',
        'statement', matched ->> 'statement',
        'provenance', matched ->> 'provenance',
        'evidenceIds', selected -> 'evidenceIds'
      )
      from jsonb_array_elements(strategy_step.input -> 'signals') signal
      cross join lateral jsonb_array_elements(signal -> 'matches') matched
      cross join lateral (select strategy.body -> 'lead' selected) chosen
      where signal ->> 'signalId' = selected ->> 'signalId'
        and matched ->> 'claimId' = selected ->> 'claimId'
    ),
    'supports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'signalId', selected ->> 'signalId',
        'claimId', matched ->> 'claimId',
        'statement', matched ->> 'statement',
        'provenance', matched ->> 'provenance',
        'evidenceIds', selected -> 'evidenceIds'
      ) order by selection_position)
      from jsonb_array_elements(strategy.body -> 'supports')
        with ordinality chosen(selected, selection_position)
      join lateral jsonb_array_elements(strategy_step.input -> 'signals') signal
        on signal ->> 'signalId' = selected ->> 'signalId'
      join lateral jsonb_array_elements(signal -> 'matches') matched
        on matched ->> 'claimId' = selected ->> 'claimId'
    ), '[]'::jsonb)
  ) into composer_input
  from app.profiles profile, app.opportunities opportunity
  where profile.tenant_id = run_tenant and profile.id = target_run.profile_id
    and opportunity.tenant_id = run_tenant
    and opportunity.id = target_run.opportunity_id;

  if composer_input is null or not app.valid_page_composer_input(composer_input) then
    raise exception 'page composer input unavailable';
  end if;
  composer_hash := encode(public.digest(composer_input::text, 'sha256'), 'hex');
  select * into existing_step from app.workflow_steps
  where tenant_id = run_tenant and workflow_run_id = run_id
    and stage = 'page-composer';
  if found then
    if existing_step.input is distinct from composer_input
      or existing_step.input_hash is distinct from composer_hash then
      raise exception 'page composer enqueue conflict';
    end if;
    return false;
  end if;
  if not created_approval
    and not (target_run.status = 'paused' and target_run.state = 'page_spec') then
    raise exception 'page composer enqueue conflict';
  end if;
  insert into app.workflow_steps (
    tenant_id, workflow_run_id, stage, status, idempotency_key, input, input_hash
  ) values (
    run_tenant, run_id, 'page-composer', 'pending',
    'page-composer:' || approval_key::text, composer_input, composer_hash
  );
  update app.workflow_runs set status = 'running', state = 'page_spec',
    deadline_at = clock_timestamp() + interval '1 hour'
  where tenant_id = run_tenant and id = run_id;
  if created_approval then
    insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      run_tenant, run_id, 'human', 'strategy_approved',
      'Human approved the recruiter strategy.',
      jsonb_build_object('strategyArtifactId', strategy.id, 'costMicros', 0)
    );
  end if;
  return created_approval;
end $$;

create function app.claim_page_composer_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate app.workflow_steps%rowtype;
  generated_token uuid := gen_random_uuid();
begin
  if lease_seconds is null or lease_seconds not between 1 and 300 then
    raise exception 'invalid page composer claim';
  end if;
  select step.* into candidate from app.workflow_steps step
  join app.workflow_runs run on run.tenant_id = step.tenant_id
    and run.id = step.workflow_run_id
  where step.stage = 'page-composer' and step.dispatched_at is null
    and (step.status = 'pending' or
      (step.status = 'leased' and step.lease_expires_at <= clock_timestamp()))
    and run.status = 'running' and run.state = 'page_spec'
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

create function app.complete_page_composer_step(
  target_step uuid, target_lease_token uuid, step_output jsonb
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  target_run app.workflow_runs%rowtype;
  expected_output jsonb;
  stored_output jsonb;
  artifact_id uuid;
  generated_page_spec_id uuid;
begin
  if target_step is null or target_lease_token is null then
    raise exception 'invalid page composer completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found or step.stage <> 'page-composer'
    or not app.valid_page_composer_input(step.input)
    or encode(public.digest(step.input::text, 'sha256'), 'hex')
      is distinct from step.input_hash then
    raise exception 'invalid page composer input';
  end if;
  expected_output := app.materialize_page_composer_spec(step.input);
  if step_output is distinct from expected_output then
    raise exception 'invalid page composer output';
  end if;
  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'page composer run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'page composer lease token mismatch';
  end if;
  if step.status = 'completed' then
    select body into stored_output from app.artifacts where id = step.output_artifact_id;
    if stored_output is distinct from step_output or step.page_spec_id is null then
      raise exception 'page composer completion conflict';
    end if;
    return step.page_spec_id;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'page_spec'
    or target_run.deadline_at <= clock_timestamp()
    or step.status <> 'leased' or step.lease_expires_at <= clock_timestamp()
    or step.dispatched_at is not null or step.reservation_id is not null then
    raise exception 'page composer completion rejected';
  end if;
  if target_run.profile_id::text is distinct from step.input ->> 'profileSnapshotId'
    or not exists (
      select 1
      from app.strategy_approvals approval
      join app.artifacts strategy on strategy.tenant_id = approval.tenant_id
        and strategy.workflow_run_id = approval.workflow_run_id
        and strategy.id = approval.strategy_artifact_id
        and strategy.kind = 'strategy' and strategy.version = 1
      join app.workflow_steps strategy_origin
        on strategy_origin.tenant_id = strategy.tenant_id
        and strategy_origin.workflow_run_id = strategy.workflow_run_id
        and strategy_origin.stage = 'recruiter-strategist'
        and strategy_origin.status = 'completed'
        and strategy_origin.output_artifact_id = strategy.id
      join app.artifacts research on research.tenant_id = strategy.tenant_id
        and research.workflow_run_id = strategy.workflow_run_id
        and research.id = (step.input ->> 'researchArtifactId')::uuid
        and research.kind = 'research' and research.version = 1
      join app.artifacts archive on archive.tenant_id = strategy.tenant_id
        and archive.workflow_run_id = strategy.workflow_run_id
        and archive.id = (step.input ->> 'evidenceArchiveArtifactId')::uuid
        and archive.kind = 'evidence_archive' and archive.version = 1
      join app.opportunities opportunity on opportunity.tenant_id = strategy.tenant_id
        and opportunity.id = target_run.opportunity_id
      where approval.tenant_id = step.tenant_id
        and approval.workflow_run_id = step.workflow_run_id
        and approval.id = (step.input ->> 'strategyApprovalId')::uuid
        and approval.strategy_artifact_hash = step.input ->> 'strategyArtifactHash'
        and strategy.id = (step.input ->> 'strategyArtifactId')::uuid
        and encode(public.digest(strategy.body::text, 'sha256'), 'hex')
          = step.input ->> 'strategyArtifactHash'
        and encode(public.digest(research.body::text, 'sha256'), 'hex')
          = step.input ->> 'researchArtifactHash'
        and encode(public.digest(archive.body::text, 'sha256'), 'hex')
          = step.input ->> 'evidenceArchiveArtifactHash'
        and strategy.body ->> 'profileSnapshotId'
          = step.input ->> 'profileSnapshotId'
        and strategy.body ->> 'researchArtifactId'
          = step.input ->> 'researchArtifactId'
        and strategy.body ->> 'researchArtifactHash'
          = step.input ->> 'researchArtifactHash'
        and strategy.body ->> 'evidenceArchiveArtifactId'
          = step.input ->> 'evidenceArchiveArtifactId'
        and strategy.body ->> 'evidenceArchiveArtifactHash'
          = step.input ->> 'evidenceArchiveArtifactHash'
        and archive.body ->> 'profileSnapshotId'
          = step.input ->> 'profileSnapshotId'
        and archive.body ->> 'researchArtifactId'
          = step.input ->> 'researchArtifactId'
        and archive.body ->> 'researchArtifactHash'
          = step.input ->> 'researchArtifactHash'
        and app.valid_evidence_archivist_output(archive.body)
        and strategy_origin.input_hash = encode(
          public.digest(strategy_origin.input::text, 'sha256'), 'hex'
        )
        and app.valid_recruiter_strategy_output(strategy.body)
        and app.valid_recruiter_strategy_grounding(
          strategy.body, strategy_origin.input
        )
        and opportunity.company = step.input #>> '{company,name}'
        and opportunity.role = step.input #>> '{company,role}'
        and opportunity.accent = step.input #>> '{company,accent}'
    ) then
    raise exception 'page composer lineage rejected';
  end if;
  if exists (
    select 1 from (
      select step.input -> 'lead' proof
      union all
      select support from jsonb_array_elements(step.input -> 'supports') support
    ) selected
    where not exists (
      select 1 from app.claims claim
      where claim.tenant_id = step.tenant_id
        and claim.profile_id = target_run.profile_id
        and claim.id = (selected.proof ->> 'claimId')::uuid
        and claim.statement = selected.proof ->> 'statement'
        and claim.level::text = selected.proof ->> 'provenance'
        and claim.level in ('verified','declared')
        and claim.sensitivity <> 'restricted'
        and 'application' = any(claim.allowed_uses)
        and not exists (
          select 1 from jsonb_array_elements_text(
            selected.proof -> 'evidenceIds'
          ) evidence_id where not exists (
            select 1 from app.claim_evidence link
            join app.evidence evidence on evidence.tenant_id = link.tenant_id
              and evidence.profile_id = link.profile_id
              and evidence.id = link.evidence_id
            join app.sources source on source.tenant_id = evidence.tenant_id
              and source.profile_id = evidence.profile_id
              and source.id = evidence.source_id
            where link.tenant_id = claim.tenant_id
              and link.profile_id = claim.profile_id and link.claim_id = claim.id
              and link.evidence_id = evidence_id::uuid and link.relation = 'supports'
              and source.sensitivity <> 'restricted'
              and 'application' = any(source.allowed_uses)
          )
        )
    )
  ) then raise exception 'page composer provenance rejected'; end if;

  artifact_id := gen_random_uuid();
  generated_page_spec_id := gen_random_uuid();
  insert into app.artifacts (
    id, tenant_id, workflow_run_id, kind, version, schema_version, body, created_by
  ) values (
    artifact_id, step.tenant_id, step.workflow_run_id, 'page_spec', 1, 1,
    step_output, 'page_composer'
  );
  insert into app.page_specs (
    id, tenant_id, workflow_run_id, version, spec, input_hash, source_artifact_id
  ) values (
    generated_page_spec_id, step.tenant_id, step.workflow_run_id, 1,
    step_output, step.input_hash, artifact_id
  );
  insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id)
  select step.tenant_id, generated_page_spec_id, claim_id::uuid from (
    select step.input #>> '{lead,claimId}' claim_id
    union
    select support ->> 'claimId'
    from jsonb_array_elements(step.input -> 'supports') support
  ) selected;
  insert into app.page_spec_evidence (
    tenant_id, page_spec_id, claim_id, evidence_id, position
  )
  select step.tenant_id, generated_page_spec_id,
    (proof ->> 'claimId')::uuid, evidence_id::uuid,
    row_number() over (order by proof_position, evidence_position) - 1
  from (
    select step.input -> 'lead' proof, 0::bigint proof_position
    union all
    select support, support_position
    from jsonb_array_elements(step.input -> 'supports')
      with ordinality selected(support, support_position)
  ) proofs
  cross join lateral jsonb_array_elements_text(proof -> 'evidenceIds')
    with ordinality selected_evidence(evidence_id, evidence_position)
  on conflict (tenant_id, page_spec_id, claim_id, evidence_id) do nothing;
  update app.workflow_steps set status = 'completed',
    output_artifact_id = artifact_id, page_spec_id = generated_page_spec_id,
    completed_at = clock_timestamp(), lease_expires_at = null
  where id = step.id;
  update app.workflow_runs set status = 'paused', state = 'page_spec_review'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'page_composer', 'artifact_written',
    'Page composer wrote the deterministic PageSpec.',
    jsonb_build_object(
      'artifactId', artifact_id, 'pageSpecId', generated_page_spec_id,
      'costMicros', 0
    )
  );
  return generated_page_spec_id;
end $$;

create function app.fail_page_composer_step(
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  target_run app.workflow_runs%rowtype;
begin
  if target_step is null or target_lease_token is null
    or target_failure_code is null
    or target_failure_code !~ '^[a-z0-9_]{1,100}$' then
    raise exception 'invalid page composer failure';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'page composer step not found'; end if;
  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'page composer run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'page composer lease token mismatch';
  end if;
  if step.status = 'failed' then
    if step.failure_code is distinct from target_failure_code then
      raise exception 'page composer failure conflict';
    end if;
    return;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'page_spec'
    or target_run.deadline_at <= clock_timestamp()
    or step.stage <> 'page-composer' or step.status <> 'leased'
    or step.lease_expires_at <= clock_timestamp()
    or step.dispatched_at is not null or step.reservation_id is not null then
    raise exception 'page composer failure rejected';
  end if;
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  update app.workflow_runs set
    state = case when status = 'running' then 'page_spec' else state end,
    status = case when status = 'running' then 'failed' else status end
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'page_composer', 'failed',
    'Page composer step failed.', jsonb_build_object('costMicros', 0)
  );
end $$;

create function app.reap_expired_page_composer_step()
returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  candidate_id uuid;
  candidate_tenant uuid;
  candidate_run uuid;
  step app.workflow_steps%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('page-composer-global-reaper', 0));
  select workflow_step.id, workflow_step.tenant_id, workflow_step.workflow_run_id
  into candidate_id, candidate_tenant, candidate_run
  from app.workflow_steps workflow_step
  join app.workflow_runs workflow_run
    on workflow_run.tenant_id = workflow_step.tenant_id
    and workflow_run.id = workflow_step.workflow_run_id
  where workflow_step.stage = 'page-composer'
    and workflow_step.status in ('pending','leased')
    and workflow_run.status = 'running' and workflow_run.state = 'page_spec'
    and workflow_run.deadline_at <= clock_timestamp()
  order by workflow_run.deadline_at, workflow_step.id limit 1;
  if not found then return null; end if;
  perform 1 from app.workflow_runs
  where tenant_id = candidate_tenant and id = candidate_run for update;
  select * into step from app.workflow_steps
  where tenant_id = candidate_tenant and id = candidate_id for update;
  if not found or step.status not in ('pending','leased') then return null; end if;
  if not exists (
    select 1 from app.workflow_runs where tenant_id = step.tenant_id
      and id = step.workflow_run_id and status = 'running' and state = 'page_spec'
      and deadline_at <= clock_timestamp()
  ) then return null; end if;
  update app.workflow_steps set status = 'failed', failure_code = 'deadline_exceeded',
    completed_at = clock_timestamp(), lease_owner = null, lease_expires_at = null
  where id = step.id;
  update app.workflow_runs set status = 'failed', state = 'page_spec'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'page_composer', 'failed',
    'Page composer deadline exceeded.',
    jsonb_build_object('failureCode', 'deadline_exceeded', 'costMicros', 0)
  );
  return step.id;
end $$;

create or replace function app.build_publication_payload(target_page_spec uuid)
returns jsonb language sql stable security definer set search_path = app, pg_temp as $$
  select jsonb_build_object(
    'spec', ps.spec,
    'profile', jsonb_build_object(
      'name', pr.name,
      'headline', pr.headline,
      'sources', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', source.id::text, 'kind', source.kind, 'title', source.title,
          'locator', source.locator, 'sensitivity', source.sensitivity::text,
          'allowedUses', to_jsonb(source.allowed_uses), 'trust', source.trust
        )) order by source.position, source.id)
        from sources source where source.profile_id = pr.id
          and source.sensitivity <> 'restricted'
          and 'application' = any(source.allowed_uses)
          and exists (
            select 1 from page_spec_evidence selected
            join evidence proof on proof.tenant_id = selected.tenant_id
              and proof.id = selected.evidence_id
            where selected.tenant_id = ps.tenant_id
              and selected.page_spec_id = ps.id and proof.source_id = source.id
          )
      ), '[]'::jsonb),
      'evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', proof.id::text, 'sourceId', proof.source_id::text,
          'label', proof.label, 'excerpt', proof.excerpt
        ) order by selected.position, proof.id)
        from (
          select evidence_id, min(position) position
          from page_spec_evidence
          where tenant_id = ps.tenant_id and page_spec_id = ps.id
          group by evidence_id
        ) selected
        join evidence proof on proof.tenant_id = ps.tenant_id
          and proof.id = selected.evidence_id and proof.profile_id = pr.id
        join sources source on source.tenant_id = ps.tenant_id
          and source.id = proof.source_id and source.profile_id = pr.id
        where source.sensitivity <> 'restricted'
          and 'application' = any(source.allowed_uses)
      ), '[]'::jsonb),
      'claims', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', claim.id::text, 'statement', claim.statement,
          'level', claim.level::text,
          'evidenceIds', coalesce((
            select jsonb_agg(selected.evidence_id::text order by selected.position)
            from page_spec_evidence selected
            where selected.tenant_id = claim.tenant_id
              and selected.page_spec_id = ps.id and selected.claim_id = claim.id
          ), '[]'::jsonb),
          'sensitivity', claim.sensitivity::text,
          'allowedUses', to_jsonb(claim.allowed_uses)
        ) order by claim.position, claim.id)
        from claims claim join page_spec_claims selected_claim
          on selected_claim.tenant_id = claim.tenant_id
          and selected_claim.claim_id = claim.id
        where selected_claim.page_spec_id = ps.id and claim.profile_id = pr.id
          and claim.sensitivity <> 'restricted'
          and 'application' = any(claim.allowed_uses)
      ), '[]'::jsonb)
    )
  ) from page_specs ps
  join workflow_runs run on run.tenant_id = ps.tenant_id
    and run.id = ps.workflow_run_id
  join profiles pr on pr.tenant_id = run.tenant_id and pr.id = run.profile_id
  where ps.id = target_page_spec and ps.invalidated_at is null
$$;

create or replace function app.check_publication() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare actual_hash text;
begin
  select spec_hash into actual_hash from page_specs
  where tenant_id = new.tenant_id and id = new.page_spec_id
    and invalidated_at is null and source_artifact_id is not null;
  if actual_hash is null or new.page_spec_hash <> actual_hash then
    raise exception 'publication requires the current immutable PageSpec hash';
  end if;
  if not exists (
    select 1 from page_specs page
    join workflow_steps composer on composer.tenant_id = page.tenant_id
      and composer.workflow_run_id = page.workflow_run_id
      and composer.stage = 'page-composer' and composer.status = 'completed'
      and composer.page_spec_id = page.id
    join artifacts output_artifact on output_artifact.tenant_id = composer.tenant_id
      and output_artifact.workflow_run_id = composer.workflow_run_id
      and output_artifact.id = composer.output_artifact_id
      and output_artifact.kind = 'page_spec' and output_artifact.version = 1
      and output_artifact.body = page.spec and output_artifact.id = page.source_artifact_id
    join artifacts strategy on strategy.tenant_id = page.tenant_id
      and strategy.workflow_run_id = page.workflow_run_id
      and strategy.id = (composer.input ->> 'strategyArtifactId')::uuid
      and strategy.kind = 'strategy' and strategy.version = 1
    join strategy_approvals approval on approval.tenant_id = page.tenant_id
      and approval.workflow_run_id = page.workflow_run_id
      and approval.id = (composer.input ->> 'strategyApprovalId')::uuid
      and approval.strategy_artifact_id = strategy.id
    where page.tenant_id = new.tenant_id and page.id = new.page_spec_id
      and composer.input_hash = encode(
        public.digest(composer.input::text, 'sha256'), 'hex'
      )
      and composer.input ->> 'strategyArtifactId' = strategy.id::text
      and composer.input ->> 'strategyArtifactHash'
        = encode(public.digest(strategy.body::text, 'sha256'), 'hex')
      and approval.strategy_artifact_hash
        = composer.input ->> 'strategyArtifactHash'
  ) then raise exception 'publication PageSpec lineage rejected'; end if;
  if not app.page_spec_review_gate(new.tenant_id, new.page_spec_id, actual_hash) then
    raise exception 'publication review gate rejected this PageSpec';
  end if;
  if not exists (
    select 1 from approvals where tenant_id = new.tenant_id
      and page_spec_id = new.page_spec_id and page_spec_hash = actual_hash
  ) then raise exception 'publication requires human approval for this hash'; end if;
  if not exists (
    select 1 from page_spec_claims where tenant_id = new.tenant_id
      and page_spec_id = new.page_spec_id
  ) or exists (
    select 1 from page_spec_claims selected_claim
    join page_specs page on page.tenant_id = selected_claim.tenant_id
      and page.id = selected_claim.page_spec_id
    join workflow_runs run on run.tenant_id = page.tenant_id
      and run.id = page.workflow_run_id
    left join claims claim on claim.tenant_id = selected_claim.tenant_id
      and claim.id = selected_claim.claim_id and claim.profile_id = run.profile_id
    where selected_claim.tenant_id = new.tenant_id
      and selected_claim.page_spec_id = new.page_spec_id
      and (claim.id is null or claim.sensitivity = 'restricted'
        or not ('application' = any(claim.allowed_uses))
        or not exists (
          select 1 from page_spec_evidence selected
          join claim_evidence link on link.tenant_id = selected.tenant_id
            and link.claim_id = selected.claim_id
            and link.evidence_id = selected.evidence_id
          join evidence proof on proof.tenant_id = link.tenant_id
            and proof.id = link.evidence_id and proof.profile_id = run.profile_id
          join sources source on source.tenant_id = proof.tenant_id
            and source.id = proof.source_id and source.profile_id = run.profile_id
          where selected.tenant_id = selected_claim.tenant_id
            and selected.page_spec_id = selected_claim.page_spec_id
            and selected.claim_id = selected_claim.claim_id
            and link.relation = 'supports' and source.sensitivity <> 'restricted'
            and 'application' = any(source.allowed_uses)
        )
        or exists (
          select 1 from page_spec_evidence selected
          left join claim_evidence link on link.tenant_id = selected.tenant_id
            and link.claim_id = selected.claim_id
            and link.evidence_id = selected.evidence_id and link.relation = 'supports'
          left join evidence proof on proof.tenant_id = selected.tenant_id
            and proof.id = selected.evidence_id and proof.profile_id = run.profile_id
          left join sources source on source.tenant_id = proof.tenant_id
            and source.id = proof.source_id and source.profile_id = run.profile_id
          where selected.tenant_id = selected_claim.tenant_id
            and selected.page_spec_id = selected_claim.page_spec_id
            and selected.claim_id = selected_claim.claim_id
            and (link.claim_id is null or proof.id is null or source.id is null
              or source.sensitivity = 'restricted'
              or not ('application' = any(source.allowed_uses)))
        ))
  ) then
    raise exception 'publication contains an unknown, restricted or unsupported claim';
  end if;
  if exists (
    (select claim_value.value from page_specs page,
      jsonb_array_elements(page.spec -> 'blocks') block,
      jsonb_array_elements_text(coalesce(block -> 'claimIds', '[]'::jsonb))
        claim_value(value)
      where page.tenant_id = new.tenant_id and page.id = new.page_spec_id
     except select claim_id::text from page_spec_claims
      where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id)
    union
    (select claim_id::text from page_spec_claims
      where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id
     except select claim_value.value from page_specs page,
      jsonb_array_elements(page.spec -> 'blocks') block,
      jsonb_array_elements_text(coalesce(block -> 'claimIds', '[]'::jsonb))
        claim_value(value)
      where page.tenant_id = new.tenant_id and page.id = new.page_spec_id)
  ) then raise exception 'PageSpec claim mapping mismatch'; end if;
  return new;
end $$;

with revoked as (
  update app.publications publication set revoked_at = clock_timestamp()
  from app.page_specs page
  where publication.tenant_id = page.tenant_id
    and publication.page_spec_id = page.id
    and publication.revoked_at is null
    and not exists (
      select 1 from app.workflow_steps composer
      where composer.tenant_id = page.tenant_id
        and composer.workflow_run_id = page.workflow_run_id
        and composer.stage = 'page-composer' and composer.status = 'completed'
        and composer.page_spec_id = page.id
        and composer.output_artifact_id = page.source_artifact_id
    )
  returning publication.tenant_id, publication.id
)
update app.share_links link set revoked_at = clock_timestamp()
from revoked
where link.tenant_id = revoked.tenant_id
  and link.publication_id = revoked.id and link.revoked_at is null;

revoke all on all tables in schema app from career_worker;
revoke usage, select on all sequences in schema app from career_worker;
grant insert on app.workflow_events to career_app;
grant select on app.page_spec_evidence to career_app, career_reviewer,
  career_publisher;

grant usage on schema app to career_page_composer;
revoke all on all tables in schema app from career_page_composer;
revoke usage, select on all sequences in schema app from career_page_composer;
grant execute on function app.claim_page_composer_step(integer),
  app.complete_page_composer_step(uuid, uuid, jsonb),
  app.fail_page_composer_step(uuid, uuid, text),
  app.reap_expired_page_composer_step()
to career_page_composer;

revoke execute on function app.valid_page_composer_proof(jsonb),
  app.valid_page_composer_input(jsonb), app.materialize_page_composer_spec(jsonb),
  app.claim_page_composer_step(integer),
  app.complete_page_composer_step(uuid, uuid, jsonb),
  app.fail_page_composer_step(uuid, uuid, text),
  app.reap_expired_page_composer_step()
from public;
revoke execute on all functions in schema app from public;
revoke execute on all functions in schema auth from public;
revoke usage on schema app, auth from public;
