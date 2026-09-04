create or replace function app.mint_publication(
  target_page_spec uuid, candidate_hash bytea, expiry timestamptz
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare target_publication_id uuid; target_tenant uuid; target_hash text;
  target_payload jsonb; active_hash bytea; target_application uuid;
begin
  if octet_length(candidate_hash) <> 32 or expiry <= now()
    or expiry > now() + interval '30 days' then
    raise exception 'invalid capability parameters';
  end if;
  select spec.tenant_id, spec.spec_hash, opportunity.application_id
    into target_tenant, target_hash, target_application
  from page_specs spec
  join workflow_runs workflow on workflow.tenant_id = spec.tenant_id
    and workflow.id = spec.workflow_run_id
  join opportunities opportunity on opportunity.tenant_id = workflow.tenant_id
    and opportunity.id = workflow.opportunity_id
  where spec.id = target_page_spec and spec.invalidated_at is null
  for update of spec;
  if target_tenant is null or target_tenant is distinct from current_tenant_id() then
    raise exception 'publisher tenant mismatch';
  end if;
  perform 1 from applications
  where tenant_id = target_tenant and id = target_application
    and deleted_at is null
  for update;
  if not found then raise exception 'application unavailable'; end if;

  select id into target_publication_id from publications
  where tenant_id = target_tenant and page_spec_id = target_page_spec
    and revoked_at is null
  for update;
  if target_publication_id is not null then
    select token_hash into active_hash from share_links
    where tenant_id = target_tenant
      and publication_id = target_publication_id
      and revoked_at is null
    for update;
    if active_hash = candidate_hash then return target_publication_id; end if;
    raise exception 'publication already has an active capability';
  end if;
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

  update share_links link set revoked_at = clock_timestamp()
  where link.tenant_id = target_tenant and link.revoked_at is null
    and exists (
      select 1 from publications prior
      join page_specs prior_spec on prior_spec.tenant_id = prior.tenant_id
        and prior_spec.id = prior.page_spec_id
      join workflow_runs prior_run on prior_run.tenant_id = prior_spec.tenant_id
        and prior_run.id = prior_spec.workflow_run_id
      join opportunities prior_opportunity
        on prior_opportunity.tenant_id = prior_run.tenant_id
        and prior_opportunity.id = prior_run.opportunity_id
      where prior.id = link.publication_id
        and prior_opportunity.application_id = target_application
    );
  update publications prior set revoked_at = clock_timestamp()
  from page_specs prior_spec, workflow_runs prior_run,
    opportunities prior_opportunity
  where prior.tenant_id = target_tenant and prior.revoked_at is null
    and prior_spec.tenant_id = prior.tenant_id
    and prior_spec.id = prior.page_spec_id
    and prior_run.tenant_id = prior_spec.tenant_id
    and prior_run.id = prior_spec.workflow_run_id
    and prior_opportunity.tenant_id = prior_run.tenant_id
    and prior_opportunity.id = prior_run.opportunity_id
    and prior_opportunity.application_id = target_application;

  target_publication_id := gen_random_uuid();
  insert into publications (
    id, tenant_id, page_spec_id, page_spec_hash, publication_payload
  ) values (
    target_publication_id, target_tenant, target_page_spec, target_hash,
    target_payload
  );
  insert into share_links (tenant_id, publication_id, token_hash, expires_at)
  values (target_tenant, target_publication_id, candidate_hash, expiry);
  return target_publication_id;
end $$;

drop function app.list_publications(timestamptz, uuid, integer);
create function app.list_publications(
  cursor_published_at timestamptz,
  cursor_publication_id uuid,
  requested_limit integer
) returns table (
  publication_id uuid,
  application_id uuid,
  company text,
  role text,
  published_at text,
  revoked_at timestamptz,
  expires_at timestamptz,
  status text,
  version integer,
  is_current boolean
) language plpgsql stable security definer set search_path = app, pg_temp as $$
declare tenant uuid := app.current_tenant_id();
begin
  if tenant is null or not app.active_tenant(tenant) then
    raise exception 'publication inventory denied';
  end if;
  if (cursor_published_at is null) <> (cursor_publication_id is null)
    or requested_limit not between 1 and 101 then
    raise exception 'invalid publication inventory cursor';
  end if;

  return query
  select p.id, application.id, application.company, application.role,
    to_char(
      p.published_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    p.revoked_at,
    link.expires_at,
    case
      when p.revoked_at is not null or link.revoked_at is not null then 'revoked'
      when link.expires_at is null or link.expires_at <= clock_timestamp() then 'expired'
      else 'active'
    end,
    row_number() over (
      partition by application.id order by p.published_at, p.id
    )::integer,
    p.revoked_at is null and link.revoked_at is null
      and link.expires_at > clock_timestamp()
      and not exists (
        select 1 from app.publications newer
        join app.page_specs newer_spec on newer_spec.tenant_id = newer.tenant_id
          and newer_spec.id = newer.page_spec_id
        join app.workflow_runs newer_run on newer_run.tenant_id = newer_spec.tenant_id
          and newer_run.id = newer_spec.workflow_run_id
        join app.opportunities newer_opportunity
          on newer_opportunity.tenant_id = newer_run.tenant_id
          and newer_opportunity.id = newer_run.opportunity_id
        where newer.tenant_id = p.tenant_id
          and newer_opportunity.application_id = application.id
          and (newer.published_at, newer.id) > (p.published_at, p.id)
      )
  from app.publications p
  join app.page_specs spec on spec.tenant_id = p.tenant_id
    and spec.id = p.page_spec_id
  join app.workflow_runs workflow on workflow.tenant_id = spec.tenant_id
    and workflow.id = spec.workflow_run_id
  join app.opportunities opportunity on opportunity.tenant_id = workflow.tenant_id
    and opportunity.id = workflow.opportunity_id
  join app.applications application on application.tenant_id = opportunity.tenant_id
    and application.id = opportunity.application_id
  left join lateral (
    select share.expires_at, share.revoked_at
    from app.share_links share
    where share.tenant_id = p.tenant_id and share.publication_id = p.id
    order by (share.revoked_at is null) desc, share.expires_at desc, share.id desc
    limit 1
  ) link on true
  where p.tenant_id = tenant and (
    cursor_published_at is null
    or (p.published_at, p.id) < (cursor_published_at, cursor_publication_id)
  )
  order by p.published_at desc, p.id desc
  limit requested_limit;
end
$$;

grant execute on function app.list_publications(timestamptz, uuid, integer)
  to career_app;
revoke execute on function app.list_publications(timestamptz, uuid, integer)
  from public;
revoke execute on function app.mint_publication(uuid, bytea, timestamptz)
  from public;
grant execute on function app.mint_publication(uuid, bytea, timestamptz)
  to career_publisher;
