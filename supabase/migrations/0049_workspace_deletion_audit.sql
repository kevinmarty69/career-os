create or replace function app.reject_audit_event_mutation() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if tg_op = 'DELETE'
    and current_setting('app.workspace_deletion_tenant', true) = old.tenant_id::text then
    return old;
  end if;
  raise exception 'audit events are immutable';
end
$$;
create or replace function app.delete_workspace(
  target_tenant uuid,
  expected_confirmation text
) returns void language plpgsql security definer
set search_path = app, auth, pg_temp as $$
declare
  actor uuid := app.current_user_id();
  active_tenant uuid := app.current_tenant_id();
  member_role text;
begin
  if target_tenant is null or actor is null or active_tenant <> target_tenant
    or expected_confirmation is null
    or expected_confirmation <> 'DELETE ' || target_tenant::text then
    raise exception 'workspace deletion denied';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_tenant::text, 0));
  select member.role into member_role
  from auth.organization organization
  join auth.member member on member."organizationId" = organization.id
  where organization.id = target_tenant and member."userId" = actor;

  if member_role is null or member_role <> 'owner' then
    raise exception 'workspace deletion denied';
  end if;

  perform set_config('app.workspace_deletion_tenant', target_tenant::text, true);
  update auth.session
  set "activeOrganizationId" = null, "updatedAt" = clock_timestamp()
  where "activeOrganizationId" = target_tenant::text;
  delete from app.tenants where id = target_tenant;
  delete from auth.organization where id = target_tenant;
  if not found then raise exception 'workspace deletion denied'; end if;
end
$$;
