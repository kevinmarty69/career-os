do $$ begin
  create role career_recruiter_reviewer nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role career_hiring_manager_reviewer nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role career_factuality_reviewer nologin;
exception when duplicate_object then null;
end $$;

alter role career_recruiter_reviewer nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;
alter role career_hiring_manager_reviewer nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;
alter role career_factuality_reviewer nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;

do $$
declare target_role name; inherited_role name;
begin
  foreach target_role in array array[
    'career_recruiter_reviewer', 'career_hiring_manager_reviewer',
    'career_factuality_reviewer'
  ] loop
    for inherited_role in
      select granted.rolname
      from pg_auth_members membership
      join pg_roles member on member.oid = membership.member
      join pg_roles granted on granted.oid = membership.roleid
      where member.rolname = target_role
    loop
      execute format('revoke %I from %I', inherited_role, target_role);
    end loop;
  end loop;
end $$;

alter table app.reviews
  add column workflow_run_id uuid,
  add column workflow_step_id uuid,
  add column output_artifact_id uuid,
  add constraint reviews_durable_lineage_complete check (
    (workflow_run_id is null and workflow_step_id is null
      and output_artifact_id is null)
    or (workflow_run_id is not null and workflow_step_id is not null
      and output_artifact_id is not null)
  ),
  add foreign key (tenant_id, workflow_run_id)
    references app.workflow_runs(tenant_id, id) on delete cascade,
  add foreign key (tenant_id, workflow_step_id)
    references app.workflow_steps(tenant_id, id),
  add foreign key (tenant_id, output_artifact_id)
    references app.artifacts(tenant_id, id);

create unique index reviews_durable_step_once
  on app.reviews (tenant_id, workflow_step_id)
  where workflow_step_id is not null;
create unique index reviews_durable_artifact_once
  on app.reviews (tenant_id, output_artifact_id)
  where output_artifact_id is not null;

create table app.review_starts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  page_spec_id uuid not null,
  page_spec_hash text not null check (page_spec_hash ~ '^[0-9a-f]{64}$'),
  page_spec_artifact_id uuid not null,
  page_spec_artifact_hash text not null check (
    page_spec_artifact_hash ~ '^[0-9a-f]{64}$'
  ),
  idempotency_key uuid not null,
  started_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, workflow_run_id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, workflow_run_id)
    references app.workflow_runs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, page_spec_id)
    references app.page_specs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, page_spec_artifact_id)
    references app.artifacts(tenant_id, id)
);
alter table app.review_starts enable row level security;
alter table app.review_starts force row level security;
create policy review_starts_tenant on app.review_starts
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));
create trigger review_starts_immutable
before update or delete on app.review_starts
for each row execute function app.immutable_gate_row();

create function app.valid_durable_review_input(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array[
      'schemaVersion','reviewer','reviewStartId','profileSnapshotId',
      'pageSpecId','pageSpecHash','pageSpecArtifactId','pageSpecArtifactHash',
      'candidateName','company','pageSpec','proofs'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate) key where key <> all(array[
        'schemaVersion','reviewer','reviewStartId','profileSnapshotId',
        'pageSpecId','pageSpecHash','pageSpecArtifactId','pageSpecArtifactHash',
        'candidateName','company','pageSpec','proofs'
      ])
    )
    and candidate -> 'schemaVersion' = '1'::jsonb
    and jsonb_typeof(candidate -> 'reviewer') = 'string'
    and candidate ->> 'reviewer' in ('recruiter','hiring_manager','factuality')
    and not exists (
      select 1 from jsonb_array_elements(jsonb_build_array(
        candidate -> 'reviewStartId', candidate -> 'profileSnapshotId',
        candidate -> 'pageSpecId', candidate -> 'pageSpecArtifactId'
      )) id
      where jsonb_typeof(id) <> 'string' or id #>> '{}' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and jsonb_typeof(candidate -> 'pageSpecHash') = 'string'
    and candidate ->> 'pageSpecHash' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'pageSpecArtifactHash') = 'string'
    and candidate ->> 'pageSpecArtifactHash' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'candidateName') = 'string'
    and length(candidate ->> 'candidateName') between 1 and 200
    and jsonb_typeof(candidate -> 'company') = 'object'
    and candidate -> 'company' ?& array['name','role']
    and not exists (
      select 1 from jsonb_object_keys(candidate -> 'company') key
      where key <> all(array['name','role'])
    )
    and jsonb_typeof(candidate #> '{company,name}') = 'string'
    and length(candidate #>> '{company,name}') between 1 and 200
    and jsonb_typeof(candidate #> '{company,role}') = 'string'
    and length(candidate #>> '{company,role}') between 1 and 200
    and jsonb_typeof(candidate -> 'pageSpec') = 'object'
    and candidate -> 'pageSpec' ?& array['version','company','hero','blocks']
    and not exists (
      select 1 from jsonb_object_keys(candidate -> 'pageSpec') key
      where key <> all(array['version','company','hero','blocks'])
    )
    and candidate #> '{pageSpec,version}' = '1'::jsonb
    and jsonb_typeof(candidate #> '{pageSpec,company}') = 'object'
    and candidate #> '{pageSpec,company}' ?& array['name','role','accent']
    and not exists (
      select 1 from jsonb_object_keys(candidate #> '{pageSpec,company}') key
      where key <> all(array['name','role','accent'])
    )
    and candidate #>> '{pageSpec,company,name}' = candidate #>> '{company,name}'
    and candidate #>> '{pageSpec,company,role}' = candidate #>> '{company,role}'
    and jsonb_typeof(candidate #> '{pageSpec,company,accent}') = 'string'
    and candidate #>> '{pageSpec,company,accent}' ~ '^#[0-9a-fA-F]{6}$'
    and jsonb_typeof(candidate #> '{pageSpec,hero}') = 'object'
    and candidate #> '{pageSpec,hero}' ?& array['eyebrow','title','thesis']
    and not exists (
      select 1 from jsonb_object_keys(candidate #> '{pageSpec,hero}') key
      where key <> all(array['eyebrow','title','thesis'])
    )
    and candidate #>> '{pageSpec,hero,eyebrow}' = 'Private application'
    and jsonb_typeof(candidate #> '{pageSpec,hero,title}') = 'string'
    and length(candidate #>> '{pageSpec,hero,title}') between 1 and 403
    and jsonb_typeof(candidate #> '{pageSpec,hero,thesis}') = 'string'
    and length(candidate #>> '{pageSpec,hero,thesis}') between 1 and 5000
    and jsonb_typeof(candidate #> '{pageSpec,blocks}') = 'array'
    and jsonb_array_length(candidate #> '{pageSpec,blocks}') = 1
    and jsonb_typeof(candidate #> '{pageSpec,blocks,0}') = 'object'
    and candidate #> '{pageSpec,blocks,0}' ?& array['type','title','claimIds']
    and not exists (
      select 1 from jsonb_object_keys(candidate #> '{pageSpec,blocks,0}') key
      where key <> all(array['type','title','claimIds'])
    )
    and candidate #>> '{pageSpec,blocks,0,type}' = 'fit'
    and candidate #>> '{pageSpec,blocks,0,title}' = 'Relevant experience'
    and jsonb_typeof(candidate #> '{pageSpec,blocks,0,claimIds}') = 'array'
    and jsonb_array_length(candidate #> '{pageSpec,blocks,0,claimIds}')
      between 1 and 5
    and jsonb_array_length(candidate #> '{pageSpec,blocks,0,claimIds}') = (
      select count(distinct value)
      from jsonb_array_elements_text(
        candidate #> '{pageSpec,blocks,0,claimIds}'
      ) value
    )
    and not exists (
      select 1 from jsonb_array_elements(
        candidate #> '{pageSpec,blocks,0,claimIds}'
      ) claim_id
      where jsonb_typeof(claim_id) <> 'string' or claim_id #>> '{}' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and jsonb_typeof(candidate -> 'proofs') = 'array'
    and jsonb_array_length(candidate -> 'proofs') between 1 and 5
    and jsonb_array_length(candidate -> 'proofs') = (
      select count(distinct proof ->> 'claimId')
      from jsonb_array_elements(candidate -> 'proofs') proof
    )
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'proofs') proof
      where jsonb_typeof(proof) <> 'object'
        or not proof ?& array['claimId','statement','provenance','evidence']
        or exists (
          select 1 from jsonb_object_keys(proof) key
          where key <> all(array['claimId','statement','provenance','evidence'])
        )
        or jsonb_typeof(proof -> 'claimId') <> 'string'
        or proof ->> 'claimId' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or jsonb_typeof(proof -> 'statement') <> 'string'
        or length(proof ->> 'statement') not between 1 and 5000
        or jsonb_typeof(proof -> 'provenance') <> 'string'
        or proof ->> 'provenance' not in ('verified','declared')
        or jsonb_typeof(proof -> 'evidence') <> 'array'
        or jsonb_array_length(proof -> 'evidence') not between 1 and 2
        or jsonb_array_length(proof -> 'evidence') <> (
          select count(distinct evidence ->> 'evidenceId')
          from jsonb_array_elements(proof -> 'evidence') evidence
        )
        or exists (
          select 1 from jsonb_array_elements(proof -> 'evidence') evidence
          where jsonb_typeof(evidence) <> 'object'
            or not evidence ?& array['evidenceId','sourceId','label','excerpt']
            or exists (
              select 1 from jsonb_object_keys(evidence) key
              where key <> all(array['evidenceId','sourceId','label','excerpt'])
            )
            or jsonb_typeof(evidence -> 'evidenceId') <> 'string'
            or evidence ->> 'evidenceId' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or jsonb_typeof(evidence -> 'sourceId') <> 'string'
            or evidence ->> 'sourceId' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or jsonb_typeof(evidence -> 'label') <> 'string'
            or length(evidence ->> 'label') not between 1 and 500
            or jsonb_typeof(evidence -> 'excerpt') <> 'string'
            or length(evidence ->> 'excerpt') not between 1 and 2000
        )
    )
    and not exists (
      (select value from jsonb_array_elements_text(
        candidate #> '{pageSpec,blocks,0,claimIds}'
      ) value
       except select proof ->> 'claimId'
       from jsonb_array_elements(candidate -> 'proofs') proof)
      union all
      (select proof ->> 'claimId'
       from jsonb_array_elements(candidate -> 'proofs') proof
       except select value from jsonb_array_elements_text(
         candidate #> '{pageSpec,blocks,0,claimIds}'
       ) value)
    )
    and exists (
      select 1 from jsonb_array_elements(candidate -> 'proofs') proof
      where proof ->> 'statement' = candidate #>> '{pageSpec,hero,thesis}'
    )
    and octet_length(convert_to(candidate::text, 'UTF8')) <= 47104
$$;

create function app.valid_durable_review_output(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array[
      'schemaVersion','purpose','pageSpecId','pageSpecHash','reviewer','verdict',
      'issues'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate) key where key <> all(array[
        'schemaVersion','purpose','pageSpecId','pageSpecHash','reviewer','verdict',
        'issues'
      ])
    )
    and candidate -> 'schemaVersion' = '1'::jsonb
    and jsonb_typeof(candidate -> 'purpose') = 'string'
    and candidate ->> 'purpose' = 'page-spec-review'
    and jsonb_typeof(candidate -> 'reviewer') = 'string'
    and candidate ->> 'reviewer' in ('recruiter','hiring_manager','factuality')
    and not exists (
      select 1 from jsonb_array_elements(jsonb_build_array(
        candidate -> 'pageSpecId'
      )) id
      where jsonb_typeof(id) <> 'string' or id #>> '{}' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and jsonb_typeof(candidate -> 'pageSpecHash') = 'string'
    and candidate ->> 'pageSpecHash' ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(candidate -> 'verdict') = 'string'
    and candidate ->> 'verdict' in ('pass','changes_required')
    and jsonb_typeof(candidate -> 'issues') = 'array'
    and jsonb_array_length(candidate -> 'issues') <= 5
    and ((candidate ->> 'verdict' = 'pass'
          and jsonb_array_length(candidate -> 'issues') = 0)
      or (candidate ->> 'verdict' = 'changes_required'
          and jsonb_array_length(candidate -> 'issues') between 1 and 5))
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'issues') issue
      where jsonb_typeof(issue) <> 'object'
        or not issue ?& array[
          'section','message','blocking','claimId','evidenceIds'
        ]
        or exists (
          select 1 from jsonb_object_keys(issue) key where key <> all(array[
            'section','message','blocking','claimId','evidenceIds'
          ])
        )
        or jsonb_typeof(issue -> 'section') <> 'string'
        or issue ->> 'section' not in ('hero','relevant_experience')
        or jsonb_typeof(issue -> 'message') <> 'string'
        or length(issue ->> 'message') not between 1 and 400
        or jsonb_typeof(issue -> 'blocking') <> 'boolean'
        or jsonb_typeof(issue -> 'claimId') <> 'string'
        or issue ->> 'claimId' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or jsonb_typeof(issue -> 'evidenceIds') <> 'array'
        or jsonb_array_length(issue -> 'evidenceIds') not between 1 and 2
        or jsonb_array_length(issue -> 'evidenceIds') <> (
          select count(distinct value)
          from jsonb_array_elements_text(issue -> 'evidenceIds') value
        )
        or exists (
          select 1 from jsonb_array_elements(issue -> 'evidenceIds') evidence_id
          where jsonb_typeof(evidence_id) <> 'string'
            or evidence_id #>> '{}' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
    )
$$;

create function app.durable_review_output_grounded(
  candidate jsonb, source_input jsonb
) returns boolean language sql immutable set search_path = pg_catalog as $$
  select app.valid_durable_review_input(source_input)
    and app.valid_durable_review_output(candidate)
    and candidate ->> 'reviewer' = source_input ->> 'reviewer'
    and candidate ->> 'pageSpecId' = source_input ->> 'pageSpecId'
    and candidate ->> 'pageSpecHash' = source_input ->> 'pageSpecHash'
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'issues') issue
      where (issue ->> 'blocking')::boolean
        is distinct from (candidate ->> 'reviewer' = 'factuality')
    )
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'issues') issue
      where not exists (
        select 1 from jsonb_array_elements(source_input -> 'proofs') proof
        where proof ->> 'claimId' = issue ->> 'claimId'
          and not exists (
            select 1 from jsonb_array_elements_text(
              issue -> 'evidenceIds'
            ) selected_id
            where not exists (
              select 1 from jsonb_array_elements(proof -> 'evidence') evidence
              where evidence ->> 'evidenceId' = selected_id
            )
          )
      )
    )
$$;

create function app.build_durable_review_input(
  run_tenant uuid, run_id uuid, target_page uuid, target_start uuid,
  target_reviewer text
) returns jsonb language sql stable security definer
set search_path = app, pg_temp as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'reviewer', target_reviewer,
    'reviewStartId', target_start::text,
    'profileSnapshotId', run.profile_id::text,
    'pageSpecId', page.id::text,
    'pageSpecHash', page.spec_hash,
    'pageSpecArtifactId', page_artifact.id::text,
    'pageSpecArtifactHash', encode(
      public.digest(page_artifact.body::text, 'sha256'), 'hex'
    ),
    'candidateName', profile.name,
    'company', jsonb_build_object(
      'name', opportunity.company, 'role', opportunity.role
    ),
    'pageSpec', page.spec,
    'proofs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'claimId', claim.id::text,
        'statement', claim.statement,
        'provenance', claim.level::text,
        'evidence', coalesce((
          select jsonb_agg(jsonb_build_object(
            'evidenceId', evidence.id::text,
            'sourceId', source.id::text,
            'label', evidence.label,
            'excerpt', evidence.excerpt
          ) order by selected.position, evidence.id)
          from app.page_spec_evidence selected
          join app.evidence evidence on evidence.tenant_id = selected.tenant_id
            and evidence.profile_id = run.profile_id
            and evidence.id = selected.evidence_id
          join app.sources source on source.tenant_id = evidence.tenant_id
            and source.profile_id = evidence.profile_id
            and source.id = evidence.source_id
          join app.claim_evidence link on link.tenant_id = selected.tenant_id
            and link.profile_id = run.profile_id
            and link.claim_id = selected.claim_id
            and link.evidence_id = selected.evidence_id
            and link.relation = 'supports'
          where selected.tenant_id = page.tenant_id
            and selected.page_spec_id = page.id
            and selected.claim_id = claim.id
            and source.sensitivity <> 'restricted'
            and 'application' = any(source.allowed_uses)
        ), '[]'::jsonb)
      ) order by claim.position, claim.id)
      from app.page_spec_claims selected_claim
      join app.claims claim on claim.tenant_id = selected_claim.tenant_id
        and claim.profile_id = run.profile_id
        and claim.id = selected_claim.claim_id
      where selected_claim.tenant_id = page.tenant_id
        and selected_claim.page_spec_id = page.id
        and claim.level in ('verified','declared')
        and claim.sensitivity <> 'restricted'
        and 'application' = any(claim.allowed_uses)
    ), '[]'::jsonb)
  )
  from app.workflow_runs run
  join app.profiles profile on profile.tenant_id = run.tenant_id
    and profile.id = run.profile_id and profile.profile_kind = 'snapshot'
  join app.opportunities opportunity on opportunity.tenant_id = run.tenant_id
    and opportunity.id = run.opportunity_id
  join app.page_specs page on page.tenant_id = run.tenant_id
    and page.workflow_run_id = run.id and page.id = target_page
    and page.invalidated_at is null and page.source_artifact_id is not null
  join app.artifacts page_artifact on page_artifact.tenant_id = page.tenant_id
    and page_artifact.workflow_run_id = page.workflow_run_id
    and page_artifact.id = page.source_artifact_id
    and page_artifact.kind = 'page_spec' and page_artifact.version = 1
    and page_artifact.body = page.spec
  join app.workflow_steps composer on composer.tenant_id = page.tenant_id
    and composer.workflow_run_id = page.workflow_run_id
    and composer.stage = 'page-composer' and composer.status = 'completed'
    and composer.page_spec_id = page.id
    and composer.output_artifact_id = page_artifact.id
    and composer.input_hash = encode(
      public.digest(composer.input::text, 'sha256'), 'hex'
    )
  where run.tenant_id = run_tenant and run.id = run_id
    and target_reviewer in ('recruiter','hiring_manager','factuality')
    and not exists (
      select 1 from app.page_specs newer
      where newer.tenant_id = page.tenant_id
        and newer.workflow_run_id = page.workflow_run_id
        and newer.invalidated_at is null and newer.version > page.version
    )
$$;

create function app.enqueue_durable_review_step(
  run_tenant uuid, run_id uuid, target_reviewer text, step_input jsonb
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare target_stage text; existing app.workflow_steps%rowtype;
  generated_step uuid; input_digest text;
begin
  target_stage := case target_reviewer
    when 'recruiter' then 'recruiter-reviewer'
    when 'hiring_manager' then 'hiring-manager-reviewer'
    when 'factuality' then 'factuality-reviewer'
  end;
  if target_stage is null or not app.valid_durable_review_input(step_input)
    or step_input ->> 'reviewer' <> target_reviewer then
    raise exception 'invalid durable review step';
  end if;
  input_digest := encode(public.digest(step_input::text, 'sha256'), 'hex');
  select * into existing from app.workflow_steps
  where tenant_id = run_tenant and workflow_run_id = run_id
    and stage = target_stage;
  if found then
    if existing.input is distinct from step_input
      or existing.input_hash is distinct from input_digest then
      raise exception 'durable review step conflict';
    end if;
    return existing.id;
  end if;
  insert into app.workflow_steps (
    tenant_id, workflow_run_id, stage, status, idempotency_key,
    input, input_hash, page_spec_id
  ) values (
    run_tenant, run_id, target_stage, 'pending',
    target_stage || ':' || (step_input ->> 'reviewStartId'),
    step_input, input_digest, (step_input ->> 'pageSpecId')::uuid
  ) returning id into generated_step;
  return generated_step;
end $$;

create function app.start_page_spec_reviews(
  run_tenant uuid, run_id uuid, start_key uuid
) returns boolean language plpgsql security definer set search_path = app, pg_temp as $$
declare target_run app.workflow_runs%rowtype; target_page app.page_specs%rowtype;
  page_artifact app.artifacts%rowtype; existing app.review_starts%rowtype;
  generated_start uuid := gen_random_uuid(); step_input jsonb;
  actor_id uuid := app.current_user_id();
begin
  if run_tenant is null or run_id is null or start_key is null or actor_id is null
    or run_tenant is distinct from app.current_tenant_id()
    or not app.active_tenant(run_tenant) then
    raise exception 'invalid review start';
  end if;
  select * into target_run from app.workflow_runs
  where tenant_id = run_tenant and id = run_id for update;
  if not found then raise exception 'review run unavailable'; end if;

  select * into existing from app.review_starts
  where tenant_id = run_tenant
    and (workflow_run_id = run_id or idempotency_key = start_key)
  order by (workflow_run_id = run_id) desc limit 1;
  if found then
    if existing.workflow_run_id is distinct from run_id
      or existing.idempotency_key is distinct from start_key then
      raise exception 'review start conflict';
    end if;
    return false;
  end if;
  if target_run.status <> 'paused' or target_run.state <> 'page_spec_review' then
    raise exception 'review run unavailable';
  end if;
  select * into target_page from app.page_specs
  where tenant_id = run_tenant and workflow_run_id = run_id
    and invalidated_at is null
  order by version desc limit 1 for update;
  if not found or target_page.source_artifact_id is null then
    raise exception 'review PageSpec unavailable';
  end if;
  select * into page_artifact from app.artifacts
  where tenant_id = run_tenant and workflow_run_id = run_id
    and id = target_page.source_artifact_id and kind = 'page_spec' and version = 1
    and body = target_page.spec;
  if not found then raise exception 'review PageSpec lineage rejected'; end if;
  step_input := app.build_durable_review_input(
    run_tenant, run_id, target_page.id, generated_start, 'recruiter'
  );
  if step_input is null or not app.valid_durable_review_input(step_input) then
    raise exception 'review input unavailable';
  end if;
  insert into app.review_starts (
    id, tenant_id, workflow_run_id, page_spec_id, page_spec_hash,
    page_spec_artifact_id, page_spec_artifact_hash, idempotency_key, started_by
  ) values (
    generated_start, run_tenant, run_id, target_page.id, target_page.spec_hash,
    page_artifact.id, encode(public.digest(page_artifact.body::text, 'sha256'), 'hex'),
    start_key, actor_id
  );
  perform app.enqueue_durable_review_step(
    run_tenant, run_id, 'recruiter', step_input
  );
  update app.workflow_runs set status = 'running', state = 'review_recruiter',
    deadline_at = clock_timestamp() + interval '1 hour'
  where tenant_id = run_tenant and id = run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    run_tenant, run_id, 'human', 'page_spec_reviews_started',
    'Human started durable PageSpec reviews.',
    jsonb_build_object('pageSpecId', target_page.id, 'costMicros', 0)
  );
  return true;
end $$;

create function app.claim_durable_review_step(
  target_stage text, target_state text, lease_seconds integer
) returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language plpgsql security definer set search_path = app, pg_temp as $$
declare candidate app.workflow_steps%rowtype; generated_token uuid := gen_random_uuid();
begin
  if (target_stage, target_state) not in (
      ('recruiter-reviewer','review_recruiter'),
      ('hiring-manager-reviewer','review_hiring_manager'),
      ('factuality-reviewer','review_factuality')
    ) or lease_seconds is null or lease_seconds not between 1 and 300 then
    raise exception 'invalid durable reviewer claim';
  end if;
  select step.* into candidate from app.workflow_steps step
  join app.workflow_runs run on run.tenant_id = step.tenant_id
    and run.id = step.workflow_run_id
  where step.stage = target_stage and step.dispatched_at is null
    and (step.status = 'pending' or
      (step.status = 'leased' and step.lease_expires_at <= clock_timestamp()))
    and run.status = 'running' and run.state = target_state
    and run.deadline_at > clock_timestamp()
  order by step.created_at, step.id for update of step skip locked limit 1;
  if not found then return; end if;
  update app.workflow_steps claimed set status = 'leased',
    attempt = case when candidate.status = 'pending' then candidate.attempt
      else candidate.attempt + 1 end,
    lease_owner = generated_token::text,
    lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds),
    failure_code = null where claimed.id = candidate.id
  returning claimed.id, claimed.workflow_run_id, claimed.attempt,
    generated_token, claimed.input, claimed.input_hash
  into step_id, workflow_run_id, attempt, lease_token, input, input_hash;
  return next;
end $$;

create function app.mark_durable_reviewer_in_flight(
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
    or target_provider <> 'openai-compatible-local'
    or target_model is null or length(target_model) not between 1 and 200
    or reserve_tokens is null or reserve_tokens not between 1 and 99328
    or reserve_cost is distinct from 0 then
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
  update app.workflow_runs set reserved_tokens = reserved_tokens + reserve_tokens
  where tenant_id = step.tenant_id and id = step.workflow_run_id
    and status = 'running' and state = target_state
    and deadline_at > clock_timestamp()
    and used_tokens + reserved_tokens + reserve_tokens <= token_budget
    and used_cost_micros + reserved_cost_micros <= cost_budget_micros;
  if not found then raise exception 'durable reviewer budget rejected'; end if;
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

create function app.complete_durable_provider_review_step(
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
    or total_tokens > 2147483647 or actual_cost is distinct from 0
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
      public.digest(step.input::text, 'sha256'), 'hex'
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
      or usage.output_tokens <> actual_output_tokens or usage.cost_micros <> 0
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
      and encode(public.digest(page_artifact.body::text, 'sha256'), 'hex')
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
    or reservation.requested_cost_micros <> 0 then
    raise exception 'durable reviewer reservation rejected';
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
    step.provider, step.model, actual_input_tokens, actual_output_tokens, 0,
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
      'verdict', step_output ->> 'verdict', 'costMicros', 0
    )
  );
  return artifact_id;
end $$;

create function app.fail_durable_provider_review_step(
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
    or reservation.requested_cost_micros <> 0 then
    raise exception 'durable reviewer reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    used_tokens = used_tokens + reservation.requested_tokens,
    status = case when status = 'running' then 'failed' else status end,
    state = case when status = 'running' then target_state else state end
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
    step.tenant_id, step.workflow_run_id, step.id, target_actor,
    step.provider, step.model, reservation.requested_tokens, 0, 0, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, target_actor, 'failed',
    'Durable reviewer step failed.', jsonb_build_object('costMicros', 0)
  );
end $$;

create function app.reap_expired_durable_provider_review_step(
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
    or reservation.requested_cost_micros <> 0 then
    raise exception 'durable reviewer reservation missing';
  end if;
  update app.workflow_runs set
    reserved_tokens = reserved_tokens - reservation.requested_tokens,
    used_tokens = used_tokens + reservation.requested_tokens,
    status = case when status = 'running' then 'failed' else status end,
    state = case when status = 'running' then target_state else state end
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
    step.tenant_id, step.workflow_run_id, step.id, target_actor,
    step.provider, step.model, reservation.requested_tokens, 0, 0, 0, false,
    'reserved_unknown'
  );
  update app.workflow_steps set status = 'failed',
    failure_code = 'provider_outcome_unknown', completed_at = clock_timestamp(),
    lease_expires_at = null where id = step.id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, target_actor, 'failed',
    'Durable reviewer step failed.', jsonb_build_object('costMicros', 0)
  );
  return step.id;
end $$;

create function app.materialize_factuality_reviewer_output(source_input jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'purpose', 'page-spec-review',
    'reviewer', 'factuality',
    'pageSpecId', source_input ->> 'pageSpecId',
    'pageSpecHash', source_input ->> 'pageSpecHash',
    'verdict', 'pass',
    'issues', '[]'::jsonb
  )
$$;

create function app.complete_factuality_reviewer_step(
  target_step uuid, target_lease_token uuid, step_output jsonb
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare step app.workflow_steps%rowtype; target_run app.workflow_runs%rowtype;
  stored_output jsonb; expected_output jsonb; artifact_id uuid; review_id uuid;
  final_state text;
begin
  if target_step is null or target_lease_token is null then
    raise exception 'invalid factuality reviewer completion';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found or step.stage <> 'factuality-reviewer'
    or not app.valid_durable_review_input(step.input)
    or step.input ->> 'reviewer' <> 'factuality'
    or step.input_hash is distinct from encode(
      public.digest(step.input::text, 'sha256'), 'hex'
    ) then raise exception 'invalid factuality reviewer input'; end if;
  expected_output := app.materialize_factuality_reviewer_output(step.input);
  if step_output is distinct from expected_output
    or not app.durable_review_output_grounded(step_output, step.input) then
    raise exception 'invalid factuality reviewer output';
  end if;
  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  if not found then raise exception 'factuality reviewer run not found'; end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'factuality reviewer lease token mismatch';
  end if;
  if step.status = 'completed' then
    select body into stored_output from app.artifacts where id = step.output_artifact_id;
    if stored_output is distinct from step_output then
      raise exception 'factuality reviewer completion conflict';
    end if;
    return step.output_artifact_id;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'review_factuality'
    or target_run.deadline_at <= clock_timestamp()
    or step.status <> 'leased' or step.lease_expires_at <= clock_timestamp()
    or step.dispatched_at is not null or step.reservation_id is not null then
    raise exception 'factuality reviewer completion rejected';
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
      and encode(public.digest(page_artifact.body::text, 'sha256'), 'hex')
        = started.page_spec_artifact_hash
    where started.tenant_id = step.tenant_id
      and started.workflow_run_id = step.workflow_run_id
      and started.id::text = step.input ->> 'reviewStartId'
  ) then raise exception 'factuality reviewer lineage rejected'; end if;
  artifact_id := gen_random_uuid(); review_id := gen_random_uuid();
  insert into app.artifacts (
    id, tenant_id, workflow_run_id, kind, version, schema_version, body, created_by
  ) values (
    artifact_id, step.tenant_id, step.workflow_run_id, 'review', 3, 1,
    step_output, 'fact_checker'
  );
  insert into app.reviews (
    id, tenant_id, workflow_run_id, workflow_step_id, output_artifact_id,
    page_spec_id, page_spec_hash, reviewer, verdict, issues
  ) values (
    review_id, step.tenant_id, step.workflow_run_id, step.id, artifact_id,
    (step.input ->> 'pageSpecId')::uuid, step.input ->> 'pageSpecHash',
    'factuality', 'pass', '[]'::jsonb
  );
  update app.workflow_steps set status = 'completed', output_artifact_id = artifact_id,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  final_state := case when exists (
    select 1 from app.reviews review
    where review.tenant_id = step.tenant_id
      and review.workflow_run_id = step.workflow_run_id
      and review.reviewer in ('recruiter','hiring_manager')
      and review.verdict = 'changes_required'
  ) then 'review_decision' else 'human_approval' end;
  update app.workflow_runs set status = 'awaiting_approval', state = final_state
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'fact_checker', 'review_completed',
    'Deterministic factuality review completed.',
    jsonb_build_object(
      'reviewId', review_id, 'artifactId', artifact_id,
      'verdict', 'pass', 'costMicros', 0
    )
  );
  return artifact_id;
end $$;

create function app.fail_factuality_reviewer_step(
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare step app.workflow_steps%rowtype; target_run app.workflow_runs%rowtype;
begin
  if target_step is null or target_lease_token is null
    or target_failure_code is null
    or target_failure_code !~ '^[a-z0-9_]{1,100}$' then
    raise exception 'invalid factuality reviewer failure';
  end if;
  select * into step from app.workflow_steps where id = target_step;
  if not found then raise exception 'factuality reviewer step not found'; end if;
  select * into target_run from app.workflow_runs
  where tenant_id = step.tenant_id and id = step.workflow_run_id for update;
  select * into step from app.workflow_steps where id = target_step for update;
  if step.lease_owner is distinct from target_lease_token::text then
    raise exception 'factuality reviewer lease token mismatch';
  end if;
  if step.status = 'failed' then
    if step.failure_code is distinct from target_failure_code then
      raise exception 'factuality reviewer failure conflict';
    end if;
    return;
  end if;
  if target_run.status <> 'running' or target_run.state <> 'review_factuality'
    or target_run.deadline_at <= clock_timestamp()
    or step.stage <> 'factuality-reviewer' or step.status <> 'leased'
    or step.lease_expires_at <= clock_timestamp()
    or step.dispatched_at is not null or step.reservation_id is not null then
    raise exception 'factuality reviewer failure rejected';
  end if;
  update app.workflow_steps set status = 'failed', failure_code = target_failure_code,
    completed_at = clock_timestamp(), lease_expires_at = null where id = step.id;
  update app.workflow_runs set status = 'failed', state = 'review_factuality'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'fact_checker', 'failed',
    'Factuality reviewer step failed.', jsonb_build_object('costMicros', 0)
  );
end $$;

create function app.reap_expired_factuality_reviewer_step()
returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare candidate_id uuid; candidate_tenant uuid; candidate_run uuid;
  step app.workflow_steps%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('factuality-reviewer:reaper', 0));
  select workflow_step.id, workflow_step.tenant_id, workflow_step.workflow_run_id
  into candidate_id, candidate_tenant, candidate_run
  from app.workflow_steps workflow_step
  join app.workflow_runs workflow_run
    on workflow_run.tenant_id = workflow_step.tenant_id
    and workflow_run.id = workflow_step.workflow_run_id
  where workflow_step.stage = 'factuality-reviewer'
    and workflow_step.status in ('pending','leased')
    and workflow_run.status = 'running'
    and workflow_run.state = 'review_factuality'
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
      and id = step.workflow_run_id and status = 'running'
      and state = 'review_factuality' and deadline_at <= clock_timestamp()
  ) then return null; end if;
  update app.workflow_steps set status = 'failed', failure_code = 'deadline_exceeded',
    completed_at = clock_timestamp(), lease_owner = null, lease_expires_at = null
  where id = step.id;
  update app.workflow_runs set status = 'failed', state = 'review_factuality'
  where tenant_id = step.tenant_id and id = step.workflow_run_id;
  insert into app.workflow_events (
    tenant_id, workflow_run_id, actor, event_type, summary, payload
  ) values (
    step.tenant_id, step.workflow_run_id, 'fact_checker', 'failed',
    'Factuality reviewer deadline exceeded.',
    jsonb_build_object('failureCode', 'deadline_exceeded', 'costMicros', 0)
  );
  return step.id;
end $$;

create function app.claim_recruiter_reviewer_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language sql security definer set search_path = app, pg_temp as $$
  select * from app.claim_durable_review_step(
    'recruiter-reviewer', 'review_recruiter', lease_seconds
  )
$$;
create function app.mark_recruiter_reviewer_in_flight(
  target_step uuid, target_lease_token uuid, target_provider text,
  target_model text, reserve_tokens integer, reserve_cost bigint
) returns void language sql security definer set search_path = app, pg_temp as $$
  select app.mark_durable_reviewer_in_flight(
    'recruiter-reviewer','review_recruiter',target_step,target_lease_token,
    target_provider,target_model,reserve_tokens,reserve_cost
  )
$$;
create function app.complete_recruiter_reviewer_step(
  target_step uuid, target_lease_token uuid, step_output jsonb,
  actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint,
  actual_latency integer, was_cache_hit boolean, request_id text default null
) returns uuid language sql security definer set search_path = app, pg_temp as $$
  select app.complete_durable_provider_review_step(
    'recruiter-reviewer','review_recruiter','recruiter','recruiter',1,
    target_step,target_lease_token,step_output,actual_input_tokens,
    actual_output_tokens,actual_cost,actual_latency,was_cache_hit,request_id
  )
$$;
create function app.fail_recruiter_reviewer_step(
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language sql security definer set search_path = app, pg_temp as $$
  select app.fail_durable_provider_review_step(
    'recruiter-reviewer','review_recruiter','recruiter',target_step,
    target_lease_token,target_failure_code
  )
$$;
create function app.reap_expired_recruiter_reviewer_step()
returns uuid language sql security definer set search_path = app, pg_temp as $$
  select app.reap_expired_durable_provider_review_step(
    'recruiter-reviewer','review_recruiter','recruiter'
  )
$$;

create function app.claim_hiring_manager_reviewer_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language sql security definer set search_path = app, pg_temp as $$
  select * from app.claim_durable_review_step(
    'hiring-manager-reviewer', 'review_hiring_manager', lease_seconds
  )
$$;
create function app.mark_hiring_manager_reviewer_in_flight(
  target_step uuid, target_lease_token uuid, target_provider text,
  target_model text, reserve_tokens integer, reserve_cost bigint
) returns void language sql security definer set search_path = app, pg_temp as $$
  select app.mark_durable_reviewer_in_flight(
    'hiring-manager-reviewer','review_hiring_manager',target_step,
    target_lease_token,target_provider,target_model,reserve_tokens,reserve_cost
  )
$$;
create function app.complete_hiring_manager_reviewer_step(
  target_step uuid, target_lease_token uuid, step_output jsonb,
  actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint,
  actual_latency integer, was_cache_hit boolean, request_id text default null
) returns uuid language sql security definer set search_path = app, pg_temp as $$
  select app.complete_durable_provider_review_step(
    'hiring-manager-reviewer','review_hiring_manager','hiring_manager',
    'hiring_manager',2,target_step,target_lease_token,step_output,
    actual_input_tokens,actual_output_tokens,actual_cost,actual_latency,
    was_cache_hit,request_id
  )
$$;
create function app.fail_hiring_manager_reviewer_step(
  target_step uuid, target_lease_token uuid, target_failure_code text
) returns void language sql security definer set search_path = app, pg_temp as $$
  select app.fail_durable_provider_review_step(
    'hiring-manager-reviewer','review_hiring_manager','hiring_manager',
    target_step,target_lease_token,target_failure_code
  )
$$;
create function app.reap_expired_hiring_manager_reviewer_step()
returns uuid language sql security definer set search_path = app, pg_temp as $$
  select app.reap_expired_durable_provider_review_step(
    'hiring-manager-reviewer','review_hiring_manager','hiring_manager'
  )
$$;

create function app.claim_factuality_reviewer_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text
) language sql security definer set search_path = app, pg_temp as $$
  select * from app.claim_durable_review_step(
    'factuality-reviewer', 'review_factuality', lease_seconds
  )
$$;

create or replace function app.page_spec_review_gate(
  target_tenant uuid, target_page_spec uuid, target_hash text
) returns boolean language sql stable security definer
set search_path = app, pg_temp as $$
  select target_tenant is not distinct from app.current_tenant_id()
  and app.active_tenant(target_tenant)
  and exists (
    select 1 from app.page_specs page
    join app.review_starts started on started.tenant_id = page.tenant_id
      and started.workflow_run_id = page.workflow_run_id
      and started.page_spec_id = page.id
      and started.page_spec_hash = page.spec_hash
      and started.page_spec_artifact_id = page.source_artifact_id
    join app.artifacts page_artifact on page_artifact.tenant_id = page.tenant_id
      and page_artifact.workflow_run_id = page.workflow_run_id
      and page_artifact.id = page.source_artifact_id
      and page_artifact.kind = 'page_spec' and page_artifact.version = 1
      and page_artifact.body = page.spec
      and encode(public.digest(page_artifact.body::text, 'sha256'), 'hex')
        = started.page_spec_artifact_hash
    where page.tenant_id = target_tenant and page.id = target_page_spec
      and page.spec_hash = target_hash and page.invalidated_at is null
      and not exists (
        select 1 from app.page_specs newer
        where newer.tenant_id = page.tenant_id
          and newer.workflow_run_id = page.workflow_run_id
          and newer.invalidated_at is null and newer.version > page.version
      )
      and (select count(*) from app.reviews review
        where review.tenant_id = page.tenant_id
          and review.page_spec_id = page.id) = 3
      and not exists (
        select 1 from app.reviews review
        left join app.workflow_steps step on step.tenant_id = review.tenant_id
          and step.workflow_run_id = page.workflow_run_id
          and step.id = review.workflow_step_id
        left join app.artifacts artifact on artifact.tenant_id = review.tenant_id
          and artifact.workflow_run_id = page.workflow_run_id
          and artifact.id = review.output_artifact_id
        where review.tenant_id = page.tenant_id
          and review.page_spec_id = page.id and (
            review.workflow_run_id is distinct from page.workflow_run_id
            or review.page_spec_hash is distinct from page.spec_hash
            or step.id is null or step.status <> 'completed'
            or step.output_artifact_id is distinct from artifact.id
            or step.page_spec_id is distinct from page.id
            or step.input_hash is distinct from encode(
              public.digest(step.input::text, 'sha256'), 'hex'
            )
            or not app.durable_review_output_grounded(artifact.body, step.input)
            or artifact.kind <> 'review'
            or artifact.body ->> 'verdict' is distinct from review.verdict
            or artifact.body -> 'issues' is distinct from review.issues
            or artifact.body ->> 'reviewer' is distinct from review.reviewer
            or step.input ->> 'reviewer' is distinct from review.reviewer
            or step.input ->> 'reviewStartId' is distinct from started.id::text
            or step.input ->> 'pageSpecId' is distinct from page.id::text
            or step.input ->> 'pageSpecHash' is distinct from page.spec_hash
            or step.input ->> 'pageSpecArtifactId'
              is distinct from page_artifact.id::text
            or step.input ->> 'pageSpecArtifactHash'
              is distinct from started.page_spec_artifact_hash
            or (review.reviewer = 'recruiter' and (
              step.stage <> 'recruiter-reviewer' or artifact.version <> 1
              or artifact.created_by <> 'recruiter'))
            or (review.reviewer = 'hiring_manager' and (
              step.stage <> 'hiring-manager-reviewer' or artifact.version <> 2
              or artifact.created_by <> 'hiring_manager'))
            or (review.reviewer = 'factuality' and (
              step.stage <> 'factuality-reviewer' or artifact.version <> 3
              or artifact.created_by <> 'fact_checker'
              or artifact.body is distinct from
                app.materialize_factuality_reviewer_output(step.input)))
            or (review.reviewer = 'factuality' and review.verdict <> 'pass')
            or (review.reviewer in ('recruiter','hiring_manager')
              and review.verdict <> 'pass' and (
                jsonb_array_length(review.issues) = 0 or exists (
                  select 1 from jsonb_array_elements(review.issues)
                    with ordinality issue(value, position)
                  where not exists (
                    select 1 from app.review_issue_decisions decision
                    where decision.tenant_id = review.tenant_id
                      and decision.review_id = review.id
                      and decision.issue_index = issue.position - 1
                      and decision.decision = 'keep'
                  )
                )
              ))
          )
      )
  )
$$;

with revoked as (
  update app.publications publication set revoked_at = clock_timestamp()
  where publication.revoked_at is null and not exists (
    select 1 from app.reviews review
    where review.tenant_id = publication.tenant_id
      and review.page_spec_id = publication.page_spec_id
      and review.workflow_step_id is not null
    group by review.tenant_id, review.page_spec_id having count(*) = 3
  )
  returning publication.tenant_id, publication.id
)
update app.share_links link set revoked_at = clock_timestamp()
from revoked where link.tenant_id = revoked.tenant_id
  and link.publication_id = revoked.id and link.revoked_at is null;

revoke all on all tables in schema app from career_reviewer;
revoke usage, select on all sequences in schema app from career_reviewer;
revoke usage on schema app from career_reviewer;

grant select on app.review_starts to career_app;
grant execute on function app.start_page_spec_reviews(uuid, uuid, uuid)
to career_app;

grant usage on schema app to career_recruiter_reviewer,
  career_hiring_manager_reviewer, career_factuality_reviewer;
revoke all on all tables in schema app from career_recruiter_reviewer,
  career_hiring_manager_reviewer, career_factuality_reviewer;
revoke usage, select on all sequences in schema app from career_recruiter_reviewer,
  career_hiring_manager_reviewer, career_factuality_reviewer;
revoke execute on all functions in schema app from career_reviewer,
  career_recruiter_reviewer, career_hiring_manager_reviewer,
  career_factuality_reviewer;

grant execute on function app.claim_recruiter_reviewer_step(integer),
  app.mark_recruiter_reviewer_in_flight(
    uuid, uuid, text, text, integer, bigint
  ),
  app.complete_recruiter_reviewer_step(
    uuid, uuid, jsonb, integer, integer, bigint, integer, boolean, text
  ),
  app.fail_recruiter_reviewer_step(uuid, uuid, text),
  app.reap_expired_recruiter_reviewer_step()
to career_recruiter_reviewer;

grant execute on function app.claim_hiring_manager_reviewer_step(integer),
  app.mark_hiring_manager_reviewer_in_flight(
    uuid, uuid, text, text, integer, bigint
  ),
  app.complete_hiring_manager_reviewer_step(
    uuid, uuid, jsonb, integer, integer, bigint, integer, boolean, text
  ),
  app.fail_hiring_manager_reviewer_step(uuid, uuid, text),
  app.reap_expired_hiring_manager_reviewer_step()
to career_hiring_manager_reviewer;

grant execute on function app.claim_factuality_reviewer_step(integer),
  app.complete_factuality_reviewer_step(uuid, uuid, jsonb),
  app.fail_factuality_reviewer_step(uuid, uuid, text),
  app.reap_expired_factuality_reviewer_step()
to career_factuality_reviewer;

revoke execute on all functions in schema app from public;
revoke execute on all functions in schema auth from public;
revoke usage on schema app, auth from public;
