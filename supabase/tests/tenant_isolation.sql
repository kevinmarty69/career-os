\set ON_ERROR_STOP on

begin;
set local role career_app;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '20000000-0000-0000-0000-000000000001', true);
insert into app.tenants (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tenant A');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'manual', 'A source', 'private', '{application}');

reset role;
insert into app.tenants (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Tenant B');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'manual', 'B source', 'private', '{application}');
set local role career_app;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '20000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select count(*) from app.sources) <> 1 then raise exception 'tenant A can read tenant B'; end if;
  if exists(select 1 from app.sources where title = 'B source') then raise exception 'cross-tenant row leaked'; end if;
end $$;

do $$ begin
  begin
    update app.sources set title = 'stolen' where id = '30000000-0000-0000-0000-000000000002';
    if found then raise exception 'tenant A updated tenant B'; end if;
  end;
end $$;

reset role;
do $$ begin
  begin
    insert into app.evidence (tenant_id, source_id, label, excerpt) values
      ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'bad', 'bad');
    raise exception 'composite tenant foreign key accepted a cross-tenant reference';
  exception when foreign_key_violation then null;
  end;
end $$;

rollback;
select 'tenant isolation ok' as result;
