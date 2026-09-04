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
update app.workflow_steps set status = 'cancelled'
where status = 'pending' and stage in (
  'recruiter-reviewer','hiring-manager-reviewer','factuality-reviewer'
);
insert into app.tenants (id, owner_id, name) values
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'Capability tenant');
insert into app.profiles (id, tenant_id, name, headline) values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-0000-0000-000000000001', 'Capability User', 'Engineer');
insert into app.sources (id, tenant_id, profile_id, position, kind, title, sensitivity, allowed_uses) values
  ('42000000-0000-4000-8000-000000000001', '22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', 0, 'manual', 'Allowed source', 'private', '{application}'),
  ('42000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', 1, 'manual', 'Restricted source', 'restricted', '{interview}');
insert into app.evidence (id, tenant_id, profile_id, source_id, position, label, excerpt) values
  ('52000000-0000-4000-8000-000000000001', '22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 0, 'Allowed', 'Allowed evidence'),
  ('52000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', '42000000-0000-0000-0000-000000000002', 1, 'Restricted', 'SECRET-RESTRICTED-EVIDENCE');
insert into app.claims (id, tenant_id, profile_id, position, statement, level, sensitivity, allowed_uses) values
  ('62000000-0000-4000-8000-000000000001', '22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', 0, 'Allowed claim', 'verified', 'private', '{application}'),
  ('62000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', 1, 'Restricted late claim', 'verified', 'restricted', '{interview}');
insert into app.claim_evidence (tenant_id, profile_id, claim_id, evidence_id, position) values
  ('22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 0),
  ('22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '52000000-0000-0000-0000-000000000002', 1),
  ('22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', '62000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002', 0);
insert into app.applications (id, tenant_id, company, role, raw_text, accent,
  create_idempotency_key, create_input_hash) values
  ('72000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Capability Co', 'Engineer', 'Capability role', '#21504b',
   '72000000-0000-0000-0000-000000000011', repeat('a', 64));
insert into app.opportunities (id, tenant_id, application_id, application_revision,
  company, role, extraction_status) values
  ('72000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 1,
   'Capability Co', 'Engineer', 'ready');
insert into app.workflow_runs (id, tenant_id, opportunity_id, profile_id, state, status, token_budget, cost_budget_micros, deadline_at) values
  ('82000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', 'page_spec_review', 'paused', 5000, 0, now() + interval '1 hour');
insert into app.artifacts (
  id, tenant_id, workflow_run_id, kind, version, body, created_by
) values
  ('83000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'strategy', 1, '{"fixture":true}', 'recruiter_strategist'),
  ('83000000-0000-4000-8000-000000000002', '22000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'page_spec', 1, '{"version":1,"company":{"name":"Capability Co","role":"Engineer","accent":"#21504b"},"hero":{"eyebrow":"Private application","title":"Capability User × Capability Co","thesis":"Allowed claim"},"blocks":[{"type":"fit","title":"Relevant experience","claimIds":["62000000-0000-4000-8000-000000000001"]}]}', 'page_composer');
insert into app.page_specs (
  id, tenant_id, workflow_run_id, version, spec, input_hash, source_artifact_id
) values
  ('92000000-0000-4000-8000-000000000001', '22000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 1,
   '{"version":1,"company":{"name":"Capability Co","role":"Engineer","accent":"#21504b"},"hero":{"eyebrow":"Private application","title":"Capability User × Capability Co","thesis":"Allowed claim"},"blocks":[{"type":"fit","title":"Relevant experience","claimIds":["62000000-0000-4000-8000-000000000001"]}]}'::jsonb, repeat('c', 64),
   '83000000-0000-4000-8000-000000000002');
insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values
  ('22000000-0000-0000-0000-000000000001', '92000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001');
insert into app.page_spec_evidence (
  tenant_id, page_spec_id, claim_id, evidence_id, position
) values
  ('22000000-0000-0000-0000-000000000001', '92000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 0),
  ('22000000-0000-0000-0000-000000000001', '92000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '52000000-0000-0000-0000-000000000002', 1);
insert into app.strategy_approvals (
  id, tenant_id, workflow_run_id, strategy_artifact_id,
  strategy_artifact_hash, idempotency_key, approved_by
)
select '84000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001', id,
  encode(digest(body::text, 'sha256'), 'hex'),
  '84000000-0000-0000-0000-000000000011',
  '12000000-0000-0000-0000-000000000001'
from app.artifacts where id = '83000000-0000-0000-0000-000000000001';
insert into app.workflow_steps (
  id, tenant_id, workflow_run_id, stage, status, idempotency_key, input,
  input_hash, output_artifact_id, completed_at, page_spec_id
)
select '85000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001', 'page-composer', 'completed',
  'capability-page-composer', fixture.input,
  encode(digest(fixture.input::text, 'sha256'), 'hex'),
  '83000000-0000-4000-8000-000000000002', now(),
  '92000000-0000-4000-8000-000000000001'
from (
  select jsonb_build_object(
    'schemaVersion', 1,
    'strategyArtifactId', '83000000-0000-0000-0000-000000000001',
    'strategyArtifactHash', encode(digest(body::text, 'sha256'), 'hex'),
    'strategyApprovalId', '84000000-0000-0000-0000-000000000001'
  ) input
  from app.artifacts where id = '83000000-0000-0000-0000-000000000001'
) fixture;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '22000000-0000-0000-0000-000000000001', true);
do $$
declare claimed record; output jsonb;
begin
  perform app.start_page_spec_reviews(
    '22000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001'
  );
  select * into claimed from app.claim_recruiter_reviewer_step(60);
  perform app.mark_recruiter_reviewer_in_flight(
    claimed.step_id, claimed.lease_token, 'openai-compatible-local',
    'fixture', 500, 0
  );
  output := jsonb_build_object(
    'schemaVersion',1,'purpose','page-spec-review',
    'pageSpecId',claimed.input->>'pageSpecId',
    'pageSpecHash',claimed.input->>'pageSpecHash',
    'reviewer','recruiter','verdict','pass','issues','[]'::jsonb
  );
  perform app.complete_recruiter_reviewer_step(
    claimed.step_id,claimed.lease_token,output,1,1,0,1,false,'fixture-recruiter'
  );

  select * into claimed from app.claim_hiring_manager_reviewer_step(60);
  perform app.mark_hiring_manager_reviewer_in_flight(
    claimed.step_id, claimed.lease_token, 'openai-compatible-local',
    'fixture', 500, 0
  );
  output := jsonb_build_object(
    'schemaVersion',1,'purpose','page-spec-review',
    'pageSpecId',claimed.input->>'pageSpecId',
    'pageSpecHash',claimed.input->>'pageSpecHash',
    'reviewer','hiring_manager','verdict','pass','issues','[]'::jsonb
  );
  perform app.complete_hiring_manager_reviewer_step(
    claimed.step_id,claimed.lease_token,output,1,1,0,1,false,'fixture-hiring'
  );

  select * into claimed from app.claim_factuality_reviewer_step(60);
  perform app.complete_factuality_reviewer_step(
    claimed.step_id, claimed.lease_token,
    app.materialize_factuality_reviewer_output(claimed.input)
  );
end $$;
set local role career_app;
select app.approve_page_spec('92000000-0000-4000-8000-000000000001');
set local role career_publisher;
do $$ begin
  begin
    perform app.mint_publication('92000000-0000-4000-8000-000000000001', digest('mixed-token', 'sha256'), now() + interval '1 day');
    raise exception 'mixed restricted evidence published';
  exception when others then
    if sqlerrm = 'mixed restricted evidence published' then raise; end if;
  end;
end $$;

reset role;
delete from app.page_spec_evidence
where claim_id = '62000000-0000-4000-8000-000000000001'
  and evidence_id = '52000000-0000-0000-0000-000000000002';
delete from app.claim_evidence
where claim_id = '62000000-0000-4000-8000-000000000001'
  and evidence_id = '52000000-0000-0000-0000-000000000002';
set local role career_publisher;
select app.mint_publication('92000000-0000-4000-8000-000000000001', digest('safe-token', 'sha256'), now() + interval '1 day') as audit_publication_id \gset
select app.mint_publication('92000000-0000-4000-8000-000000000001', digest('safe-token', 'sha256'), now() + interval '1 day') as retry_publication_id \gset

do $$ begin
  begin
    perform app.mint_publication('92000000-0000-4000-8000-000000000001', digest('different-token', 'sha256'), now() + interval '1 day');
    raise exception 'publication capability rotated during retry';
  exception when others then
    if sqlerrm = 'publication capability rotated during retry' then raise; end if;
    if sqlerrm <> 'publication already has an active capability' then raise; end if;
  end;
end $$;

select 1 / ((:'audit_publication_id' = :'retry_publication_id')::integer)
  as publication_retry_reused_snapshot;
reset role;
select 1 / (((select count(*) from app.publications
  where page_spec_id = '92000000-0000-4000-8000-000000000001') = 1)::integer)
  as one_publication_per_page_spec;
select 1 / (((select count(*) from app.share_links
  where publication_id = :'audit_publication_id'::uuid and revoked_at is null) = 1)::integer)
  as retry_kept_one_capability;
select 1 / ((app.read_shared_publication(:'audit_publication_id'::uuid,
  digest('safe-token', 'sha256')) is not null)::integer)
  as retry_kept_previous_capability;

set local role career_app;
update app.claims set statement = 'Changed after publication'
where id = '62000000-0000-4000-8000-000000000001';
insert into app.claim_evidence (tenant_id, profile_id, claim_id, evidence_id, position) values
  ('22000000-0000-0000-0000-000000000001', '32000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '52000000-0000-0000-0000-000000000002', 1);
set local role career_worker;
do $$ begin
  begin
    insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values
      ('22000000-0000-0000-0000-000000000001', '92000000-0000-4000-8000-000000000001', '62000000-0000-0000-0000-000000000002');
    raise exception 'legacy worker mutated PageSpec mappings';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values
  ('22000000-0000-0000-0000-000000000001', '92000000-0000-4000-8000-000000000001', '62000000-0000-0000-0000-000000000002');
set local role career_reader;
select 1 / ((app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256')) is not null
  and position('Allowed claim' in app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256'))::text) > 0
  and position('Changed after publication' in app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256'))::text) = 0
  and position('SECRET-RESTRICTED-EVIDENCE' in app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256'))::text) = 0
  and position('Restricted late claim' in app.read_shared_publication(:'audit_publication_id'::uuid, digest('safe-token', 'sha256'))::text) = 0)::integer)
  as restricted_evidence_not_served;

set local role career_app;
update app.applications set deleted_at = now(), revision = revision + 1
where id = '72000000-0000-0000-0000-000000000001';
set local role career_reader;
select 1 / ((app.read_shared_publication(:'audit_publication_id'::uuid,
  digest('safe-token', 'sha256')) is null)::integer)
  as application_deletion_revoked_capability;
rollback;
select 'capability writer and immutable publication snapshot ok' as result;
