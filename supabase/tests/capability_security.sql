\set ON_ERROR_STOP on

begin;
set local role career_publisher;
do $$ begin
  begin
    insert into app.publications (tenant_id, page_spec_id, page_spec_hash)
    values (gen_random_uuid(), gen_random_uuid(), 'forged');
    raise exception 'publisher bypassed the mint function';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into app.share_links (tenant_id, publication_id, token_hash, expires_at)
    values (gen_random_uuid(), gen_random_uuid(), digest('forged', 'sha256'), now() + interval '1 day');
    raise exception 'publisher wrote a raw share link';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
insert into app.tenants (id, owner_id, name) values
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'Capability tenant');
insert into app.profiles (id, tenant_id, name, headline) values
  ('32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Capability User', 'Engineer');
insert into app.sources (id, tenant_id, kind, title, sensitivity, allowed_uses) values
  ('42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'manual', 'Allowed source', 'private', '{application}'),
  ('42000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', 'manual', 'Restricted source', 'restricted', '{interview}');
insert into app.evidence (id, tenant_id, source_id, label, excerpt) values
  ('52000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'Allowed', 'Allowed evidence'),
  ('52000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002', 'Restricted', 'SECRET-RESTRICTED-EVIDENCE');
insert into app.claims (id, tenant_id, statement, level, sensitivity, allowed_uses) values
  ('62000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Allowed claim', 'verified', 'private', '{application}'),
  ('62000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', 'Restricted late claim', 'verified', 'restricted', '{interview}');
insert into app.claim_evidence (tenant_id, claim_id, evidence_id) values
  ('22000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001'),
  ('22000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002'),
  ('22000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002');
insert into app.opportunities (id, tenant_id, company, role, extraction_status) values
  ('72000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Capability Co', 'Engineer', 'ready');
insert into app.workflow_runs (id, tenant_id, opportunity_id, profile_id, state, status, token_budget, cost_budget_micros, deadline_at) values
  ('82000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'approved', 'completed', 1000, 0, now() + interval '1 hour');
insert into app.page_specs (id, tenant_id, workflow_run_id, version, spec) values
  ('92000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 1,
   '{"blocks":[{"type":"fit","claimIds":["62000000-0000-0000-0000-000000000001"]}]}'::jsonb);
insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values
  ('22000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001');
insert into app.reviews (tenant_id, page_spec_id, reviewer, verdict, page_spec_hash)
select '22000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', reviewer, 'pass', spec_hash
from app.page_specs cross join (values ('recruiter'), ('hiring_manager'), ('factuality')) reviewers(reviewer)
where id = '92000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '22000000-0000-0000-0000-000000000001', true);
set local role career_app;
select app.approve_page_spec('92000000-0000-0000-0000-000000000001');
set local role career_publisher;
do $$ begin
  begin
    perform app.mint_publication('92000000-0000-0000-0000-000000000001', digest('mixed-token', 'sha256'), now() + interval '1 day');
    raise exception 'mixed restricted evidence published';
  exception when others then
    if sqlerrm = 'mixed restricted evidence published' then raise; end if;
  end;
end $$;

reset role;
delete from app.claim_evidence
where claim_id = '62000000-0000-0000-0000-000000000001'
  and evidence_id = '52000000-0000-0000-0000-000000000002';
set local role career_publisher;
select app.mint_publication('92000000-0000-0000-0000-000000000001', digest('safe-token', 'sha256'), now() + interval '1 day') as audit_publication_id \gset

set local role career_app;
insert into app.claim_evidence (tenant_id, claim_id, evidence_id) values
  ('22000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002');
set local role career_worker;
insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values
  ('22000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000002');
set local role career_reader;
select 1 / ((app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256')) is not null
  and position('SECRET-RESTRICTED-EVIDENCE' in app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256'))::text) = 0
  and position('Restricted late claim' in app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256'))::text) = 0)::integer)
  as restricted_evidence_not_served;
rollback;
select 'capability writer and immutable publication snapshot ok' as result;
