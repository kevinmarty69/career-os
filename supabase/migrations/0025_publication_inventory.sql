create or replace function app.list_publications(
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
  status text
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
  select p.id, a.id, a.company, a.role,
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
    end
  from app.publications p
  join app.page_specs ps on ps.tenant_id = p.tenant_id
    and ps.id = p.page_spec_id
  join app.workflow_runs wr on wr.tenant_id = ps.tenant_id
    and wr.id = ps.workflow_run_id
  join app.opportunities o on o.tenant_id = wr.tenant_id
    and o.id = wr.opportunity_id
  join app.applications a on a.tenant_id = o.tenant_id
    and a.id = o.application_id
  left join lateral (
    select sl.expires_at, sl.revoked_at
    from app.share_links sl
    where sl.tenant_id = p.tenant_id and sl.publication_id = p.id
    order by (sl.revoked_at is null) desc, sl.expires_at desc, sl.id desc
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
