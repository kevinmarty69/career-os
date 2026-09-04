create or replace function app.prepare_workspace_export(target_tenant uuid)
returns jsonb language plpgsql security definer
set search_path = app, auth, pg_temp as $$
declare
  actor uuid := app.current_user_id();
  active_tenant uuid := app.current_tenant_id();
  member_role text;
  workspace jsonb;
begin
  if target_tenant is null or actor is null or active_tenant <> target_tenant then
    raise exception 'workspace export denied';
  end if;
  if not pg_try_advisory_xact_lock(
    hashtextextended('workspace-export:' || target_tenant::text, 0)
  ) then
    raise exception 'workspace export busy';
  end if;

  select member.role into member_role
  from auth.organization organization
  join auth.member member on member."organizationId" = organization.id
  where organization.id = target_tenant and member."userId" = actor;
  if member_role is null or member_role <> 'owner' then
    raise exception 'workspace export denied';
  end if;

  select jsonb_build_object(
    'snapshotAt', transaction_timestamp(),
    'tenant', jsonb_build_object(
      'id', tenant.id,
      'owner_id', tenant.owner_id,
      'name', tenant.name
    ),
    'organization', jsonb_build_object(
      'id', organization.id,
      'name', organization.name,
      'slug', organization.slug,
      'logo', organization.logo,
      'createdAt', organization."createdAt"
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', member.id,
        'userId', member."userId",
        'role', member.role,
        'joinedAt', member."createdAt",
        'displayName', account.name,
        'email', account.email,
        'image', account.image
      ) order by member."createdAt", member.id)
      from auth.member member
      join auth."user" account on account.id = member."userId"
      where member."organizationId" = target_tenant
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invitation.id,
        'email', invitation.email,
        'role', invitation.role,
        'status', invitation.status,
        'expiresAt', invitation."expiresAt",
        'createdAt', invitation."createdAt",
        'inviterId', invitation."inviterId"
      ) order by invitation."createdAt", invitation.id)
      from auth.invitation invitation
      where invitation."organizationId" = target_tenant
    ), '[]'::jsonb)
  ) into workspace
  from app.tenants tenant
  join auth.organization organization on organization.id = tenant.id
  where tenant.id = target_tenant and tenant.owner_id = actor;
  if workspace is null then raise exception 'workspace export denied'; end if;
  return workspace;
end
$$;

grant execute on function app.prepare_workspace_export(uuid) to career_app;
revoke execute on function app.prepare_workspace_export(uuid) from public;

grant select (
  id, tenant_id, publication_id, expires_at, revoked_at
) on app.share_links to career_app;
grant select (
  id, tenant_id, actor_id, status, created_at, finished_at
) on app.url_import_attempts to career_app;
grant select (
  id, tenant_id, workflow_run_id, idempotency_key, requested_tokens,
  requested_cost_micros, lease_expires_at, status, actual_tokens,
  actual_cost_micros, created_at, finished_at
) on app.run_budget_reservations to career_app;
