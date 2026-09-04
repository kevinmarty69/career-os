create table app.publication_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  publication_id uuid not null,
  event_type text not null check (
    event_type in ('open', 'section', 'action', 'download')
  ),
  event_key text check (
    (event_type = 'open' and event_key is null)
    or (event_type <> 'open' and char_length(event_key) between 1 and 120)
  ),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, publication_id)
    references app.publications(tenant_id, id) on delete cascade
);

create index publication_events_publication_time
  on app.publication_events (tenant_id, publication_id, occurred_at desc);

alter table app.publication_events enable row level security;
alter table app.publication_events force row level security;
create policy publication_event_tenant on app.publication_events
  for select using (app.active_tenant(tenant_id));
grant select on app.publication_events to career_app;

create function app.reject_publication_event_mutation() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  raise exception 'publication events are immutable';
end
$$;
create trigger publication_event_immutable
before update or delete on app.publication_events
for each row execute function app.reject_publication_event_mutation();

create function app.record_shared_publication_event(
  target_publication uuid,
  candidate_hash bytea,
  tracked_type text,
  tracked_key text
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare target_tenant uuid;
begin
  if octet_length(candidate_hash) <> 32
    or tracked_type not in ('open', 'section', 'action', 'download')
    or (tracked_type = 'open' and tracked_key is not null)
    or (
      tracked_type <> 'open'
      and (tracked_key is null or char_length(tracked_key) not between 1 and 120)
    )
  then raise exception 'invalid publication event'; end if;

  select publication.tenant_id into target_tenant
  from publications publication
  join share_links link on link.tenant_id = publication.tenant_id
    and link.publication_id = publication.id
  where publication.id = target_publication
    and publication.revoked_at is null
    and link.token_hash = candidate_hash
    and link.revoked_at is null
    and link.expires_at > clock_timestamp();
  if target_tenant is null then raise exception 'publication unavailable'; end if;

  insert into publication_events (
    tenant_id, publication_id, event_type, event_key
  ) values (
    target_tenant, target_publication, tracked_type, tracked_key
  );
end
$$;

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
  is_current boolean,
  first_opened_at text,
  last_opened_at text,
  opens integer,
  sections integer,
  actions integer,
  downloads integer
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
  select publication.id, application.id, application.company, application.role,
    to_char(
      publication.published_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    publication.revoked_at,
    link.expires_at,
    case
      when publication.revoked_at is not null or link.revoked_at is not null
        then 'revoked'
      when link.expires_at is null or link.expires_at <= clock_timestamp()
        then 'expired'
      else 'active'
    end,
    row_number() over (
      partition by application.id
      order by publication.published_at, publication.id
    )::integer,
    publication.revoked_at is null and link.revoked_at is null
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
        where newer.tenant_id = publication.tenant_id
          and newer_opportunity.application_id = application.id
          and (newer.published_at, newer.id) >
            (publication.published_at, publication.id)
      ),
    analytics.first_opened_at,
    analytics.last_opened_at,
    analytics.opens,
    analytics.sections,
    analytics.actions,
    analytics.downloads
  from app.publications publication
  join app.page_specs spec on spec.tenant_id = publication.tenant_id
    and spec.id = publication.page_spec_id
  join app.workflow_runs workflow on workflow.tenant_id = spec.tenant_id
    and workflow.id = spec.workflow_run_id
  join app.opportunities opportunity on opportunity.tenant_id = workflow.tenant_id
    and opportunity.id = workflow.opportunity_id
  join app.applications application on application.tenant_id = opportunity.tenant_id
    and application.id = opportunity.application_id
  left join lateral (
    select share.expires_at, share.revoked_at
    from app.share_links share
    where share.tenant_id = publication.tenant_id
      and share.publication_id = publication.id
    order by (share.revoked_at is null) desc,
      share.expires_at desc, share.id desc
    limit 1
  ) link on true
  cross join lateral (
    select
      to_char(
        min(event.occurred_at) filter (where event.event_type = 'open')
          at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) first_opened_at,
      to_char(
        max(event.occurred_at) filter (where event.event_type = 'open')
          at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) last_opened_at,
      count(*) filter (where event.event_type = 'open')::integer opens,
      count(*) filter (where event.event_type = 'section')::integer sections,
      count(*) filter (where event.event_type = 'action')::integer actions,
      count(*) filter (where event.event_type = 'download')::integer downloads
    from app.publication_events event
    where event.tenant_id = publication.tenant_id
      and event.publication_id = publication.id
  ) analytics
  where publication.tenant_id = tenant and (
    cursor_published_at is null
    or (publication.published_at, publication.id) <
      (cursor_published_at, cursor_publication_id)
  )
  order by publication.published_at desc, publication.id desc
  limit requested_limit;
end
$$;

grant execute on function app.record_shared_publication_event(
  uuid, bytea, text, text
) to career_reader;
revoke execute on function app.record_shared_publication_event(
  uuid, bytea, text, text
) from public;
grant execute on function app.list_publications(timestamptz, uuid, integer)
  to career_app;
revoke execute on function app.list_publications(timestamptz, uuid, integer),
  app.reject_publication_event_mutation()
from public;
