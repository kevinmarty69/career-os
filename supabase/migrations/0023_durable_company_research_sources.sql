create or replace function app.valid_application_company_sources(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'array'
    and jsonb_array_length(candidate) <= 3
    and (select count(*) = count(distinct item ->> 'url')
      from jsonb_array_elements(candidate) item)
    and not exists (
      select 1 from jsonb_array_elements(candidate) item
      where jsonb_typeof(item) <> 'object'
        or not item ?& array['url', 'origin']
        or exists (
          select 1 from jsonb_object_keys(item) key
          where key <> all(array['url', 'origin'])
        )
        or jsonb_typeof(item -> 'url') <> 'string'
        or length(item ->> 'url') not between 1 and 2048
        or item ->> 'url' !~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'
        or item ->> 'origin' not in ('job-jsonld', 'api')
    )
$$;

alter table app.applications
  add column company_sources jsonb not null default '[]'::jsonb,
  add constraint application_company_sources_valid
    check (app.valid_application_company_sources(company_sources));

alter table app.opportunities
  add column company_sources jsonb not null default '[]'::jsonb,
  add constraint opportunity_company_sources_valid
    check (app.valid_application_company_sources(company_sources));

alter table app.artifacts
  drop constraint artifacts_kind_check,
  add constraint artifacts_kind_check check (
    kind in (
      'research', 'research_sources', 'evidence_archive', 'strategy',
      'page_spec', 'review', 'review_issue'
    )
  );

alter table app.workflow_steps
  add column research_source_artifact_id uuid,
  add foreign key (tenant_id, research_source_artifact_id)
    references app.artifacts (tenant_id, id);

create or replace function app.valid_company_researcher_input(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array['schemaVersion', 'company', 'role', 'description', 'source']
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
    and case candidate -> 'schemaVersion'
      when '1'::jsonb then not exists (
        select 1 from jsonb_object_keys(candidate) key
        where key <> all(array['schemaVersion', 'company', 'role', 'description', 'source'])
      )
      when '2'::jsonb then
        candidate ? 'companySources'
        and not exists (
          select 1 from jsonb_object_keys(candidate) key
          where key <> all(array[
            'schemaVersion', 'company', 'role', 'description', 'source',
            'companySources'
          ])
        )
        and app.valid_application_company_sources(candidate -> 'companySources')
      else false
    end
$$;

create function app.valid_company_research_source_snapshot(
  candidate jsonb, step_input jsonb
) returns boolean language sql immutable set search_path = pg_catalog as $$
  with all_documents as (
    select item, ordinal
    from jsonb_array_elements(case
      when jsonb_typeof(candidate -> 'documents') = 'array'
        then candidate -> 'documents'
      else '[]'::jsonb
    end) with ordinality
      document(item, ordinal)
  ), company_documents as (
    select item, ordinal from all_documents
    where item ->> 'kind' = 'company-web'
  ), failed_sources as (
    select item from jsonb_array_elements(case
      when jsonb_typeof(candidate -> 'failures') = 'array'
        then candidate -> 'failures'
      else '[]'::jsonb
    end) item
  ), requested_sources as (
    select item, ordinal
    from jsonb_array_elements(coalesce(step_input -> 'companySources', '[]'::jsonb))
      with ordinality source(item, ordinal)
  )
  select jsonb_typeof(candidate) = 'object'
    and candidate ?& array[
      'schemaVersion', 'purpose', 'company', 'role', 'coverage', 'documents',
      'failures'
    ]
    and not exists (
      select 1 from jsonb_object_keys(candidate) key
      where key <> all(array[
        'schemaVersion', 'purpose', 'company', 'role', 'coverage', 'documents',
        'failures'
      ])
    )
    and candidate -> 'schemaVersion' = '1'::jsonb
    and candidate ->> 'purpose' = 'company-research-sources'
    and candidate ->> 'company' = step_input ->> 'company'
    and candidate ->> 'role' = step_input ->> 'role'
    and candidate ->> 'coverage' in ('job-only', 'company-sourced')
    and jsonb_typeof(candidate -> 'documents') = 'array'
    and jsonb_array_length(candidate -> 'documents') between 1 and 4
    and jsonb_typeof(candidate -> 'failures') = 'array'
    and jsonb_array_length(candidate -> 'failures') <= 3
    and (select count(*) from all_documents
      where item ->> 'kind' = 'job') = 1
    and exists (
      select 1 from all_documents
      where item = jsonb_build_object(
        'sourceId', 'job-posting',
        'kind', 'job',
        'origin', 'application-snapshot',
        'contentHash', encode(public.digest(step_input ->> 'description', 'sha256'), 'hex'),
        'text', step_input ->> 'description'
      )
    )
    and not exists (
      select 1 from all_documents
      where jsonb_typeof(item) <> 'object'
        or item ->> 'kind' not in ('job', 'company-web')
        or (item ->> 'kind' = 'company-web' and (
          not item ?& array[
            'sourceId', 'kind', 'origin', 'requestedUrl', 'finalUrl', 'fetchedAt',
            'contentType', 'bytes', 'contentHash', 'text'
          ]
          or exists (
            select 1 from jsonb_object_keys(item) key
            where key <> all(array[
              'sourceId', 'kind', 'origin', 'requestedUrl', 'finalUrl', 'fetchedAt',
              'contentType', 'bytes', 'contentHash', 'text'
            ])
          )
          or item ->> 'sourceId' !~ '^company-[1-3]$'
          or item ->> 'origin' not in ('job-jsonld', 'api')
          or item ->> 'requestedUrl' !~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'
          or item ->> 'finalUrl' !~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'
          or jsonb_typeof(item -> 'fetchedAt') <> 'string'
          or item ->> 'contentType' not in ('text/html', 'text/plain')
          or not case when jsonb_typeof(item -> 'bytes') = 'number'
            then (item ->> 'bytes')::numeric between 1 and 1048576
            else false end
          or jsonb_typeof(item -> 'text') <> 'string'
          or length(item ->> 'text') not between 1 and 20000
          or item ->> 'contentHash' !~ '^[0-9a-f]{64}$'
          or item ->> 'contentHash' <> encode(
            public.digest(item ->> 'text', 'sha256'), 'hex'
          )
        ))
    )
    and not exists (
      select 1 from failed_sources failure
      where jsonb_typeof(failure.item) <> 'object'
        or not failure.item ?& array['sourceId', 'origin', 'requestedUrl', 'code']
        or exists (
          select 1 from jsonb_object_keys(failure.item) key
          where key <> all(array['sourceId', 'origin', 'requestedUrl', 'code'])
        )
        or failure.item ->> 'sourceId' !~ '^company-[1-3]$'
        or failure.item ->> 'origin' not in ('job-jsonld', 'api')
        or failure.item ->> 'requestedUrl' !~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'
        or failure.item ->> 'code' not in (
          'blocked', 'timeout', 'too-large', 'unsupported', 'unavailable',
          'unusable-content'
        )
    )
    and (select count(*) = count(distinct item ->> 'sourceId')
      from all_documents)
    and (select count(*) = count(distinct item ->> 'sourceId')
      from failed_sources)
    and not exists (
      select 1 from company_documents document
      join failed_sources failure
        on failure.item ->> 'sourceId' = document.item ->> 'sourceId'
    )
    and (select count(*) from company_documents)
      + (select count(*) from failed_sources)
      = (select count(*) from requested_sources)
    and not exists (
      select 1 from requested_sources requested
      where not exists (
        select 1 from company_documents document
        where document.item ->> 'sourceId' = 'company-' || requested.ordinal::text
          and document.item ->> 'requestedUrl' = requested.item ->> 'url'
          and document.item ->> 'origin' = requested.item ->> 'origin'
      ) and not exists (
        select 1 from failed_sources failure
        where failure.item ->> 'sourceId' = 'company-' || requested.ordinal::text
          and failure.item ->> 'requestedUrl' = requested.item ->> 'url'
          and failure.item ->> 'origin' = requested.item ->> 'origin'
      )
    )
    and ((candidate ->> 'coverage' = 'job-only'
        and (select count(*) from company_documents) = 0)
      or (candidate ->> 'coverage' = 'company-sourced'
        and (select count(*) from company_documents) > 0))
$$;

create function app.prepare_company_researcher_sources(
  target_step uuid, target_lease_token uuid, source_snapshot jsonb
) returns table (artifact_id uuid, artifact_hash text)
language plpgsql security definer set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  stored app.artifacts%rowtype;
begin
  if target_step is null or target_lease_token is null then
    raise exception 'invalid company research source preparation';
  end if;
  select * into step from app.workflow_steps where id = target_step for update;
  if not found or step.stage <> 'company-researcher' or step.status <> 'leased'
    or step.lease_owner is distinct from target_lease_token::text
    or step.lease_expires_at <= clock_timestamp() or step.dispatched_at is not null
    or not app.valid_company_research_source_snapshot(source_snapshot, step.input) then
    raise exception 'company research source preparation rejected';
  end if;

  if step.research_source_artifact_id is not null then
    select * into stored from app.artifacts
    where tenant_id = step.tenant_id and workflow_run_id = step.workflow_run_id
      and id = step.research_source_artifact_id and kind = 'research_sources'
      and version = 1 and schema_version = 1;
    if not found or stored.body is distinct from source_snapshot then
      raise exception 'company research source preparation conflict';
    end if;
  else
    insert into app.artifacts (
      tenant_id, workflow_run_id, kind, version, schema_version, body, created_by
    ) values (
      step.tenant_id, step.workflow_run_id, 'research_sources', 1, 1,
      source_snapshot, 'company_researcher'
    ) returning * into stored;
    update app.workflow_steps
    set research_source_artifact_id = stored.id
    where id = step.id;
  end if;

  artifact_id := stored.id;
  artifact_hash := encode(public.digest(stored.body::text, 'sha256'), 'hex');
  return next;
end
$$;

drop function app.claim_company_researcher_step(integer);
create function app.claim_company_researcher_step(lease_seconds integer)
returns table (
  step_id uuid, workflow_run_id uuid, attempt integer, lease_token uuid,
  input jsonb, input_hash text, source_artifact_id uuid,
  source_artifact_hash text, source_artifact jsonb
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
  where ws.stage = 'company-researcher' and ws.dispatched_at is null
    and (ws.status = 'pending' or (
      ws.status = 'leased' and ws.lease_expires_at <= clock_timestamp()
    ))
    and wr.status = 'running' and wr.deadline_at > clock_timestamp()
  order by ws.created_at, ws.id
  for update of ws skip locked limit 1;
  if not found then return; end if;

  update app.workflow_steps ws set status = 'leased',
    attempt = case when candidate.status = 'pending'
      then candidate.attempt else candidate.attempt + 1 end,
    lease_owner = generated_lease_token::text,
    lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds),
    failure_code = null
  where ws.id = candidate.id
  returning ws.id, ws.workflow_run_id, ws.attempt, generated_lease_token,
    ws.input, ws.input_hash, ws.research_source_artifact_id
  into step_id, workflow_run_id, attempt, lease_token, input, input_hash,
    source_artifact_id;

  if source_artifact_id is not null then
    select artifact.body,
      encode(public.digest(artifact.body::text, 'sha256'), 'hex')
    into source_artifact, source_artifact_hash
    from app.artifacts artifact
    where artifact.tenant_id = candidate.tenant_id
      and artifact.workflow_run_id = candidate.workflow_run_id
      and artifact.id = source_artifact_id and artifact.kind = 'research_sources'
      and artifact.version = 1 and artifact.schema_version = 1;
    if not found then raise exception 'company research source artifact missing'; end if;
  end if;
  return next;
end
$$;

create function app.require_company_research_sources_before_dispatch()
returns trigger language plpgsql set search_path = app, pg_temp as $$
declare source_body jsonb;
begin
  if old.stage = 'company-researcher' and old.status = 'leased'
    and new.status = 'in_flight' and new.input -> 'schemaVersion' = '2'::jsonb then
    select body into source_body from app.artifacts
    where tenant_id = new.tenant_id and workflow_run_id = new.workflow_run_id
      and id = new.research_source_artifact_id and kind = 'research_sources'
      and version = 1 and schema_version = 1;
    if not found
      or not app.valid_company_research_source_snapshot(source_body, new.input) then
      raise exception 'company researcher dispatch requires durable sources';
    end if;
  end if;
  return new;
end
$$;

create trigger company_research_sources_before_dispatch
before update on app.workflow_steps
for each row execute function app.require_company_research_sources_before_dispatch();

create or replace function app.valid_company_researcher_output(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(candidate) = 'object'
    and jsonb_typeof(candidate -> 'company') = 'string'
    and length(candidate ->> 'company') between 1 and 200
    and jsonb_typeof(candidate -> 'role') = 'string'
    and length(candidate ->> 'role') between 1 and 200
    and jsonb_typeof(candidate -> 'signals') = 'array'
    and jsonb_array_length(candidate -> 'signals') between 1 and 20
    and case
      when not candidate ? 'schemaVersion' then
        candidate ?& array['company', 'role', 'signals', 'source']
        and not exists (
          select 1 from jsonb_object_keys(candidate) key
          where key <> all(array['company', 'role', 'signals', 'source'])
        )
        and not exists (
          select 1 from jsonb_array_elements(candidate -> 'signals') item
          where jsonb_typeof(item) <> 'object'
            or not item ?& array['statement', 'excerpt', 'category', 'priority']
            or exists (
              select 1 from jsonb_object_keys(item) key
              where key <> all(array['statement', 'excerpt', 'category', 'priority'])
            )
        )
      when candidate -> 'schemaVersion' = '2'::jsonb then
        candidate ?& array[
          'schemaVersion', 'company', 'role', 'sourceArtifactId',
          'sourceArtifactHash', 'coverage', 'sources', 'signals'
        ]
        and not exists (
          select 1 from jsonb_object_keys(candidate) key
          where key <> all(array[
            'schemaVersion', 'company', 'role', 'sourceArtifactId',
            'sourceArtifactHash', 'coverage', 'sources', 'signals'
          ])
        )
        and candidate ->> 'sourceArtifactId' ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and candidate ->> 'sourceArtifactHash' ~ '^[0-9a-f]{64}$'
        and candidate ->> 'coverage' in ('job-only', 'company-sourced')
        and jsonb_typeof(candidate -> 'sources') = 'array'
        and jsonb_array_length(candidate -> 'sources') between 1 and 4
        and not exists (
          select 1 from jsonb_array_elements(candidate -> 'signals') item
          where jsonb_typeof(item) <> 'object'
            or not item ?& array[
              'statement', 'excerpt', 'sourceId', 'category', 'priority'
            ]
            or exists (
              select 1 from jsonb_object_keys(item) key
              where key <> all(array[
                'statement', 'excerpt', 'sourceId', 'category', 'priority'
              ])
            )
            or jsonb_typeof(item -> 'sourceId') <> 'string'
            or length(item ->> 'sourceId') not between 1 and 200
        )
      else false
    end
    and not exists (
      select 1 from jsonb_array_elements(candidate -> 'signals') item
      where jsonb_typeof(item -> 'statement') <> 'string'
        or length(item ->> 'statement') not between 1 and 500
        or jsonb_typeof(item -> 'excerpt') <> 'string'
        or length(item ->> 'excerpt') not between 1 and 1000
        or item ->> 'category' not in (
          'responsibility', 'requirement', 'culture', 'constraint'
        )
        or item ->> 'priority' not in ('high', 'medium', 'low')
    )
$$;

create function app.valid_company_researcher_completion(
  target_step uuid, candidate jsonb
) returns boolean language plpgsql stable security definer
set search_path = app, pg_temp as $$
declare
  step app.workflow_steps%rowtype;
  sources app.artifacts%rowtype;
  expected_sources jsonb;
begin
  select * into step from app.workflow_steps where id = target_step;
  if not found or not app.valid_company_researcher_output(candidate)
    or candidate ->> 'company' is distinct from step.input ->> 'company'
    or candidate ->> 'role' is distinct from step.input ->> 'role' then
    return false;
  end if;
  if not candidate ? 'schemaVersion' then
    return candidate -> 'source' is not distinct from step.input -> 'source'
      and not exists (
        select 1 from jsonb_array_elements(candidate -> 'signals') signal
        where strpos(step.input ->> 'description', signal ->> 'excerpt') = 0
      );
  end if;

  select * into sources from app.artifacts
  where tenant_id = step.tenant_id and workflow_run_id = step.workflow_run_id
    and id = step.research_source_artifact_id and kind = 'research_sources'
    and version = 1 and schema_version = 1;
  if not found
    or candidate ->> 'sourceArtifactId' is distinct from sources.id::text
    or candidate ->> 'sourceArtifactHash' is distinct from
      encode(public.digest(sources.body::text, 'sha256'), 'hex')
    or candidate ->> 'coverage' is distinct from sources.body ->> 'coverage' then
    return false;
  end if;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sourceId', document ->> 'sourceId',
    'kind', document ->> 'kind',
    'origin', document ->> 'origin',
    'finalUrl', document ->> 'finalUrl',
    'fetchedAt', document ->> 'fetchedAt',
    'contentHash', document ->> 'contentHash'
  )) order by ordinal)
  into expected_sources
  from jsonb_array_elements(sources.body -> 'documents') with ordinality
    item(document, ordinal);
  if candidate -> 'sources' is distinct from expected_sources then return false; end if;

  return not exists (
    select 1 from jsonb_array_elements(candidate -> 'signals') signal
    where not exists (
      select 1 from jsonb_array_elements(sources.body -> 'documents') document
      where document ->> 'sourceId' = signal ->> 'sourceId'
        and strpos(document ->> 'text', signal ->> 'excerpt') > 0
    )
  );
end
$$;

create or replace function app.complete_company_researcher_step(
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
  if not found or not app.valid_company_researcher_completion(target_step, step_output) then
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
    artifact_id, step.tenant_id, step.workflow_run_id, 'research', 1,
    case when step_output -> 'schemaVersion' = '2'::jsonb then 2 else 1 end,
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
    jsonb_build_object(
      'artifactId', artifact_id,
      'sourceArtifactId', step.research_source_artifact_id,
      'costMicros', actual_cost
    )
  );
  return artifact_id;
end
$$;

revoke execute on function
  app.valid_application_company_sources(jsonb),
  app.valid_company_research_source_snapshot(jsonb, jsonb),
  app.prepare_company_researcher_sources(uuid, uuid, jsonb),
  app.require_company_research_sources_before_dispatch(),
  app.valid_company_researcher_completion(uuid, jsonb)
from public, career_app, career_reader, career_publisher, career_worker,
  career_reviewer, career_evidence_archivist, career_recruiter_strategist,
  career_page_composer, career_recruiter_reviewer,
  career_hiring_manager_reviewer, career_factuality_reviewer;

grant execute on function
  app.prepare_company_researcher_sources(uuid, uuid, jsonb)
to career_company_researcher;

grant execute on function app.valid_application_company_sources(jsonb)
to career_app;

grant execute on function app.claim_company_researcher_step(integer)
to career_company_researcher;

revoke execute on function
  app.claim_company_researcher_step(integer),
  app.prepare_company_researcher_sources(uuid, uuid, jsonb)
from public;
