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
insert into app.discovered_jobs (
  id, tenant_id, company, role, canonical_url, first_seen_at, last_seen_at
) values
  ('79000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Northstar', 'Engineer', 'https://jobs.example.test/1', now(), now()),
  ('79000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', 'Other', 'Engineer', 'https://jobs.example.test/2', now(), now());
insert into app.applications (
  id, tenant_id, discovered_job_id, company, role, raw_text, accent,
  create_idempotency_key, create_input_hash
) values
  ('49000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', 'Northstar', 'Engineer', 'Build systems', '#21504b', '59000000-0000-0000-0000-000000000001', repeat('a', 64)),
  ('49000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', '79000000-0000-0000-0000-000000000002', 'Other', 'Engineer', 'Other systems', '#21504b', '59000000-0000-0000-0000-000000000002', repeat('b', 64));

do $$ begin
  begin
    insert into app.applications (
      tenant_id, discovered_job_id, company, role, raw_text, accent,
      create_idempotency_key, create_input_hash
    ) values (
      '29000000-0000-0000-0000-000000000001',
      '79000000-0000-0000-0000-000000000001',
      'Duplicate', 'Engineer', 'Duplicate active application', '#21504b',
      gen_random_uuid(), repeat('c', 64)
    );
    raise exception 'duplicate active discovered-job application was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into app.applications (
      tenant_id, discovered_job_id, company, role, raw_text, accent,
      create_idempotency_key, create_input_hash
    ) values (
      '29000000-0000-0000-0000-000000000001',
      '79000000-0000-0000-0000-000000000002',
      'Forged', 'Engineer', 'Cross tenant link', '#21504b',
      gen_random_uuid(), repeat('d', 64)
    );
    raise exception 'cross-tenant discovered-job link was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;
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

insert into app.application_contacts (
  id, tenant_id, application_id, rank, name, role, profile_url,
  relationship, rationale, sources, confidence, connection_note,
  accepted_message, actor_id
) values
  ('89000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 1, 'Contact One', 'VP Engineering', 'https://company.example/contact-one', 'hiring_manager', 'Owns the hiring team', '[{"url":"https://company.example/team","title":"Team","collectedAt":"2026-09-05T08:00:00.000Z","trust":"authoritative","supports":["identity","current_role","hiring_scope"]}]'::jsonb, 'verified', 'Connection note', 'Accepted message', '19000000-0000-0000-0000-000000000001'),
  ('89000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 2, 'Contact Two', 'Staff Engineer', 'https://company.example/contact-two', 'team_leader', 'Leads the relevant team', '[{"url":"https://company.example/team","title":"Team","collectedAt":"2026-09-05T08:00:00.000Z","trust":"authoritative","supports":["identity","current_role"]}]'::jsonb, 'likely', 'Connection note', 'Accepted message', '19000000-0000-0000-0000-000000000001'),
  ('89000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 3, 'Contact Three', 'Recruiter', 'https://company.example/contact-three', 'internal_recruiter', 'Recruits for engineering', '[{"url":"https://company.example/team","title":"Team","collectedAt":"2026-09-05T08:00:00.000Z","trust":"authoritative","supports":["identity","current_role"]}]'::jsonb, 'likely', 'Connection note', 'Accepted message', '19000000-0000-0000-0000-000000000001');

select 1 / (((select count(*) from app.application_contacts) = 3)::integer)
  as application_contact_tenant_isolation;

do $$ begin
  begin
    insert into app.application_contacts (
      tenant_id, application_id, rank, name, role, profile_url,
      relationship, rationale, sources, confidence, connection_note,
      accepted_message, actor_id
    ) values (
      '29000000-0000-0000-0000-000000000001',
      '49000000-0000-0000-0000-000000000001', 4, 'Fourth', 'Recruiter',
      'https://company.example/fourth', 'internal_recruiter', 'Fourth contact',
      '[{"url":"https://company.example/team","title":"Team","collectedAt":"2026-09-05T08:00:00.000Z","trust":"authoritative","supports":["identity"]}]'::jsonb,
      'uncertain', 'Connection note', 'Accepted message',
      '19000000-0000-0000-0000-000000000001'
    );
    raise exception 'fourth application contact was accepted';
  exception when check_violation then null;
  end;
  begin
    update app.application_contacts set name = 'Mutated identity',
      revision = revision + 1
    where id = '89000000-0000-0000-0000-000000000001';
    raise exception 'application contact identity mutation succeeded';
  exception when raise_exception then
    if sqlerrm <> 'invalid application contact update' then raise; end if;
  end;
end $$;

update app.application_contacts set status = 'contacted', revision = revision + 1
where id = '89000000-0000-0000-0000-000000000001';
select 1 / (((select status = 'contacted' and revision = 2
  from app.application_contacts
  where id = '89000000-0000-0000-0000-000000000001'))::integer)
  as application_contact_tracking_updated;

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
    update app.applications set discovered_job_id = null,
      revision = revision + 1
    where id = '49000000-0000-0000-0000-000000000001';
    raise exception 'application source link mutation succeeded';
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

delete from app.discovered_jobs
where id = '79000000-0000-0000-0000-000000000001';
select 1 / (((select discovered_job_id is null and revision = 3
  from app.applications
  where id = '49000000-0000-0000-0000-000000000001'))::integer)
  as deleted_source_unlinked_without_deleting_application;

rollback;
select 'applications tenant isolation and snapshots ok' as result;
