\set ON_ERROR_STOP on

begin;

insert into auth."user" (id, name, email, "emailVerified") values
  ('f1000000-0000-4000-8000-000000000001', 'Workspace Owner', 'workspace-owner@example.test', true),
  ('f1000000-0000-4000-8000-000000000002', 'Workspace Member', 'workspace-member@example.test', true);
insert into auth.organization (id, name, slug, "createdAt") values
  ('f2000000-0000-4000-8000-000000000001', 'Delete me exactly', 'delete-me-exactly', now()),
  ('f2000000-0000-4000-8000-000000000002', 'Keep me', 'keep-me', now());
insert into auth.member (id, "organizationId", "userId", role, "createdAt") values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner', now()),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'member', now()),
  ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'owner', now());
insert into auth.session (
  id, "expiresAt", token, "updatedAt", "userId", "activeOrganizationId"
) values
  ('f4000000-0000-4000-8000-000000000001', now() + interval '1 day', 'workspace-owner-session', now(), 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-000000000002', now() + interval '1 day', 'workspace-member-session', now(), 'f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001');
insert into auth.invitation (
  id, "organizationId", email, role, status, "expiresAt", "inviterId"
) values (
  'f5000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'invitee@example.test', 'member', 'pending', now() + interval '1 day',
  'f1000000-0000-4000-8000-000000000001'
);
insert into app.tenants (id, owner_id, name) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Delete me exactly'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'Keep me');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'manual', 'Delete source', 'private', '{application}'),
  ('f6000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'manual', 'Keep source', 'private', '{application}');
insert into app.applications (
  id, tenant_id, company, role, raw_text, accent, create_idempotency_key,
  create_input_hash
) values (
  'f7000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'Delete Co', 'Engineer', 'Delete graph', '#21504b', gen_random_uuid(),
  repeat('a', 64)
);
insert into app.opportunities (
  id, tenant_id, application_id, application_revision, company, role,
  raw_text, extraction_status
) values (
  'f7100000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000001', 1,
  'Delete Co', 'Engineer', 'Delete graph', 'ready'
);
insert into app.workflow_runs (
  id, tenant_id, opportunity_id, state, status, token_budget,
  cost_budget_micros, deadline_at
) values (
  'f7200000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000001',
  'publication_ready', 'completed', 1, 0, now() + interval '1 hour'
);
insert into app.page_specs (id, tenant_id, workflow_run_id, version, spec)
values (
  'f7300000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f7200000-0000-4000-8000-000000000001', 1, '{"blocks":[]}'::jsonb
);
set local session_replication_role = replica;
insert into app.publications (
  id, tenant_id, page_spec_id, publication_payload
) values (
  'f7400000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f7300000-0000-4000-8000-000000000001', '{"proof":true}'::jsonb
);
insert into app.share_links (
  id, tenant_id, publication_id, token_hash, expires_at
) values (
  'f7500000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f7400000-0000-4000-8000-000000000001',
  digest('workspace-delete-token', 'sha256'), now() + interval '1 day'
);
set local session_replication_role = origin;

set local role career_reader;
select 1 / ((app.read_shared_publication(
  'f7400000-0000-4000-8000-000000000001',
  digest('workspace-delete-token', 'sha256')
) is not null)::integer) as publication_readable_before_deletion;
reset role;

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.tenant_id', 'f2000000-0000-4000-8000-000000000001', true);
set local role career_app;
do $$ begin
  begin
    perform app.delete_workspace(
      'f2000000-0000-4000-8000-000000000001',
      'DELETE f2000000-0000-4000-8000-000000000001'
    );
    raise exception 'non-owner deleted a workspace';
  exception when others then
    if sqlerrm = 'non-owner deleted a workspace' then raise; end if;
    if sqlerrm <> 'workspace deletion denied' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin
    perform app.delete_workspace(
      'f2000000-0000-4000-8000-000000000001', 'wrong confirmation'
    );
    raise exception 'wrong confirmation deleted a workspace';
  exception when others then
    if sqlerrm = 'wrong confirmation deleted a workspace' then raise; end if;
    if sqlerrm <> 'workspace deletion denied' then raise; end if;
  end;
end $$;

select app.delete_workspace(
  'f2000000-0000-4000-8000-000000000001',
  'DELETE f2000000-0000-4000-8000-000000000001'
);
reset role;

set local role career_reader;
select 1 / ((app.read_shared_publication(
  'f7400000-0000-4000-8000-000000000001',
  digest('workspace-delete-token', 'sha256')
) is null)::integer) as publication_unreadable_after_deletion;
reset role;

do $$ begin
  if exists(select 1 from app.tenants where id = 'f2000000-0000-4000-8000-000000000001')
    or exists(select 1 from app.sources where tenant_id = 'f2000000-0000-4000-8000-000000000001')
    or exists(select 1 from auth.organization where id = 'f2000000-0000-4000-8000-000000000001')
    or exists(select 1 from auth.member where "organizationId" = 'f2000000-0000-4000-8000-000000000001')
    or exists(select 1 from auth.invitation where "organizationId" = 'f2000000-0000-4000-8000-000000000001') then
    raise exception 'workspace deletion left orphaned data';
  end if;
  if (select count(*) from auth."user" where id in (
      'f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000002'
    )) <> 2
    or exists(select 1 from auth.session
      where "activeOrganizationId" = 'f2000000-0000-4000-8000-000000000001')
    or (select count(*) from auth.session where id in (
      'f4000000-0000-4000-8000-000000000001',
      'f4000000-0000-4000-8000-000000000002'
    )) <> 2 then
    raise exception 'workspace deletion removed identities or left active sessions';
  end if;
  if not exists(select 1 from app.tenants where id = 'f2000000-0000-4000-8000-000000000002')
    or not exists(select 1 from auth.organization where id = 'f2000000-0000-4000-8000-000000000002')
    or not exists(select 1 from app.sources where tenant_id = 'f2000000-0000-4000-8000-000000000002') then
    raise exception 'workspace deletion affected another tenant';
  end if;
  if exists (
    select 1
    from information_schema.columns column_definition
    where column_definition.table_schema = 'app'
      and column_definition.column_name = 'tenant_id'
      and not exists (
        select 1 from pg_constraint constraint_definition
        join pg_attribute attribute_definition
          on attribute_definition.attrelid = constraint_definition.conrelid
          and attribute_definition.attnum = any(constraint_definition.conkey)
        where constraint_definition.contype = 'f'
          and constraint_definition.confrelid = 'app.tenants'::regclass
          and constraint_definition.confdeltype = 'c'
          and constraint_definition.conrelid = (
            quote_ident(column_definition.table_schema) || '.' ||
            quote_ident(column_definition.table_name)
          )::regclass
          and attribute_definition.attname = 'tenant_id'
      )
  ) then
    raise exception 'tenant-scoped table lacks deletion cascade';
  end if;
end $$;

rollback;
select 'owner-only workspace deletion removed app and auth data atomically' as result;
