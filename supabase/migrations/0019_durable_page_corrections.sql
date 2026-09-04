alter table app.workflow_runs
  add column parent_run_id uuid,
  add foreign key (tenant_id, parent_run_id)
    references app.workflow_runs(tenant_id, id),
  add constraint workflow_runs_parent_not_self check (
    parent_run_id is null or parent_run_id <> id
  );

create function app.validate_workflow_run_lineage() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare parent app.workflow_runs%rowtype;
begin
  if tg_op = 'UPDATE' and (
    old.parent_run_id is not null or exists (
      select 1 from workflow_runs child
      where child.tenant_id = old.tenant_id and child.parent_run_id = old.id
    )
  ) and (
    new.parent_run_id is distinct from old.parent_run_id
    or new.revision_count is distinct from old.revision_count
    or new.profile_id is distinct from old.profile_id
    or new.opportunity_id is distinct from old.opportunity_id
    or new.source_profile_id is distinct from old.source_profile_id
    or new.source_profile_revision is distinct from old.source_profile_revision
    or new.token_budget is distinct from old.token_budget
    or new.cost_budget_micros is distinct from old.cost_budget_micros
  ) then raise exception 'workflow run lineage is immutable'; end if;
  if tg_op = 'INSERT' and new.parent_run_id is null and new.revision_count <> 0 then
    raise exception 'new root workflow run revision must be zero';
  elsif new.parent_run_id is not null then
    select * into parent from workflow_runs where tenant_id = new.tenant_id
      and id = new.parent_run_id;
    if not found or new.profile_id is distinct from parent.profile_id
      or new.opportunity_id is distinct from parent.opportunity_id
      or new.source_profile_id is distinct from parent.source_profile_id
      or new.source_profile_revision is distinct from parent.source_profile_revision
      or new.revision_count is distinct from parent.revision_count + 1
      or new.revision_count > 3
      or new.token_budget > parent.token_budget - parent.used_tokens
        - parent.reserved_tokens
      or new.cost_budget_micros > parent.cost_budget_micros
        - parent.used_cost_micros - parent.reserved_cost_micros then
      raise exception 'workflow run lineage rejected';
    end if;
  end if;
  return new;
end $$;
create trigger workflow_run_lineage_guard before insert or update of
  parent_run_id, revision_count, profile_id, opportunity_id, source_profile_id,
  source_profile_revision, token_budget, cost_budget_micros
  on app.workflow_runs for each row
  execute function app.validate_workflow_run_lineage();

create unique index workflow_runs_one_child_per_parent
  on app.workflow_runs (tenant_id, parent_run_id)
  where parent_run_id is not null;
create unique index review_issue_decisions_one_child
  on app.review_issue_decisions (tenant_id, corrected_run_id)
  where corrected_run_id is not null;

create function app.validate_corrected_run_page_spec() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if exists (
    select 1 from workflow_runs run where run.tenant_id = new.tenant_id
      and run.id = new.workflow_run_id and run.parent_run_id is not null
  ) and exists (
    select 1 from page_specs page where page.tenant_id = new.tenant_id
      and page.workflow_run_id = new.workflow_run_id
  ) then raise exception 'corrected run already has its immutable PageSpec'; end if;
  return new;
end $$;
create trigger corrected_run_one_page_spec before insert on app.page_specs
for each row execute function app.validate_corrected_run_page_spec();

create function app.validate_page_spec_immutability() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
    or new.workflow_run_id is distinct from old.workflow_run_id
    or new.version is distinct from old.version
    or new.spec is distinct from old.spec
    or new.input_hash is distinct from old.input_hash
    or new.source_artifact_id is distinct from old.source_artifact_id
    or (old.invalidated_at is not null
      and new.invalidated_at is distinct from old.invalidated_at) then
    raise exception 'PageSpec is immutable';
  end if;
  return new;
end $$;
create trigger page_spec_immutable before update on app.page_specs
for each row execute function app.validate_page_spec_immutability();

create function app.valid_page_composer_correction_input(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate -> 'schemaVersion' = '2'::jsonb
    and app.valid_page_composer_input(
      jsonb_set(candidate - 'correction', '{schemaVersion}', '1'::jsonb)
    )
    and candidate ? 'correction'
    and jsonb_typeof(candidate -> 'correction') = 'object'
    and candidate -> 'correction' ?& array[
      'decisionId','parentRunId','pageSpecId','pageSpecHash',
      'pageSpecArtifactId','pageSpecArtifactHash','reviewId','issueIndex',
      'issue','pageSpec'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate -> 'correction') key
      where key <> all(array[
        'decisionId','parentRunId','pageSpecId','pageSpecHash',
        'pageSpecArtifactId','pageSpecArtifactHash','reviewId','issueIndex',
        'issue','pageSpec'
      ])
    )
    and not exists (
      select 1 from jsonb_array_elements(jsonb_build_array(
        candidate #> '{correction,decisionId}',
        candidate #> '{correction,parentRunId}',
        candidate #> '{correction,pageSpecId}',
        candidate #> '{correction,pageSpecArtifactId}',
        candidate #> '{correction,reviewId}'
      )) id
      where jsonb_typeof(id) <> 'string' or id #>> '{}' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and jsonb_typeof(candidate #> '{correction,pageSpecHash}') = 'string'
    and candidate #>> '{correction,pageSpecHash}' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate #> '{correction,pageSpecArtifactHash}') = 'string'
    and candidate #>> '{correction,pageSpecArtifactHash}' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate #> '{correction,issueIndex}') = 'number'
    and (candidate #>> '{correction,issueIndex}')::integer between 0 and 4
    and jsonb_typeof(candidate #> '{correction,issue}') = 'object'
    and candidate #> '{correction,issue}' ?& array[
      'section','message','blocking','claimId','evidenceIds'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate #> '{correction,issue}') key
      where key <> all(array[
        'section','message','blocking','claimId','evidenceIds'
      ])
    )
    and candidate #>> '{correction,issue,section}'
      in ('hero','relevant_experience')
    and jsonb_typeof(candidate #> '{correction,issue,message}') = 'string'
    and length(candidate #>> '{correction,issue,message}') between 1 and 400
    and jsonb_typeof(candidate #> '{correction,issue,blocking}') = 'boolean'
    and jsonb_typeof(candidate #> '{correction,issue,claimId}') = 'string'
    and candidate #>> '{correction,issue,claimId}' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(candidate #> '{correction,issue,evidenceIds}') = 'array'
    and jsonb_array_length(candidate #> '{correction,issue,evidenceIds}')
      between 1 and 2
    and jsonb_array_length(candidate #> '{correction,issue,evidenceIds}') = (
      select count(distinct value)
      from jsonb_array_elements_text(
        candidate #> '{correction,issue,evidenceIds}'
      ) value
    )
    and not exists (
      select 1 from jsonb_array_elements_text(
        candidate #> '{correction,issue,evidenceIds}'
      ) evidence_id
      where evidence_id !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and candidate #> '{correction,pageSpec,company}' = candidate -> 'company'
    and candidate #>> '{correction,pageSpec,hero,title}' =
      (candidate ->> 'candidateName') || ' × ' || (candidate #>> '{company,name}')
    and not exists (
      select 1 from jsonb_array_elements_text(
        candidate #> '{correction,pageSpec,blocks,0,claimIds}'
      ) source_claim where source_claim not in (
        select proof ->> 'claimId' from (
          select candidate -> 'lead' proof union all
          select support from jsonb_array_elements(candidate -> 'supports') support
        ) proofs
      )
    )
    and exists (
      select 1 from (
        select candidate -> 'lead' proof union all
        select support from jsonb_array_elements(candidate -> 'supports') support
      ) proofs
      where proof ->> 'claimId' in (
        select jsonb_array_elements_text(
          candidate #> '{correction,pageSpec,blocks,0,claimIds}'
        )
      ) and proof ->> 'statement' =
        candidate #>> '{correction,pageSpec,hero,thesis}'
    )
    and (
      candidate #>> '{correction,issue,section}' <> 'hero'
      or exists (
        select 1 from (
          select candidate -> 'lead' proof
          union all
          select support
          from jsonb_array_elements(candidate -> 'supports') support
        ) proofs
        where proof ->> 'claimId' = candidate #>> '{correction,issue,claimId}'
          and proof ->> 'statement' = candidate #>> '{correction,pageSpec,hero,thesis}'
      )
    )
    and (
      candidate #>> '{correction,issue,section}' <> 'relevant_experience'
      or candidate #>> '{correction,issue,claimId}' in (
        select jsonb_array_elements_text(
          candidate #> '{correction,pageSpec,blocks,0,claimIds}'
        )
      )
    )
    and octet_length(convert_to(candidate::text, 'UTF8')) <= 65536
$$;

create function app.materialize_page_composer_correction(candidate jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare source_spec jsonb; target_claim text; replacement text;
  remaining_claims jsonb; output jsonb;
begin
  if not app.valid_page_composer_correction_input(candidate) then return null; end if;
  source_spec := candidate #> '{correction,pageSpec}';
  target_claim := candidate #>> '{correction,issue,claimId}';
  if candidate #>> '{correction,issue,section}' = 'hero' then
    select support ->> 'statement' into replacement
    from jsonb_array_elements(candidate -> 'supports')
      with ordinality selected(support, position)
    where support ->> 'claimId' <> target_claim
    order by position limit 1;
    if replacement is null then return null; end if;
    output := jsonb_set(source_spec, '{hero,thesis}', to_jsonb(replacement));
  else
    select jsonb_agg(claim_id order by position) into remaining_claims
    from jsonb_array_elements_text(source_spec #> '{blocks,0,claimIds}')
      with ordinality selected(claim_id, position)
    where claim_id <> target_claim;
    if remaining_claims is null or jsonb_array_length(remaining_claims) = 0
      or not exists (
        select 1 from (
          select candidate -> 'lead' proof
          union all
          select support from jsonb_array_elements(candidate -> 'supports') support
        ) proofs
        where proof ->> 'claimId' in (
          select jsonb_array_elements_text(remaining_claims)
        ) and proof ->> 'statement' = source_spec #>> '{hero,thesis}'
      ) then return null; end if;
    output := jsonb_set(source_spec, '{blocks,0,claimIds}', remaining_claims);
  end if;
  if output is not distinct from source_spec then return null; end if;
  return output;
end $$;

create or replace function app.validate_review_issue_decision() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare target_reviewer text; target_issue text; target_run uuid;
  source_profile uuid; source_opportunity uuid; source_revision integer;
  corrected_profile uuid; corrected_opportunity uuid; corrected_revision integer;
  corrected_parent uuid;
begin
  if new.decided_by is distinct from app.current_user_id() then
    raise exception 'review issue decision actor mismatch';
  end if;
  select r.reviewer,
    case jsonb_typeof(r.issues -> new.issue_index)
      when 'object' then r.issues -> new.issue_index ->> 'message'
    end,
    ps.workflow_run_id
  into target_reviewer, target_issue, target_run
  from reviews r join page_specs ps
    on ps.tenant_id = r.tenant_id and ps.id = r.page_spec_id
  where r.tenant_id = new.tenant_id and r.id = new.review_id
    and r.page_spec_id = new.page_spec_id;
  if target_issue is null or target_issue is distinct from new.issue_text then
    raise exception 'review issue decision does not match an immutable issue';
  end if;
  if target_run is distinct from new.workflow_run_id then
    raise exception 'review issue decision run mismatch';
  end if;
  if new.decision = 'keep' and target_reviewer = 'factuality' then
    raise exception 'factuality objections cannot be kept';
  end if;
  if new.decision = 'correct' then
    select source.profile_id, source.opportunity_id, source.revision_count,
      corrected.profile_id, corrected.opportunity_id, corrected.revision_count,
      corrected.parent_run_id
    into source_profile, source_opportunity, source_revision,
      corrected_profile, corrected_opportunity, corrected_revision,
      corrected_parent
    from workflow_runs source join workflow_runs corrected
      on corrected.tenant_id = source.tenant_id
        and corrected.id = new.corrected_run_id
    where source.tenant_id = new.tenant_id
      and source.id = new.workflow_run_id;
    if corrected_profile is null
      or corrected_profile is distinct from source_profile
      or corrected_opportunity is distinct from source_opportunity then
      raise exception 'corrected run must preserve profile and opportunity';
    end if;
    if corrected_parent is distinct from new.workflow_run_id
      or corrected_revision is distinct from source_revision + 1
      or corrected_revision > 3 then
      raise exception 'corrected run lineage mismatch';
    end if;
  end if;
  return new;
end $$;

create function app.start_page_spec_correction(
  run_tenant uuid, run_id uuid, target_page_spec uuid, target_review uuid,
  target_issue_index integer, decision_id uuid, decision_key uuid,
  decision_input_hash text
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare source_run app.workflow_runs%rowtype; source_page app.page_specs%rowtype;
  source_artifact app.artifacts%rowtype; source_step app.workflow_steps%rowtype;
  source_review app.reviews%rowtype; issue jsonb; child_id uuid := gen_random_uuid();
  base_input jsonb; correction_input jsonb; correction_output jsonb;
  remaining_tokens integer; remaining_cost bigint;
  actor_id uuid := app.current_user_id();
begin
  if run_tenant is null or run_id is null or target_page_spec is null
    or target_review is null or target_issue_index is null
    or target_issue_index not between 0 and 4
    or decision_id is null or decision_key is null or decision_input_hash is null
    or decision_input_hash !~ '^[0-9a-f]{64}$' or actor_id is null
    or run_tenant is distinct from app.current_tenant_id()
    or not app.active_tenant(run_tenant) then
    raise exception 'invalid page correction';
  end if;
  select * into source_run from app.workflow_runs
  where tenant_id = run_tenant and id = run_id for update;
  if not found or source_run.status <> 'awaiting_approval'
    or source_run.state <> 'review_decision'
    or source_run.revision_count >= 3 then
    raise exception 'page correction run unavailable';
  end if;
  select * into source_page from app.page_specs
  where tenant_id = run_tenant and id = target_page_spec
    and workflow_run_id = run_id and invalidated_at is null for update;
  if not found then raise exception 'page correction PageSpec unavailable'; end if;
  select * into source_artifact from app.artifacts
  where tenant_id = run_tenant and workflow_run_id = run_id
    and id = source_page.source_artifact_id and kind = 'page_spec'
    and version = 1 and body = source_page.spec;
  if not found then raise exception 'page correction PageSpec lineage rejected'; end if;
  select * into source_step from app.workflow_steps
  where tenant_id = run_tenant and workflow_run_id = run_id
    and stage = 'page-composer' and status = 'completed'
    and page_spec_id = source_page.id
    and output_artifact_id = source_artifact.id;
  if not found or source_step.input -> 'schemaVersion' not in ('1'::jsonb, '2'::jsonb)
    or not (case source_step.input -> 'schemaVersion'
      when '1'::jsonb then app.valid_page_composer_input(source_step.input)
      else app.valid_page_composer_correction_input(source_step.input)
    end)
    or source_step.input_hash is distinct from encode(
      public.digest(source_step.input::text, 'sha256'), 'hex'
    ) or source_page.spec is distinct from (case source_step.input -> 'schemaVersion'
      when '1'::jsonb then app.materialize_page_composer_spec(source_step.input)
      else app.materialize_page_composer_correction(source_step.input)
    end) then
    raise exception 'page correction source input rejected';
  end if;
  select * into source_review from app.reviews
  where tenant_id = run_tenant and id = target_review
    and workflow_run_id = run_id and page_spec_id = source_page.id
    and page_spec_hash = source_page.spec_hash;
  if source_review.id is null then
    raise exception 'page correction issue unavailable';
  end if;
  issue := source_review.issues -> target_issue_index;
  if jsonb_typeof(issue) <> 'object'
    or issue ->> 'section' not in ('hero','relevant_experience') then
    raise exception 'page correction issue unavailable';
  end if;

  base_input := jsonb_set(
    source_step.input - 'correction', '{schemaVersion}', '2'::jsonb
  );
  correction_input := base_input || jsonb_build_object('correction', jsonb_build_object(
    'decisionId', decision_id::text,
    'parentRunId', run_id::text,
    'pageSpecId', source_page.id::text,
    'pageSpecHash', source_page.spec_hash,
    'pageSpecArtifactId', source_artifact.id::text,
    'pageSpecArtifactHash', encode(
      public.digest(source_artifact.body::text, 'sha256'), 'hex'
    ),
    'reviewId', source_review.id::text,
    'issueIndex', target_issue_index,
    'issue', issue,
    'pageSpec', source_page.spec
  ));
  if not app.valid_page_composer_correction_input(correction_input) then
    raise exception 'page correction input rejected';
  end if;
  correction_output := app.materialize_page_composer_correction(correction_input);
  if correction_output is null then
    raise exception 'page correction cannot be applied safely';
  end if;
  remaining_tokens := source_run.token_budget - source_run.used_tokens
    - source_run.reserved_tokens;
  remaining_cost := source_run.cost_budget_micros - source_run.used_cost_micros
    - source_run.reserved_cost_micros;
  if remaining_tokens < 198656 or remaining_cost < 0 then
    raise exception 'page correction residual budget rejected';
  end if;

  insert into app.workflow_runs (
    id, tenant_id, opportunity_id, profile_id, source_profile_id,
    source_profile_revision, parent_run_id, state, status, revision_count,
    token_budget, cost_budget_micros, deadline_at, input_hash
  ) values (
    child_id, run_tenant, source_run.opportunity_id, source_run.profile_id,
    source_run.source_profile_id, source_run.source_profile_revision, run_id,
    'page_spec', 'running', source_run.revision_count + 1,
    remaining_tokens, remaining_cost,
    clock_timestamp() + interval '1 hour',
    encode(public.digest(correction_input::text, 'sha256'), 'hex')
  );
  insert into app.review_issue_decisions (
    id, tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
    issue_text, decision, corrected_run_id, decided_by, idempotency_key,
    input_hash
  ) values (
    decision_id, run_tenant, run_id, source_page.id, source_review.id,
    target_issue_index, issue ->> 'message', 'correct', child_id, actor_id,
    decision_key, decision_input_hash
  );
  insert into app.workflow_steps (
    tenant_id, workflow_run_id, stage, status, idempotency_key, input, input_hash
  ) values (
    run_tenant, child_id, 'page-composer', 'pending',
    'page-composer:correction:' || decision_id::text, correction_input,
    encode(public.digest(correction_input::text, 'sha256'), 'hex')
  );
  update app.page_specs set invalidated_at = clock_timestamp()
  where tenant_id = run_tenant and id = source_page.id;
  update app.workflow_runs set status = 'blocked', state = 'correction_started'
  where tenant_id = run_tenant and id = run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values
    (run_tenant, run_id, 'human', 'review_issue_decided',
      'Human requested a targeted PageSpec correction.',
      jsonb_build_object(
        'decisionId', decision_id, 'reviewId', source_review.id,
        'issueIndex', target_issue_index, 'decision', 'correct',
        'correctedRunId', child_id, 'costMicros', 0
      )),
    (run_tenant, child_id, 'system', 'correction_started',
      'Targeted PageSpec correction started from an immutable review issue.',
      jsonb_build_object(
        'decisionId', decision_id, 'parentRunId', run_id, 'costMicros', 0
      ));
  return child_id;
end $$;

grant execute on function app.start_page_spec_correction(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text
) to career_app;
revoke execute on function app.valid_page_composer_correction_input(jsonb),
  app.materialize_page_composer_correction(jsonb),
  app.start_page_spec_correction(uuid, uuid, uuid, uuid, integer, uuid, uuid, text)
from public;

alter function app.complete_page_composer_step(uuid, uuid, jsonb)
  rename to complete_page_composer_step_v1;

create function app.complete_page_composer_correction_step(
  target_step uuid, target_lease_token uuid, step_output jsonb
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare step app.workflow_steps%rowtype; target_run app.workflow_runs%rowtype;
  source_step app.workflow_steps%rowtype; stored_output jsonb;
  artifact_id uuid; generated_page_spec_id uuid;
begin
  if target_step is null or target_lease_token is null then
    raise exception 'invalid page composer correction completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found or step.stage <> 'page-composer'
    or not app.valid_page_composer_correction_input(step.input)
    or encode(public.digest(step.input::text, 'sha256'), 'hex')
      is distinct from step.input_hash
    or step_output is distinct from app.materialize_page_composer_correction(step.input)
    or step_output is not distinct from step.input #> '{correction,pageSpec}' then
    raise exception 'invalid page composer correction input or output';
  end if;
  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'page composer correction run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'page composer correction lease token mismatch';
  end if;
  if step.status = 'completed' then
    select body into stored_output from app.artifacts where id = step.output_artifact_id;
    if stored_output is distinct from step_output or step.page_spec_id is null then
      raise exception 'page composer correction completion conflict';
    end if;
    return step.page_spec_id;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'page_spec'
    or target_run.deadline_at <= clock_timestamp()
    or step.status <> 'leased' or step.lease_expires_at <= clock_timestamp()
    or step.dispatched_at is not null or step.reservation_id is not null
    or target_run.parent_run_id::text is distinct from
      step.input #>> '{correction,parentRunId}' then
    raise exception 'page composer correction completion rejected';
  end if;
  select source.* into source_step
  from app.review_issue_decisions decision
  join app.page_specs source_page on source_page.tenant_id = decision.tenant_id
    and source_page.id = decision.page_spec_id
    and source_page.workflow_run_id = decision.workflow_run_id
    and source_page.id::text = step.input #>> '{correction,pageSpecId}'
    and source_page.spec_hash = step.input #>> '{correction,pageSpecHash}'
    and source_page.spec = step.input #> '{correction,pageSpec}'
    and source_page.invalidated_at is not null
  join app.artifacts source_artifact on source_artifact.tenant_id = source_page.tenant_id
    and source_artifact.workflow_run_id = source_page.workflow_run_id
    and source_artifact.id = source_page.source_artifact_id
    and source_artifact.id::text = step.input #>> '{correction,pageSpecArtifactId}'
    and source_artifact.body = source_page.spec
    and encode(public.digest(source_artifact.body::text, 'sha256'), 'hex') =
      step.input #>> '{correction,pageSpecArtifactHash}'
  join app.workflow_steps source on source.tenant_id = source_page.tenant_id
    and source.workflow_run_id = source_page.workflow_run_id
    and source.stage = 'page-composer' and source.status = 'completed'
    and source.page_spec_id = source_page.id
    and source.output_artifact_id = source_artifact.id
  join app.reviews source_review on source_review.tenant_id = decision.tenant_id
    and source_review.id = decision.review_id
    and source_review.id::text = step.input #>> '{correction,reviewId}'
    and source_review.page_spec_id = source_page.id
    and source_review.page_spec_hash = source_page.spec_hash
  join app.workflow_runs parent on parent.tenant_id = decision.tenant_id
    and parent.id = decision.workflow_run_id
  where decision.tenant_id = step.tenant_id
    and decision.id::text = step.input #>> '{correction,decisionId}'
    and decision.decision = 'correct'
    and decision.corrected_run_id = step.workflow_run_id
    and decision.issue_index = (step.input #>> '{correction,issueIndex}')::integer
    and decision.issue_text = step.input #>> '{correction,issue,message}'
    and source_review.issues -> decision.issue_index = step.input #> '{correction,issue}'
    and target_run.parent_run_id = parent.id
    and target_run.profile_id = parent.profile_id
    and target_run.opportunity_id = parent.opportunity_id
    and target_run.revision_count = parent.revision_count + 1
    and target_run.profile_id::text = step.input ->> 'profileSnapshotId'
    and jsonb_set(source.input - 'correction', '{schemaVersion}', '1'::jsonb) =
      jsonb_set(step.input - 'correction', '{schemaVersion}', '1'::jsonb)
    and source.input_hash = encode(public.digest(source.input::text, 'sha256'), 'hex')
    and case source.input -> 'schemaVersion'
      when '1'::jsonb then app.valid_page_composer_input(source.input)
        and source_page.spec = app.materialize_page_composer_spec(source.input)
      when '2'::jsonb then app.valid_page_composer_correction_input(source.input)
        and source_page.spec = app.materialize_page_composer_correction(source.input)
      else false
    end;
  if source_step.id is null then
    raise exception 'page composer correction lineage rejected';
  end if;
  if exists (
    select 1 from (
      select step.input -> 'lead' proof union all
      select support from jsonb_array_elements(step.input -> 'supports') support
    ) selected where not exists (
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
          select 1 from jsonb_array_elements_text(selected.proof -> 'evidenceIds') eid
          where not exists (
            select 1 from app.claim_evidence link
            join app.evidence evidence on evidence.tenant_id = link.tenant_id
              and evidence.profile_id = link.profile_id and evidence.id = link.evidence_id
            join app.sources source on source.tenant_id = evidence.tenant_id
              and source.profile_id = evidence.profile_id and source.id = evidence.source_id
            where link.tenant_id = claim.tenant_id and link.profile_id = claim.profile_id
              and link.claim_id = claim.id and link.evidence_id = eid::uuid
              and link.relation = 'supports' and source.sensitivity <> 'restricted'
              and 'application' = any(source.allowed_uses)
          )
        )
    )
  ) then raise exception 'page composer correction provenance rejected'; end if;

  artifact_id := gen_random_uuid(); generated_page_spec_id := gen_random_uuid();
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
  select step.tenant_id, generated_page_spec_id, claim_id::uuid
  from jsonb_array_elements_text(step_output #> '{blocks,0,claimIds}') claim_id;
  insert into app.page_spec_evidence (
    tenant_id, page_spec_id, claim_id, evidence_id, position
  ) select step.tenant_id, generated_page_spec_id,
      (proof ->> 'claimId')::uuid, evidence_id::uuid,
      row_number() over (order by proof_position, evidence_position) - 1
    from (
      select step.input -> 'lead' proof, 0::bigint proof_position union all
      select support, support_position
      from jsonb_array_elements(step.input -> 'supports')
        with ordinality selected(support, support_position)
    ) proofs
    cross join lateral jsonb_array_elements_text(proof -> 'evidenceIds')
      with ordinality selected_evidence(evidence_id, evidence_position)
    where proof ->> 'claimId' in (
      select jsonb_array_elements_text(step_output #> '{blocks,0,claimIds}')
    ) on conflict (tenant_id, page_spec_id, claim_id, evidence_id) do nothing;
  update app.workflow_steps set status = 'completed', output_artifact_id = artifact_id,
    page_spec_id = generated_page_spec_id, completed_at = clock_timestamp(),
    lease_expires_at = null where id = step.id;
  update app.workflow_runs set status = 'paused', state = 'page_spec_review'
    where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'page_composer', 'artifact_written',
    'Page composer wrote the targeted corrected PageSpec.',
    jsonb_build_object('artifactId', artifact_id, 'pageSpecId',
      generated_page_spec_id, 'costMicros', 0)
  );
  return generated_page_spec_id;
end $$;

create function app.complete_page_composer_step(
  target_step uuid, target_lease_token uuid, step_output jsonb
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare schema_version integer;
begin
  select (input ->> 'schemaVersion')::integer into schema_version
  from app.workflow_steps where id = target_step;
  if schema_version = 1 then
    return app.complete_page_composer_step_v1(
      target_step, target_lease_token, step_output
    );
  elsif schema_version = 2 then
    return app.complete_page_composer_correction_step(
      target_step, target_lease_token, step_output
    );
  end if;
  raise exception 'invalid page composer input';
end $$;

grant execute on function app.complete_page_composer_step(uuid, uuid, jsonb)
  to career_page_composer;
revoke execute on function app.complete_page_composer_step_v1(uuid, uuid, jsonb),
  app.complete_page_composer_correction_step(uuid, uuid, jsonb)
from public, career_page_composer;
revoke execute on function app.complete_page_composer_step(uuid, uuid, jsonb)
from public;

create function app.valid_page_composer_publication_lineage(
  target_tenant uuid, target_page_spec uuid
) returns boolean language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
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
    where page.tenant_id = target_tenant and page.id = target_page_spec
      and composer.input_hash = encode(
        public.digest(composer.input::text, 'sha256'), 'hex'
      ) and case
        when composer.input -> 'schemaVersion' = '2'::jsonb then
          app.valid_page_composer_correction_input(composer.input)
          and page.spec = app.materialize_page_composer_correction(composer.input)
          and exists (
            select 1 from review_issue_decisions decision
            join page_specs source_page on source_page.tenant_id = decision.tenant_id
              and source_page.id = decision.page_spec_id
              and source_page.id::text = composer.input #>> '{correction,pageSpecId}'
              and source_page.spec_hash = composer.input #>> '{correction,pageSpecHash}'
              and source_page.spec = composer.input #> '{correction,pageSpec}'
              and source_page.invalidated_at is not null
            join artifacts source_artifact on source_artifact.tenant_id = source_page.tenant_id
              and source_artifact.workflow_run_id = source_page.workflow_run_id
              and source_artifact.id = source_page.source_artifact_id
              and source_artifact.id::text = composer.input #>> '{correction,pageSpecArtifactId}'
              and source_artifact.kind = 'page_spec' and source_artifact.version = 1
              and source_artifact.body = source_page.spec
              and encode(public.digest(source_artifact.body::text, 'sha256'), 'hex') =
                composer.input #>> '{correction,pageSpecArtifactHash}'
            join workflow_steps source on source.tenant_id = source_page.tenant_id
              and source.workflow_run_id = source_page.workflow_run_id
              and source.stage = 'page-composer' and source.status = 'completed'
              and source.page_spec_id = source_page.id
              and source.output_artifact_id = source_artifact.id
            join reviews source_review on source_review.tenant_id = decision.tenant_id
              and source_review.id = decision.review_id
              and source_review.id::text = composer.input #>> '{correction,reviewId}'
              and source_review.page_spec_id = source_page.id
              and source_review.page_spec_hash = source_page.spec_hash
            join workflow_runs child on child.tenant_id = decision.tenant_id
              and child.id = decision.corrected_run_id
              and child.id = composer.workflow_run_id
              and child.parent_run_id = decision.workflow_run_id
            where decision.tenant_id = page.tenant_id
              and decision.id::text = composer.input #>> '{correction,decisionId}'
              and decision.decision = 'correct'
              and decision.issue_index =
                (composer.input #>> '{correction,issueIndex}')::integer
              and decision.issue_text = composer.input #>> '{correction,issue,message}'
              and source_review.issues -> decision.issue_index =
                composer.input #> '{correction,issue}'
              and jsonb_set(source.input - 'correction', '{schemaVersion}', '1'::jsonb) =
                jsonb_set(composer.input - 'correction', '{schemaVersion}', '1'::jsonb)
              and source.input_hash = encode(
                public.digest(source.input::text, 'sha256'), 'hex'
              )
              and case source.input -> 'schemaVersion'
                when '1'::jsonb then app.valid_page_composer_input(source.input)
                  and source_page.spec = app.materialize_page_composer_spec(source.input)
                when '2'::jsonb then app.valid_page_composer_correction_input(source.input)
                  and source_page.spec = app.materialize_page_composer_correction(source.input)
                else false
              end
          )
        else exists (
          select 1 from artifacts strategy
          join strategy_approvals approval on approval.tenant_id = strategy.tenant_id
            and approval.workflow_run_id = strategy.workflow_run_id
            and approval.strategy_artifact_id = strategy.id
          where strategy.tenant_id = page.tenant_id
            and strategy.workflow_run_id = page.workflow_run_id
            and strategy.id = (composer.input ->> 'strategyArtifactId')::uuid
            and strategy.kind = 'strategy' and strategy.version = 1
            and approval.id = (composer.input ->> 'strategyApprovalId')::uuid
            and composer.input ->> 'strategyArtifactId' = strategy.id::text
            and encode(public.digest(strategy.body::text, 'sha256'), 'hex') =
              composer.input ->> 'strategyArtifactHash'
            and approval.strategy_artifact_hash =
              composer.input ->> 'strategyArtifactHash'
        )
      end
  )
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
  if not app.valid_page_composer_publication_lineage(
    new.tenant_id, new.page_spec_id
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

revoke execute on function app.valid_page_composer_publication_lineage(uuid, uuid)
from public;
revoke execute on function app.validate_workflow_run_lineage(),
  app.validate_corrected_run_page_spec(), app.validate_page_spec_immutability()
from public;
