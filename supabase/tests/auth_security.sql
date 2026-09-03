\set ON_ERROR_STOP on

begin;

insert into auth."user" (id, name, email, "emailVerified") values
  ('11000000-0000-0000-0000-000000000001', 'Member One', 'member-one@example.test', true),
  ('11000000-0000-0000-0000-000000000002', 'Member Two', 'member-two@example.test', true);

insert into auth.organization (id, name, slug, "createdAt") values
  ('21000000-0000-0000-0000-000000000001', 'Organization One', 'organization-one', now()),
  ('21000000-0000-0000-0000-000000000002', 'Organization Two', 'organization-two', now()),
  ('21000000-0000-0000-0000-000000000003', 'Organization Three', 'organization-three', now()),
  ('21000000-0000-0000-0000-000000000004', 'Organization Four', 'organization-four', now());

insert into auth."member" (id, "organizationId", "userId", role, "createdAt") values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'owner', now()),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'member', now()),
  ('31000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'owner', now());

do $$
begin
  begin
    insert into auth."member" (id, "organizationId", "userId", role, "createdAt") values
      ('31000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'member', now());
    raise exception 'duplicate membership was accepted';
  exception when unique_violation then null;
  end;
end $$;

insert into app.tenants (id, owner_id, name) values
  ('21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'Tenant Three');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('41000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000003', 'manual', 'Other member source', 'private', '{application}');

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000001', true);
set local role career_app;

insert into app.tenants (id, owner_id, name) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Tenant One'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'Tenant Two');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'manual', 'First organization source', 'private', '{application}');

select set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000002', true);
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('41000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'manual', 'Second organization source', 'private', '{application}');

select set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000001', true);

do $$
begin
  if (select count(*) from app.tenants) <> 1 then
    raise exception 'the active organization did not scope tenant access';
  end if;
  if (select count(*) from app.sources) <> 1 then
    raise exception 'the active organization did not scope data access';
  end if;
  if exists(select 1 from app.sources where title = 'Second organization source') then
    raise exception 'another member organization leaked through RLS';
  end if;
  if exists(select 1 from app.sources where title = 'Other member source') then
    raise exception 'a non-member organization leaked through RLS';
  end if;
  begin
    insert into app.tenants (id, owner_id, name) values
      ('21000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 'Unauthorized Tenant');
    raise exception 'a non-member created an auth-backed tenant';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

delete from auth."member"
where "organizationId" = '21000000-0000-0000-0000-000000000002'
  and "userId" = '11000000-0000-0000-0000-000000000001';

set local role career_app;
select set_config('request.jwt.claim.tenant_id', '21000000-0000-0000-0000-000000000002', true);
do $$
begin
  if exists(
    select 1 from app.sources
    where tenant_id = '21000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'removed membership retained tenant access';
  end if;
end $$;
reset role;

do $$
declare role_name text;
begin
  foreach role_name in array array[
    'career_app', 'career_worker', 'career_company_researcher',
    'career_reviewer', 'career_publisher', 'career_reader'
  ] loop
    if has_schema_privilege(role_name, 'auth', 'usage') then
      raise exception '% has direct auth schema access', role_name;
    end if;
    if has_table_privilege(role_name, 'auth.member', 'select') then
      raise exception '% has direct auth membership access', role_name;
    end if;
  end loop;
end $$;

rollback;
select 'auth security ok' as result;
