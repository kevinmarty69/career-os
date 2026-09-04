\set ON_ERROR_STOP on

begin;
set local role career_app;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '20000000-0000-0000-0000-000000000001', true);
insert into app.tenants (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tenant A');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'manual', 'A source', 'private', '{application}');
insert into app.discovered_jobs (
  id, tenant_id, company, role, canonical_url, first_seen_at, last_seen_at
) values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Tenant A Company', 'Engineer', 'https://a.example.test/job', now(), now()
);
insert into app.job_source_records (
  id, tenant_id, discovered_job_id, requested_url, final_url, fetched_at,
  content_type, bytes, content_sha256, extraction
) values (
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'https://a.example.test/job', 'https://a.example.test/job', now(),
  'text/html', 128, repeat('a', 64), '{"company":"Tenant A Company"}'::jsonb
);

reset role;
insert into app.tenants (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Tenant B');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'manual', 'B source', 'private', '{application}');
insert into app.discovered_jobs (
  id, tenant_id, company, role, canonical_url, first_seen_at, last_seen_at
) values (
  '40000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  'Tenant B Company', 'Engineer', 'https://b.example.test/job', now(), now()
);
set local role career_app;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '20000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select count(*) from app.sources) <> 1 then raise exception 'tenant A can read tenant B'; end if;
  if exists(select 1 from app.sources where title = 'B source') then raise exception 'cross-tenant row leaked'; end if;
  if (select count(*) from app.discovered_jobs) <> 1 then raise exception 'tenant A can read tenant B discovered jobs'; end if;
  if exists(select 1 from app.discovered_jobs where company = 'Tenant B Company') then raise exception 'cross-tenant discovered job leaked'; end if;
  if (select count(*) from app.job_source_records) <> 1 then raise exception 'tenant A source provenance isolation failed'; end if;
end $$;

do $$ begin
  begin
    update app.sources set title = 'stolen' where id = '30000000-0000-0000-0000-000000000002';
    if found then raise exception 'tenant A updated tenant B'; end if;
  end;
end $$;

do $$ begin
  begin
    update app.discovered_jobs set role = 'stolen'
      where id = '40000000-0000-0000-0000-000000000002';
    if found then raise exception 'tenant A updated tenant B discovered job'; end if;
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

reset role;
do $$ begin
  begin
    insert into app.job_source_records (
      tenant_id, discovered_job_id, requested_url, final_url, fetched_at,
      content_type, bytes, content_sha256, extraction
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      'https://cross.example.test/job', 'https://cross.example.test/job', now(),
      'text/html', 128, repeat('b', 64), '{"company":"Cross Tenant"}'::jsonb
    );
    raise exception 'discovered job provenance accepted a cross-tenant reference';
  exception when foreign_key_violation then null;
  end;
end $$;

rollback;
select 'tenant isolation ok' as result;
