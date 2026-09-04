create table app.opportunity_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  discovered_job_id uuid not null,
  search_profile_id uuid,
  disposition text not null check (
    disposition in ('saved', 'ignored', 'archived')
  ),
  qualification text not null check (
    qualification in ('priority', 'interesting', 'exploratory', 'ignore')
  ),
  reason text not null check (
    reason in (
      'strong_fit', 'career_direction', 'hard_constraint', 'weak_evidence',
      'compensation', 'location', 'company', 'duplicate', 'closed', 'other'
    )
  ),
  note text check (note is null or char_length(note) <= 500),
  revision bigint not null default 1 check (revision > 0),
  actor text not null default 'human' check (actor = 'human'),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, discovered_job_id),
  foreign key (tenant_id, discovered_job_id)
    references app.discovered_jobs(tenant_id, id) on delete cascade,
  foreign key (search_profile_id)
    references app.search_profiles(id) on delete set null
);

create table app.opportunity_decision_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  decision_id uuid not null,
  discovered_job_id uuid not null,
  search_profile_id uuid,
  disposition text not null check (
    disposition in ('saved', 'ignored', 'archived')
  ),
  qualification text not null check (
    qualification in ('priority', 'interesting', 'exploratory', 'ignore')
  ),
  reason text not null check (
    reason in (
      'strong_fit', 'career_direction', 'hard_constraint', 'weak_evidence',
      'compensation', 'location', 'company', 'duplicate', 'closed', 'other'
    )
  ),
  note text check (note is null or char_length(note) <= 500),
  revision bigint not null check (revision > 0),
  actor text not null default 'human' check (actor = 'human'),
  actor_id uuid not null,
  idempotency_key uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  decision_created_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, decision_id, revision),
  unique (tenant_id, actor_id, idempotency_key),
  foreign key (tenant_id, decision_id)
    references app.opportunity_decisions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, discovered_job_id)
    references app.discovered_jobs(tenant_id, id) on delete cascade,
  foreign key (search_profile_id)
    references app.search_profiles(id) on delete set null
);

create index opportunity_decisions_inbox on app.opportunity_decisions (
  tenant_id, disposition, updated_at desc, id desc
);
create index opportunity_decision_events_feedback on app.opportunity_decision_events (
  tenant_id, search_profile_id, reason, created_at desc, id desc
) where search_profile_id is not null;

alter table app.opportunity_decisions enable row level security;
alter table app.opportunity_decisions force row level security;
create policy opportunity_decision_tenant on app.opportunity_decisions
  using (app.active_tenant(tenant_id));

alter table app.opportunity_decision_events enable row level security;
alter table app.opportunity_decision_events force row level security;
create policy opportunity_decision_event_tenant on app.opportunity_decision_events
  using (app.active_tenant(tenant_id));

grant select on app.opportunity_decisions, app.opportunity_decision_events
  to career_app;

create function app.apply_opportunity_decision(
  target_tenant uuid,
  target_job uuid,
  target_search_profile uuid,
  target_disposition text,
  target_qualification text,
  target_reason text,
  target_note text,
  expected_revision bigint,
  operation_key uuid,
  input_sha256 text
) returns jsonb language plpgsql security definer
set search_path = app, pg_temp as $$
declare
  actor_user_id uuid := app.current_user_id();
  current_decision app.opportunity_decisions%rowtype;
  replay app.opportunity_decision_events%rowtype;
  event_row app.opportunity_decision_events%rowtype;
begin
  if actor_user_id is null or not app.active_tenant(target_tenant)
    or target_job is null or expected_revision < 0 or operation_key is null
    or input_sha256 !~ '^[0-9a-f]{64}$'
    or target_disposition not in ('saved', 'ignored', 'archived')
    or target_qualification not in ('priority', 'interesting', 'exploratory', 'ignore')
    or target_reason not in (
      'strong_fit', 'career_direction', 'hard_constraint', 'weak_evidence',
      'compensation', 'location', 'company', 'duplicate', 'closed', 'other'
    ) or (target_note is not null and char_length(target_note) > 500) then
    raise exception 'opportunity decision rejected';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_tenant::text || ':opportunity-decision:' || target_job::text, 0
  ));

  select * into replay from app.opportunity_decision_events
  where tenant_id = target_tenant and actor_id = actor_user_id
    and idempotency_key = operation_key;
  if found then
    if replay.discovered_job_id <> target_job
      or replay.input_sha256 <> input_sha256 then
      raise exception 'opportunity decision idempotency conflict';
    end if;
    return jsonb_build_object(
      'decisionId', replay.decision_id,
      'opportunityId', replay.discovered_job_id,
      'searchProfileId', replay.search_profile_id,
      'disposition', replay.disposition,
      'qualification', replay.qualification,
      'reason', replay.reason,
      'note', replay.note,
      'revision', replay.revision,
      'actor', replay.actor,
      'actorId', replay.actor_id,
      'createdAt', replay.decision_created_at,
      'updatedAt', replay.created_at
    );
  end if;

  if not exists (
    select 1 from app.discovered_jobs
    where tenant_id = target_tenant and id = target_job
  ) then raise exception 'opportunity decision job not found'; end if;
  if target_search_profile is not null and not exists (
    select 1 from app.search_profiles
    where tenant_id = target_tenant and id = target_search_profile
  ) then raise exception 'opportunity decision search profile not found'; end if;

  select * into current_decision from app.opportunity_decisions
  where tenant_id = target_tenant and discovered_job_id = target_job for update;

  if current_decision.id is null then
    if expected_revision <> 0 then
      raise exception 'opportunity decision revision conflict';
    end if;
    insert into app.opportunity_decisions (
      tenant_id, discovered_job_id, search_profile_id, disposition,
      qualification, reason, note, actor_id
    ) values (
      target_tenant, target_job, target_search_profile, target_disposition,
      target_qualification, target_reason, target_note, actor_user_id
    ) returning * into current_decision;
  else
    if current_decision.revision <> expected_revision then
      raise exception 'opportunity decision revision conflict';
    end if;
    update app.opportunity_decisions set
      search_profile_id = target_search_profile,
      disposition = target_disposition,
      qualification = target_qualification,
      reason = target_reason,
      note = target_note,
      revision = revision + 1,
      actor = 'human',
      actor_id = actor_user_id,
      updated_at = clock_timestamp()
    where tenant_id = target_tenant and id = current_decision.id
    returning * into current_decision;
  end if;

  insert into app.opportunity_decision_events (
    tenant_id, decision_id, discovered_job_id, search_profile_id, disposition,
    qualification, reason, note, revision, actor_id, idempotency_key,
    input_sha256, decision_created_at
  ) values (
    target_tenant, current_decision.id, target_job, target_search_profile,
    target_disposition, target_qualification, target_reason, target_note,
    current_decision.revision, actor_user_id, operation_key, input_sha256,
    current_decision.created_at
  ) returning * into event_row;

  perform app.record_human_audit_event(
    target_tenant,
    'opportunity_decision_recorded',
    'discovered_job',
    target_job,
    jsonb_build_object(
      'disposition', target_disposition,
      'qualification', target_qualification,
      'reason', target_reason,
      'revision', current_decision.revision
    )
  );

  return jsonb_build_object(
    'decisionId', event_row.decision_id,
    'opportunityId', event_row.discovered_job_id,
    'searchProfileId', event_row.search_profile_id,
    'disposition', event_row.disposition,
    'qualification', event_row.qualification,
    'reason', event_row.reason,
    'note', event_row.note,
    'revision', event_row.revision,
    'actor', event_row.actor,
    'actorId', event_row.actor_id,
    'createdAt', event_row.decision_created_at,
    'updatedAt', event_row.created_at
  );
end
$$;

grant execute on function app.apply_opportunity_decision(
  uuid, uuid, uuid, text, text, text, text, bigint, uuid, text
) to career_app;
revoke execute on function app.apply_opportunity_decision(
  uuid, uuid, uuid, text, text, text, text, bigint, uuid, text
) from public;
