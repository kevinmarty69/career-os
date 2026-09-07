-- App-owned profile/membership data is separate from Supabase's managed auth schema.
-- Old credential tables are empty on a new installation. Never discard existing accounts.
do $$ begin
  if exists(select 1 from career_identity.account)
    or exists(select 1 from career_identity.session)
    or exists(select 1 from career_identity.verification) then
    raise exception 'Export legacy authentication data before migrating to Supabase Auth';
  end if;
end $$;

create or replace function app.delete_workspace(target_tenant uuid, expected_confirmation text)
returns void language plpgsql security definer
set search_path = app, career_identity, pg_temp as $$
declare
  actor uuid := app.current_user_id();
begin
  if target_tenant is null or actor is null
    or app.current_tenant_id() is distinct from target_tenant
    or expected_confirmation is distinct from 'DELETE ' || target_tenant::text then
    raise exception 'workspace deletion denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant::text, 0));
  if not exists(select 1 from career_identity.member
    where "organizationId" = target_tenant and "userId" = actor and role = 'owner') then
    raise exception 'workspace deletion denied';
  end if;
  perform set_config('app.workspace_deletion_tenant', target_tenant::text, true);
  delete from app.tenants where id = target_tenant;
  delete from career_identity.organization where id = target_tenant;
  if not found then raise exception 'workspace deletion denied'; end if;
end $$;

drop table career_identity.account, career_identity.session, career_identity.verification;

-- No fallback to a claimed owner ID: membership is the authority, not a cookie or metadata.
create or replace function app.owns_tenant(candidate uuid) returns boolean
language sql stable security definer set search_path = app, career_identity, pg_temp as $$
  select exists(select 1 from career_identity.member
    where "organizationId" = candidate and "userId" = app.current_user_id())
$$;
create or replace function app.can_create_tenant(candidate uuid, candidate_owner uuid) returns boolean
language sql stable security definer set search_path = app, career_identity, pg_temp as $$
  select candidate_owner = app.current_user_id() and exists(
    select 1 from career_identity.member where "organizationId" = candidate
      and "userId" = candidate_owner and role = 'owner')
$$;

create function career_identity.active_session(actor uuid, session_id uuid)
returns table(created_at timestamptz)
language sql stable security definer set search_path = pg_catalog as $$
  select s.created_at from auth.sessions s
  where s.id = session_id and s.user_id = actor
    and (s.not_after is null or s.not_after > now())
$$;
create function career_identity.user_sessions(actor uuid)
returns table(id uuid, created_at timestamptz, updated_at timestamptz, user_agent text)
language sql stable security definer set search_path = pg_catalog as $$
  select s.id, s.created_at, coalesce(s.refreshed_at, s.updated_at, s.created_at), s.user_agent
  from auth.sessions s where s.user_id = actor
    and (s.not_after is null or s.not_after > now()) order by s.created_at desc
$$;

-- The backend authenticates the request before invoking these helpers.
-- Never expose them to anon/authenticated, PostgREST, or agent workers.
revoke all on all functions in schema career_identity from public;
revoke all on schema career_identity from public, anon, authenticated;
revoke all on all tables in schema career_identity from public, anon, authenticated;
revoke all on all functions in schema career_identity from anon, authenticated;
revoke all on schema app from anon, authenticated;
revoke all on all tables in schema app from anon, authenticated;
revoke all on all functions in schema app from anon, authenticated;
