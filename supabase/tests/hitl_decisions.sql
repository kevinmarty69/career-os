\set ON_ERROR_STOP on

begin;

insert into auth."user" (id, name, email, "emailVerified") values
  ('18000000-0000-0000-0000-000000000001', 'Decision Owner', 'decision-owner@example.test', true);
insert into auth.organization (id, name, slug, "createdAt") values
  ('28000000-0000-0000-0000-000000000001', 'Decision Tenant', 'decision-tenant', now());
insert into auth."member" (id, "organizationId", "userId", role, "createdAt") values
  ('38000000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', 'owner', now());
insert into app.tenants (id, owner_id, name) values
  ('28000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', 'Decision Tenant');
insert into app.profiles (
  id, tenant_id, name, headline, profile_kind, revision
) values (
  '48000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  'Decision Candidate', 'Evidence engineer', 'snapshot', 1
);
insert into app.sources (
  id, tenant_id, profile_id, position, kind, title, sensitivity, allowed_uses
) values (
  '58000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001', 0, 'manual', 'Evidence',
  'private', '{application}'
);
insert into app.evidence (
  id, tenant_id, profile_id, source_id, position, label, excerpt
) values (
  '68000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001',
  '58000000-0000-0000-0000-000000000001', 0, 'Launch', 'Shipped launch'
);
insert into app.claims (
  id, tenant_id, profile_id, position, statement, level, sensitivity,
  allowed_uses
) values (
  '78000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001', 0, 'Shipped launch',
  'verified', 'private', '{application}'
);
insert into app.claim_evidence (
  tenant_id, profile_id, claim_id, evidence_id, position
) values (
  '28000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001',
  '78000000-0000-0000-0000-000000000001',
  '68000000-0000-0000-0000-000000000001', 0
);
insert into app.applications (
  id, tenant_id, company, role, raw_text, accent,
  create_idempotency_key, create_input_hash
) values
  (
    '88000000-0000-0000-0000-000000000001',
    '28000000-0000-0000-0000-000000000001',
    'Decision Co', 'Engineer', 'Decision role', '#21504b',
    '88000000-0000-0000-0000-000000000011', repeat('a', 64)
  ),
  (
    '88000000-0000-0000-0000-000000000002',
    '28000000-0000-0000-0000-000000000001',
    'Other Co', 'Engineer', 'Other role', '#21504b',
    '88000000-0000-0000-0000-000000000012', repeat('b', 64)
  );
insert into app.opportunities (
  id, tenant_id, application_id, application_revision, company, role,
  extraction_status
) values
  (
    '88000000-0000-0000-0000-000000000001',
    '28000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000001', 1,
    'Decision Co', 'Engineer', 'ready'
  ),
  (
    '88000000-0000-0000-0000-000000000002',
    '28000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000002', 1,
    'Other Co', 'Engineer', 'ready'
  );
insert into app.workflow_runs (
  id, tenant_id, opportunity_id, profile_id, state, status, token_budget,
  cost_budget_micros, deadline_at
) values (
  '98000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '88000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001', 'review', 'blocked', 10000, 0,
  now() + interval '1 hour'
);
insert into app.workflow_runs (
  id, tenant_id, opportunity_id, profile_id, state, status, token_budget,
  cost_budget_micros, deadline_at
) values
  (
    '98000000-0000-0000-0000-000000000002',
    '28000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000001',
    '48000000-0000-0000-0000-000000000001', 'review', 'blocked', 10000, 0,
    now() + interval '1 hour'
  ),
  (
    '98000000-0000-0000-0000-000000000003',
    '28000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000001',
    '48000000-0000-0000-0000-000000000001', 'review', 'blocked', 10000, 0,
    now() + interval '1 hour'
  ),
  (
    '98000000-0000-0000-0000-000000000004',
    '28000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000002',
    '48000000-0000-0000-0000-000000000001', 'review', 'blocked', 10000, 0,
    now() + interval '1 hour'
  );
insert into app.artifacts (
  id, tenant_id, workflow_run_id, kind, version, body, created_by
) values
  ('a9000000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000001', 'strategy', 1, '{"fixture":true}', 'recruiter_strategist'),
  ('a9000000-0000-0000-0000-000000000002', '28000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000001', 'page_spec', 1, '{"blocks":[{"type":"fit","claimIds":["78000000-0000-0000-0000-000000000001"]}]}', 'page_composer');
insert into app.page_specs (
  id, tenant_id, workflow_run_id, version, spec, input_hash,
  source_artifact_id
) values (
  'a8000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001', 1,
  '{"blocks":[{"type":"fit","claimIds":["78000000-0000-0000-0000-000000000001"]}]}'::jsonb,
  repeat('c', 64), 'a9000000-0000-0000-0000-000000000002'
);
insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values (
  '28000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000001',
  '78000000-0000-0000-0000-000000000001'
);
insert into app.page_spec_evidence (
  tenant_id, page_spec_id, claim_id, evidence_id, position
) values (
  '28000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000001',
  '78000000-0000-0000-0000-000000000001',
  '68000000-0000-0000-0000-000000000001', 0
);
insert into app.strategy_approvals (
  id, tenant_id, workflow_run_id, strategy_artifact_id,
  strategy_artifact_hash, idempotency_key, approved_by
)
select 'aa000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001', id,
  encode(digest(body::text, 'sha256'), 'hex'),
  'aa000000-0000-0000-0000-000000000011',
  '18000000-0000-0000-0000-000000000001'
from app.artifacts where id = 'a9000000-0000-0000-0000-000000000001';
insert into app.workflow_steps (
  id, tenant_id, workflow_run_id, stage, status, idempotency_key, input,
  input_hash, output_artifact_id, completed_at, page_spec_id
)
select 'ab000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001', 'page-composer', 'completed',
  'hitl-page-composer', fixture.input,
  encode(digest(fixture.input::text, 'sha256'), 'hex'),
  'a9000000-0000-0000-0000-000000000002', now(),
  'a8000000-0000-0000-0000-000000000001'
from (
  select jsonb_build_object(
    'strategyArtifactId', 'a9000000-0000-0000-0000-000000000001',
    'strategyArtifactHash', encode(digest(body::text, 'sha256'), 'hex'),
    'strategyApprovalId', 'aa000000-0000-0000-0000-000000000001'
  ) input
  from app.artifacts where id = 'a9000000-0000-0000-0000-000000000001'
) fixture;
insert into app.reviews (
  id, tenant_id, page_spec_id, reviewer, verdict, issues, page_spec_hash
)
select review_id, '28000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000001', reviewer, verdict, issues,
  spec_hash
from app.page_specs cross join (values
  ('b8000000-0000-0000-0000-000000000001'::uuid, 'recruiter', 'changes_required', '[{"section":"hero.thesis","message":"Too generic","blocking":false}]'::jsonb),
  ('b8000000-0000-0000-0000-000000000002'::uuid, 'hiring_manager', 'pass', '[]'::jsonb),
  ('b8000000-0000-0000-0000-000000000003'::uuid, 'factuality', 'pass', '[]'::jsonb)
) review_rows(review_id, reviewer, verdict, issues)
where id = 'a8000000-0000-0000-0000-000000000001';

insert into app.page_specs (
  id, tenant_id, workflow_run_id, version, spec
) values
  (
    'a8000000-0000-0000-0000-000000000002',
    '28000000-0000-0000-0000-000000000001',
    '98000000-0000-0000-0000-000000000002', 1,
    '{"blocks":[{"type":"fit","claimIds":["78000000-0000-0000-0000-000000000001"]}]}'::jsonb
  ),
  (
    'a8000000-0000-0000-0000-000000000003',
    '28000000-0000-0000-0000-000000000001',
    '98000000-0000-0000-0000-000000000003', 1,
    '{"blocks":[{"type":"fit","claimIds":["78000000-0000-0000-0000-000000000001"]}]}'::jsonb
  );
insert into app.reviews (
  id, tenant_id, page_spec_id, reviewer, verdict, issues, page_spec_hash
)
select review_id, '28000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000002', reviewer, verdict, issues,
  spec_hash
from app.page_specs cross join (values
  ('b8000000-0000-0000-0000-000000000004'::uuid, 'recruiter', 'pass', '[]'::jsonb),
  ('b8000000-0000-0000-0000-000000000005'::uuid, 'hiring_manager', 'pass', '[]'::jsonb),
  ('b8000000-0000-0000-0000-000000000006'::uuid, 'factuality', 'changes_required', '[{"section":"blocks.evidence","message":"Never keep this","blocking":true}]'::jsonb)
) review_rows(review_id, reviewer, verdict, issues)
where id = 'a8000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', '18000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', '28000000-0000-0000-0000-000000000001', true);
set local role career_app;

do $$
declare target_hash text;
begin
  select spec_hash into target_hash from app.page_specs
  where id = 'a8000000-0000-0000-0000-000000000001';
  if app.page_spec_review_gate(
    '28000000-0000-0000-0000-000000000001',
    'a8000000-0000-0000-0000-000000000001', target_hash
  ) then raise exception 'unresolved recruiter objection passed the gate'; end if;
  begin
    insert into app.review_issue_decisions (
      tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
      issue_text, decision, decided_by, idempotency_key, input_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000002',
      'a8000000-0000-0000-0000-000000000002',
      'b8000000-0000-0000-0000-000000000006', 0, 'Never keep this',
      'keep', '18000000-0000-0000-0000-000000000001',
      'c8000000-0000-0000-0000-000000000001', 'factuality-keep'
    );
    raise exception 'factuality keep was accepted';
  exception when raise_exception then
    if sqlerrm <> 'factuality objections cannot be kept' then raise; end if;
  end;
  begin
    insert into app.review_issue_decisions (
      tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
      issue_text, decision, decided_by, idempotency_key, input_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000002',
      'a8000000-0000-0000-0000-000000000001',
      'b8000000-0000-0000-0000-000000000001', 0, 'Too generic',
      'keep', '18000000-0000-0000-0000-000000000001',
      'c8000000-0000-0000-0000-000000000004', 'wrong-run'
    );
    raise exception 'decision with a mismatched run was accepted';
  exception when raise_exception then
    if sqlerrm <> 'review issue decision run mismatch' then raise; end if;
  end;
  begin
    insert into app.review_issue_decisions (
      tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
      issue_text, decision, decided_by, idempotency_key, input_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'b8000000-0000-0000-0000-000000000001', 0, 'Too generic',
      'keep', '18000000-0000-0000-0000-000000000099',
      'c8000000-0000-0000-0000-000000000005', 'wrong-actor'
    );
    raise exception 'decision attributed to another user was accepted';
  exception when raise_exception then
    if sqlerrm <> 'review issue decision actor mismatch' then raise; end if;
  end;
  begin
    insert into app.review_issue_decisions (
      tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
      issue_text, decision, corrected_run_id, decided_by, idempotency_key,
      input_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'b8000000-0000-0000-0000-000000000001', 0, 'Too generic',
      'correct', '98000000-0000-0000-0000-000000000001',
      '18000000-0000-0000-0000-000000000001',
      'c8000000-0000-0000-0000-000000000007', 'self-correction'
    );
    raise exception 'a run was accepted as its own correction';
  exception when check_violation then null;
  end;
  begin
    insert into app.review_issue_decisions (
      tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
      issue_text, decision, corrected_run_id, decided_by, idempotency_key,
      input_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'b8000000-0000-0000-0000-000000000001', 0, 'Too generic',
      'correct', '98000000-0000-0000-0000-000000000004',
      '18000000-0000-0000-0000-000000000001',
      'c8000000-0000-0000-0000-000000000008', 'wrong-opportunity'
    );
    raise exception 'a correction with another opportunity was accepted';
  exception when raise_exception then
    if sqlerrm <> 'corrected run must preserve profile and opportunity' then raise; end if;
  end;
  begin
    insert into app.review_issue_decisions (
      tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
      issue_text, decision, decided_by, idempotency_key, input_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000001',
      'b8000000-0000-0000-0000-000000000001', 0, 'Changed text',
      'keep', '18000000-0000-0000-0000-000000000001',
      'c8000000-0000-0000-0000-000000000002', 'changed-text'
    );
    raise exception 'decision detached from immutable issue was accepted';
  exception when raise_exception then
    if sqlerrm <> 'review issue decision does not match an immutable issue' then raise; end if;
  end;
end $$;

reset role;
do $$
begin
  if has_schema_privilege('career_reviewer', 'app', 'usage') then
    raise exception 'legacy reviewer role retained app access';
  end if;
end $$;
do $$
declare target_hash text;
begin
  select spec_hash into target_hash from app.page_specs
  where id = 'a8000000-0000-0000-0000-000000000003';
  begin
    insert into app.reviews (
      tenant_id, page_spec_id, reviewer, verdict, issues, page_spec_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000003', 'recruiter', 'pass',
      '["unexpected"]'::jsonb, target_hash
    );
    raise exception 'passing review with issues was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into app.reviews (
      tenant_id, page_spec_id, reviewer, verdict, issues, page_spec_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      'a8000000-0000-0000-0000-000000000003', 'hiring_manager',
      'changes_required', '[]'::jsonb, target_hash
    );
    raise exception 'failing review without issues was accepted';
  exception when check_violation then null;
  end;
end $$;
insert into app.reviews (
  id, tenant_id, page_spec_id, reviewer, verdict, issues, page_spec_hash
)
select 'b8000000-0000-0000-0000-000000000007', tenant_id, id, 'recruiter',
  'changes_required', '["Legacy issue"]'::jsonb, spec_hash
from app.page_specs where id = 'a8000000-0000-0000-0000-000000000003';
set local role career_app;

do $$
begin
  begin
    insert into app.review_issue_decisions (
      tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
      issue_text, decision, decided_by, idempotency_key, input_hash
    ) values (
      '28000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000003',
      'a8000000-0000-0000-0000-000000000003',
      'b8000000-0000-0000-0000-000000000007', 0, 'Legacy issue',
      'keep', '18000000-0000-0000-0000-000000000001',
      'c8000000-0000-0000-0000-000000000006', 'legacy-issue'
    );
    raise exception 'legacy issue without targeting metadata was actionable';
  exception when raise_exception then
    if sqlerrm <> 'review issue decision does not match an immutable issue' then raise; end if;
  end;
end $$;

insert into app.review_issue_decisions (
  id, tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
  issue_text, decision, decided_by, idempotency_key, input_hash
) values (
  'd8000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000001',
  'b8000000-0000-0000-0000-000000000001', 0, 'Too generic', 'keep',
  '18000000-0000-0000-0000-000000000001',
  'c8000000-0000-0000-0000-000000000003', 'valid-keep'
);

do $$
declare target_hash text;
begin
  select spec_hash into target_hash from app.page_specs
  where id = 'a8000000-0000-0000-0000-000000000001';
  if app.page_spec_review_gate(
    '28000000-0000-0000-0000-000000000001',
    'a8000000-0000-0000-0000-000000000001', target_hash
  ) then raise exception 'legacy reviews passed the durable gate'; end if;
end $$;

reset role;
do $$
begin
  begin
    update app.review_issue_decisions set issue_text = 'Mutated'
    where id = 'd8000000-0000-0000-0000-000000000001';
    raise exception 'review decision mutation was accepted';
  exception when raise_exception then
    if sqlerrm <> 'review_issue_decisions rows are immutable' then raise; end if;
  end;
end $$;

set local role career_app;
do $$
begin
  begin
    perform app.approve_page_spec('a8000000-0000-0000-0000-000000000001');
    raise exception 'legacy reviews opened publication';
  exception when raise_exception then
    if sqlerrm <> 'approval requires passing reviews or explicit non-factual keeps'
    then raise; end if;
  end;
end $$;

reset role;
insert into app.page_specs (
  id, tenant_id, workflow_run_id, version, spec
) values (
  'a8000000-0000-0000-0000-000000000004',
  '28000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001', 2,
  '{"blocks":[{"type":"fit","claimIds":["78000000-0000-0000-0000-000000000001"]}]}'::jsonb
);
set local role career_app;
do $$
declare target_hash text;
begin
  select spec_hash into target_hash from app.page_specs
  where id = 'a8000000-0000-0000-0000-000000000001';
  if app.page_spec_review_gate(
    '28000000-0000-0000-0000-000000000001',
    'a8000000-0000-0000-0000-000000000001', target_hash
  ) then raise exception 'a superseded PageSpec passed the review gate'; end if;
end $$;

reset role;
delete from app.tenants where id = '28000000-0000-0000-0000-000000000001';
do $$
begin
  if exists(select 1 from app.review_issue_decisions
    where tenant_id = '28000000-0000-0000-0000-000000000001')
    or exists(select 1 from app.workflow_runs
      where tenant_id = '28000000-0000-0000-0000-000000000001') then
    raise exception 'tenant purge left HITL rows behind';
  end if;
end $$;

rollback;
select 'HITL review decisions ok' as result;
