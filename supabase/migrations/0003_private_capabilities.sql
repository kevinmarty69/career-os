do $$ begin create role career_reader nologin; exception when duplicate_object then null; end $$;

alter table app.workflow_runs add column profile_id uuid;
alter table app.workflow_runs add foreign key (tenant_id, profile_id)
  references app.profiles(tenant_id, id);

alter table app.publications add column publication_payload jsonb;

create or replace function app.invalidate_dependent_pages() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare affected_tenant uuid := old.tenant_id;
begin
  update publications p set revoked_at = now()
  from page_specs ps, workflow_runs wr
  where p.tenant_id = affected_tenant and p.page_spec_id = ps.id
    and ps.workflow_run_id = wr.id and p.revoked_at is null
    and (tg_table_name <> 'opportunities' or wr.opportunity_id = old.id);
  update page_specs ps set invalidated_at = coalesce(ps.invalidated_at, now())
  from workflow_runs wr
  where ps.tenant_id = affected_tenant and ps.workflow_run_id = wr.id
    and (tg_table_name <> 'opportunities' or wr.opportunity_id = old.id);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create function app.build_publication_payload(target_page_spec uuid)
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
        ))) from sources s where s.sensitivity <> 'restricted'
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
        )) from evidence e join sources s
          on s.tenant_id = e.tenant_id and s.id = e.source_id
          where s.sensitivity <> 'restricted' and 'application' = any(s.allowed_uses)
          and exists (
          select 1 from claim_evidence ce join page_spec_claims psc
            on psc.tenant_id = ce.tenant_id and psc.claim_id = ce.claim_id
          where ce.tenant_id = e.tenant_id and ce.evidence_id = e.id
            and ce.relation = 'supports' and psc.page_spec_id = ps.id
        )
      ), '[]'::jsonb),
      'claims', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id::text, 'statement', c.statement, 'level', c.level::text,
          'evidenceIds', coalesce((select jsonb_agg(ce.evidence_id::text)
            from claim_evidence ce join evidence e
              on e.tenant_id = ce.tenant_id and e.id = ce.evidence_id
            join sources s on s.tenant_id = e.tenant_id and s.id = e.source_id
            where ce.tenant_id = c.tenant_id and ce.claim_id = c.id
              and ce.relation = 'supports' and s.sensitivity <> 'restricted'
              and 'application' = any(s.allowed_uses)), '[]'::jsonb),
          'sensitivity', c.sensitivity::text, 'allowedUses', to_jsonb(c.allowed_uses)
        )) from claims c join page_spec_claims psc
          on psc.tenant_id = c.tenant_id and psc.claim_id = c.id
        where psc.page_spec_id = ps.id and c.sensitivity <> 'restricted'
          and 'application' = any(c.allowed_uses)
      ), '[]'::jsonb)
    )
  ) from page_specs ps
  join workflow_runs wr on wr.tenant_id = ps.tenant_id and wr.id = ps.workflow_run_id
  join profiles pr on pr.tenant_id = wr.tenant_id and pr.id = wr.profile_id
  where ps.id = target_page_spec and ps.invalidated_at is null
$$;

create function app.mint_publication(
  target_page_spec uuid, candidate_hash bytea, expiry timestamptz
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare publication_id uuid := gen_random_uuid(); target_tenant uuid; target_hash text;
  target_payload jsonb;
begin
  if octet_length(candidate_hash) <> 32 or expiry <= now() or expiry > now() + interval '30 days' then
    raise exception 'invalid capability parameters';
  end if;
  select tenant_id, spec_hash into target_tenant, target_hash from page_specs
  where id = target_page_spec and invalidated_at is null;
  if target_tenant is null or target_tenant is distinct from current_tenant_id() then
    raise exception 'publisher tenant mismatch';
  end if;
  select app.build_publication_payload(target_page_spec) into target_payload;
  if target_payload is null then raise exception 'publication payload unavailable'; end if;
  insert into publications (id, tenant_id, page_spec_id, page_spec_hash, publication_payload)
  values (publication_id, target_tenant, target_page_spec, target_hash, target_payload);
  insert into share_links (tenant_id, publication_id, token_hash, expires_at)
  values (target_tenant, publication_id, candidate_hash, expiry);
  return publication_id;
end $$;

create function app.read_shared_publication(target_publication uuid, candidate_hash bytea)
returns jsonb language sql stable security definer set search_path = app, pg_temp as $$
  select p.publication_payload from publications p
  join share_links sl on sl.tenant_id = p.tenant_id and sl.publication_id = p.id
  where p.id = target_publication and p.revoked_at is null
    and p.publication_payload is not null
    and sl.token_hash = candidate_hash and sl.revoked_at is null and sl.expires_at > now()
$$;

create function app.revoke_publication(target_publication uuid) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
declare target_tenant uuid;
begin
  select tenant_id into target_tenant from publications where id = target_publication;
  if target_tenant is null or not owns_tenant(target_tenant) then raise exception 'revocation denied'; end if;
  update publications set revoked_at = now() where id = target_publication and revoked_at is null;
  update share_links set revoked_at = now() where publication_id = target_publication and revoked_at is null;
end $$;

create function app.share_link_revoke_only() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if old.revoked_at is not null or new.revoked_at is null
    or new.tenant_id <> old.tenant_id or new.publication_id <> old.publication_id
    or new.token_hash <> old.token_hash or new.expires_at <> old.expires_at then
    raise exception 'share link can only be revoked once';
  end if;
  return new;
end $$;
create trigger share_link_revoke_only before update on app.share_links
for each row execute function app.share_link_revoke_only();

grant usage on schema app to career_reader;
revoke all on app.publications, app.share_links from career_publisher;
grant execute on function app.mint_publication(uuid, bytea, timestamptz) to career_publisher;
grant execute on function app.read_shared_publication(uuid, bytea) to career_reader;
grant execute on function app.revoke_publication(uuid) to career_app;
revoke execute on function app.mint_publication(uuid, bytea, timestamptz),
  app.read_shared_publication(uuid, bytea),
  app.revoke_publication(uuid), app.build_publication_payload(uuid) from public;
