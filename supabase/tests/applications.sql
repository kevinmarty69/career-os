\set ON_ERROR_STOP on

begin;

insert into auth."user" (id, name, email, "emailVerified") values
  ('19000000-0000-0000-0000-000000000001', 'Application Owner', 'application-owner@example.test', true),
  ('19000000-0000-0000-0000-000000000002', 'Other Owner', 'application-other@example.test', true);
insert into auth.organization (id, name, slug, "createdAt") values
  ('29000000-0000-0000-0000-000000000001', 'Application Tenant', 'application-tenant', now()),
  ('29000000-0000-0000-0000-000000000002', 'Other Tenant', 'application-other', now());
insert into auth."member" (id, "organizationId", "userId", role, "createdAt") values
  ('39000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'owner', now()),
  ('39000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', 'owner', now());
insert into app.tenants (id, owner_id, name) values
  ('29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'Application Tenant'),
  ('29000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', 'Other Tenant');
insert into app.applications (
  id, tenant_id, company, role, raw_text, accent, create_idempotency_key,
  create_input_hash
) values
  ('49000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Northstar', 'Engineer', 'Build systems', '#21504b', '59000000-0000-0000-0000-000000000001', repeat('a', 64)),
  ('49000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', 'Other', 'Engineer', 'Other systems', '#21504b', '59000000-0000-0000-0000-000000000002', repeat('b', 64));
insert into app.opportunities (
  id, tenant_id, application_id, application_revision, company, role,
  raw_text, extraction_status
) values (
  '69000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001',
  '49000000-0000-0000-0000-000000000001', 1,
  'Northstar', 'Engineer', 'Build systems', 'ready'
);

do $$ begin
  begin
    insert into app.opportunities (
      tenant_id, application_id, application_revision, company, role,
      raw_text, extraction_status
    ) values (
      '29000000-0000-0000-0000-000000000001',
      '49000000-0000-0000-0000-000000000002', 1,
      'Forged', 'Engineer', 'Cross tenant', 'ready'
    );
    raise exception 'cross-tenant application snapshot was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '29000000-0000-0000-0000-000000000001', true);
set local role career_app;

select 1 / (((select count(*) from app.applications) = 1)::integer)
  as application_tenant_isolation;

do $$
declare changed integer;
begin
  update app.applications set company = 'Leaked', revision = revision + 1
  where id = '49000000-0000-0000-0000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'cross-tenant update succeeded'; end if;
  begin
    update app.applications set company = 'No revision bump'
    where id = '49000000-0000-0000-0000-000000000001';
    raise exception 'application update without revision bump succeeded';
  exception when raise_exception then
    if sqlerrm <> 'invalid application update' then raise; end if;
  end;
  begin
    update app.opportunities set company = 'Mutated snapshot'
    where id = '69000000-0000-0000-0000-000000000001';
    raise exception 'opportunity snapshot mutation succeeded';
  exception when raise_exception then
    if sqlerrm <> 'opportunity snapshots are immutable' then raise; end if;
  end;
  begin
    delete from app.applications
    where id = '49000000-0000-0000-0000-000000000001';
    raise exception 'career_app hard-deleted an application';
  exception when insufficient_privilege then null;
  end;
end $$;

update app.applications set company = 'Updated', revision = revision + 1
where id = '49000000-0000-0000-0000-000000000001';
select 1 / (((select revision from app.applications
  where id = '49000000-0000-0000-0000-000000000001') = 2)::integer)
  as application_revision_advanced;

rollback;
select 'applications tenant isolation and snapshots ok' as result;
