alter type app.actor_role add value if not exists 'recruiter';

alter table app.workflow_runs
  drop constraint workflow_runs_status_check,
  add constraint workflow_runs_status_check check (status in (
    'running', 'awaiting_approval', 'completed', 'blocked',
    'budget_exhausted', 'cancelled', 'failed'
  )),
  add column source_profile_id uuid,
  add column source_profile_revision bigint check (source_profile_revision >= 0),
  add column idempotency_key uuid,
  add constraint workflow_runs_source_profile_pair check (
    (source_profile_id is null) = (source_profile_revision is null)
  ),
  add foreign key (tenant_id, source_profile_id)
    references app.profiles (tenant_id, id);

create unique index workflow_runs_tenant_idempotency
  on app.workflow_runs (tenant_id, idempotency_key)
  where idempotency_key is not null;

alter table app.artifacts
  drop constraint artifacts_kind_check,
  add constraint artifacts_kind_check check (kind in (
    'research', 'evidence_archive', 'strategy', 'page_spec', 'review',
    'review_issue'
  ));

create function app.reject_snapshot_mutation() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare target_profile uuid;
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'profiles' then
    target_profile := old.id;
  else
    target_profile := old.profile_id;
  end if;
  if exists(
    select 1 from profiles p join workflow_runs wr
      on wr.tenant_id = p.tenant_id and wr.profile_id = p.id
    where p.tenant_id = old.tenant_id and p.id = target_profile
      and p.profile_kind = 'snapshot' and wr.source_profile_id is not null
  ) then
    raise exception 'agent run profile snapshots are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger profile_snapshot_immutable
before update or delete on app.profiles
for each row execute function app.reject_snapshot_mutation();
create trigger source_snapshot_immutable
before update or delete on app.sources
for each row execute function app.reject_snapshot_mutation();
create trigger claim_snapshot_immutable
before update or delete on app.claims
for each row execute function app.reject_snapshot_mutation();
create trigger evidence_snapshot_immutable
before update or delete on app.evidence
for each row execute function app.reject_snapshot_mutation();
create trigger claim_evidence_snapshot_immutable
before update or delete on app.claim_evidence
for each row execute function app.reject_snapshot_mutation();

create or replace function app.invalidate_dependent_pages() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare
  affected_tenant uuid := old.tenant_id;
  affected_profile uuid;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  if tg_table_name = 'profiles' then
    affected_profile := old.id;
  elsif tg_table_name in ('sources', 'claims') then
    affected_profile := old.profile_id;
  elsif tg_table_name = 'evidence' then
    select profile_id into affected_profile from sources
    where tenant_id = old.tenant_id and id = old.source_id;
  end if;

  update page_specs ps set invalidated_at = coalesce(ps.invalidated_at, now())
  from workflow_runs wr
  where ps.tenant_id = affected_tenant and ps.workflow_run_id = wr.id
    and (
      (tg_table_name = 'opportunities' and wr.opportunity_id = old.id)
      or (tg_table_name <> 'opportunities' and affected_profile is not null
        and wr.profile_id = affected_profile)
    );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function app.immutable_gate_row() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception '% rows are immutable', tg_table_name;
end $$;

create or replace function app.mint_publication(
  target_page_spec uuid, candidate_hash bytea, expiry timestamptz
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare target_publication_id uuid; target_tenant uuid; target_hash text;
  target_payload jsonb;
begin
  if octet_length(candidate_hash) <> 32 or expiry <= now()
    or expiry > now() + interval '30 days' then
    raise exception 'invalid capability parameters';
  end if;
  select tenant_id, spec_hash into target_tenant, target_hash from page_specs
  where id = target_page_spec and invalidated_at is null
  for update;
  if target_tenant is null or target_tenant is distinct from current_tenant_id() then
    raise exception 'publisher tenant mismatch';
  end if;

  select id into target_publication_id from publications
  where tenant_id = target_tenant and page_spec_id = target_page_spec
    and revoked_at is null
  for update;
  if target_publication_id is null then
    if exists(
      select 1 from publications
      where tenant_id = target_tenant and page_spec_id = target_page_spec
    ) then
      raise exception 'revoked publication cannot be republished';
    end if;
    select app.build_publication_payload(target_page_spec) into target_payload;
    if target_payload is null then
      raise exception 'publication payload unavailable';
    end if;
    target_publication_id := gen_random_uuid();
    insert into publications (
      id, tenant_id, page_spec_id, page_spec_hash, publication_payload
    ) values (
      target_publication_id, target_tenant, target_page_spec, target_hash,
      target_payload
    );
  end if;
  update share_links set revoked_at = now()
  where tenant_id = target_tenant
    and publication_id = target_publication_id
    and revoked_at is null;
  insert into share_links (tenant_id, publication_id, token_hash, expires_at)
  values (target_tenant, target_publication_id, candidate_hash, expiry);
  return target_publication_id;
end $$;
