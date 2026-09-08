\set ON_ERROR_STOP on
begin;
insert into career_identity."user" (id, name, email, "emailVerified") values
 ('19000000-0000-0000-0000-000000000091', 'Research Owner', 'research-owner@example.test', true);
insert into career_identity.organization (id, name, slug, "createdAt") values
 ('29000000-0000-0000-0000-000000000091', 'Research Tenant', 'research-tenant', now());
insert into career_identity.member (id, "organizationId", "userId", role, "createdAt") values
 ('39000000-0000-0000-0000-000000000091', '29000000-0000-0000-0000-000000000091', '19000000-0000-0000-0000-000000000091', 'owner', now());
insert into app.tenants (id, owner_id, name) values
 ('29000000-0000-0000-0000-000000000091', '19000000-0000-0000-0000-000000000091', 'Research Tenant');
insert into app.applications (id, tenant_id, company, role, raw_text, accent, create_idempotency_key, create_input_hash) values
 ('49000000-0000-0000-0000-000000000091', '29000000-0000-0000-0000-000000000091', 'Example', 'Engineer', 'Build systems', '#21504b', gen_random_uuid(), repeat('a',64));
set local role career_app;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000091', true);
select set_config('request.jwt.claim.tenant_id', '29000000-0000-0000-0000-000000000091', true);
insert into app.contact_research_runs (tenant_id, application_id, input_hash) values
 ('29000000-0000-0000-0000-000000000091', '49000000-0000-0000-0000-000000000091', repeat('b',64));
do $$ begin
 begin
  insert into app.contact_research_runs (tenant_id, application_id, input_hash) values
   ('29000000-0000-0000-0000-000000000091', '49000000-0000-0000-0000-000000000091', repeat('b',64));
  raise exception 'duplicate research was accepted';
 exception when unique_violation then null;
 end;
end $$;
update app.contact_research_runs set status = 'completed', completed_at = clock_timestamp()
 where application_id = '49000000-0000-0000-0000-000000000091';
do $$ begin
 begin
  update app.contact_research_runs set status = 'pending'
   where application_id = '49000000-0000-0000-0000-000000000091';
  raise exception 'completed research became replayable';
 exception when raise_exception then
  if sqlerrm <> 'invalid contact research transition' then raise; end if;
 end;
end $$;
insert into app.contact_research_runs (tenant_id, application_id, input_hash) values
 ('29000000-0000-0000-0000-000000000091', '49000000-0000-0000-0000-000000000091', repeat('c',64));
update app.contact_research_runs set status = 'failed', completed_at = clock_timestamp() where input_hash = repeat('c',64);
update app.contact_research_runs set status = 'pending', attempt_count = 2, completed_at = null where input_hash = repeat('c',64);
update app.contact_research_runs set dispatched_at = clock_timestamp(), usage = '{"reservedCostMicros":100000,"costBasis":"reserved_upper_bound"}' where input_hash = repeat('c',64);
update app.contact_research_runs set status = 'outcome_unknown', completed_at = clock_timestamp() where input_hash = repeat('c',64);
do $$ begin
 begin
  update app.contact_research_runs set status = 'pending', attempt_count = 3, dispatched_at = null, completed_at = null
   where input_hash = repeat('c',64);
  raise exception 'unknown provider outcome was replayable';
 exception when raise_exception then
  if sqlerrm <> 'invalid contact research transition' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000092', true);
select 1 / (((select count(*) from app.contact_research_runs) = 0)::integer) as other_user_cannot_read;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000091', true);
select app.delete_workspace('29000000-0000-0000-0000-000000000091', 'DELETE 29000000-0000-0000-0000-000000000091');
reset role;
select 1 / (((select count(*) from app.contact_research_runs where tenant_id = '29000000-0000-0000-0000-000000000091') = 0)::integer) as research_deleted_with_workspace;
rollback;
