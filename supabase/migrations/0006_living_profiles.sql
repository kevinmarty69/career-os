alter table app.profiles
  add column profile_kind text not null default 'snapshot'
    check (profile_kind in ('living', 'snapshot')),
  add column revision bigint not null default 0 check (revision >= 0),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create unique index one_living_profile_per_tenant
  on app.profiles (tenant_id) where profile_kind = 'living';

alter table app.sources
  add column profile_id uuid,
  add column position integer not null default 0 check (position >= 0),
  add foreign key (tenant_id, profile_id)
    references app.profiles (tenant_id, id) on delete cascade;

alter table app.claims
  add column profile_id uuid,
  add column position integer not null default 0 check (position >= 0),
  add foreign key (tenant_id, profile_id)
    references app.profiles (tenant_id, id) on delete cascade;

alter table app.evidence
  add column profile_id uuid,
  add column position integer not null default 0 check (position >= 0),
  add foreign key (tenant_id, profile_id)
    references app.profiles (tenant_id, id) on delete cascade;

alter table app.sources add unique (tenant_id, id, profile_id);
alter table app.claims add unique (tenant_id, id, profile_id);
alter table app.evidence add unique (tenant_id, id, profile_id);
alter table app.evidence add foreign key (tenant_id, source_id, profile_id)
  references app.sources (tenant_id, id, profile_id) on delete cascade;

alter table app.claim_evidence
  add column profile_id uuid,
  add column position integer not null default 0 check (position >= 0),
  add foreign key (tenant_id, claim_id, profile_id)
    references app.claims (tenant_id, id, profile_id) on delete cascade,
  add foreign key (tenant_id, evidence_id, profile_id)
    references app.evidence (tenant_id, id, profile_id) on delete cascade;

create index sources_profile on app.sources (tenant_id, profile_id, position);
create index claims_profile on app.claims (tenant_id, profile_id, position);
create index evidence_source_position on app.evidence (tenant_id, source_id, position);

create or replace function app.active_tenant(candidate uuid) returns boolean
language sql stable security definer set search_path = app, auth, pg_temp as $$
  select candidate = app.current_tenant_id() and app.owns_tenant(candidate)
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','sources','claims','evidence','claim_evidence','opportunities',
    'workflow_runs','workflow_events','artifacts','page_specs','page_spec_claims',
    'reviews','approvals','publications','share_links','model_usage'
  ] loop
    execute format('drop policy tenant_isolation on app.%I', table_name);
    execute format(
      'create policy tenant_isolation on app.%I using (app.active_tenant(tenant_id)) with check (app.active_tenant(tenant_id))',
      table_name
    );
  end loop;
end $$;

drop policy workflow_step_tenant on app.workflow_steps;
create policy workflow_step_tenant on app.workflow_steps
  using (app.active_tenant(tenant_id)) with check (app.active_tenant(tenant_id));

drop policy tenant_access on app.tenants;
create policy tenant_access on app.tenants
  using (app.active_tenant(id))
  with check (app.active_tenant(id) or app.can_create_tenant(id, owner_id));

grant execute on function app.active_tenant(uuid) to career_app, career_worker,
  career_reviewer, career_publisher;
revoke execute on function app.active_tenant(uuid) from public;

create or replace function app.invalidate_dependent_pages() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare
  affected_tenant uuid := old.tenant_id;
  affected_profile uuid;
begin
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

create or replace function app.build_publication_payload(target_page_spec uuid)
returns jsonb language sql stable security definer set search_path = app, pg_temp as $$
  select jsonb_build_object(
    'spec', ps.spec,
    'profile', jsonb_build_object(
      'name', pr.name,
      'headline', pr.headline,
      'sources', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', s.id::text, 'kind', s.kind, 'title', s.title, 'locator', s.locator,
          'sensitivity', s.sensitivity::text, 'allowedUses', to_jsonb(s.allowed_uses),
          'trust', s.trust
        )) order by s.position, s.id) from sources s
        where s.profile_id = pr.id and s.sensitivity <> 'restricted'
          and 'application' = any(s.allowed_uses) and exists (
          select 1 from evidence e join claim_evidence ce
            on ce.tenant_id = e.tenant_id and ce.evidence_id = e.id and ce.relation = 'supports'
          join page_spec_claims psc on psc.tenant_id = ce.tenant_id and psc.claim_id = ce.claim_id
          where e.tenant_id = s.tenant_id and e.source_id = s.id and psc.page_spec_id = ps.id
        )
      ), '[]'::jsonb),
      'evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id::text, 'sourceId', e.source_id::text,
          'label', e.label, 'excerpt', e.excerpt
        ) order by e.position, e.id) from evidence e join sources s
          on s.tenant_id = e.tenant_id and s.id = e.source_id
          where e.profile_id = pr.id and s.sensitivity <> 'restricted'
            and 'application' = any(s.allowed_uses) and exists (
          select 1 from claim_evidence ce join page_spec_claims psc
            on psc.tenant_id = ce.tenant_id and psc.claim_id = ce.claim_id
          where ce.tenant_id = e.tenant_id and ce.evidence_id = e.id
            and ce.relation = 'supports' and psc.page_spec_id = ps.id
        )
      ), '[]'::jsonb),
      'claims', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id::text, 'statement', c.statement, 'level', c.level::text,
          'evidenceIds', coalesce((select jsonb_agg(ce.evidence_id::text order by ce.position, ce.evidence_id)
            from claim_evidence ce join evidence e
              on e.tenant_id = ce.tenant_id and e.id = ce.evidence_id
            join sources s on s.tenant_id = e.tenant_id and s.id = e.source_id
            where ce.tenant_id = c.tenant_id and ce.claim_id = c.id
              and ce.relation = 'supports' and s.sensitivity <> 'restricted'
              and 'application' = any(s.allowed_uses)), '[]'::jsonb),
          'sensitivity', c.sensitivity::text, 'allowedUses', to_jsonb(c.allowed_uses)
        ) order by c.position, c.id) from claims c join page_spec_claims psc
          on psc.tenant_id = c.tenant_id and psc.claim_id = c.id
        where psc.page_spec_id = ps.id and c.profile_id = pr.id
          and c.sensitivity <> 'restricted' and 'application' = any(c.allowed_uses)
      ), '[]'::jsonb)
    )
  ) from page_specs ps
  join workflow_runs wr on wr.tenant_id = ps.tenant_id and wr.id = ps.workflow_run_id
  join profiles pr on pr.tenant_id = wr.tenant_id and pr.id = wr.profile_id
  where ps.id = target_page_spec and ps.invalidated_at is null
$$;
