\set ON_ERROR_STOP on

begin;

insert into app.tenants (id, owner_id, name) values (
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000002',
  'Career Memory test'
);
insert into app.profiles (
  id, tenant_id, name, headline, profile_kind, revision
) values (
  'ee000000-0000-4000-8000-000000000003',
  'ee000000-0000-4000-8000-000000000001',
  'Test User', 'Engineer', 'living', 1
);
insert into app.claims (
  id, tenant_id, profile_id, position, statement, kind, level,
  sensitivity, allowed_uses
) values (
  'ee000000-0000-4000-8000-000000000004',
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000003', 0,
  'Aucune preuve ne soutient encore cette affirmation.',
  'result', 'unsupported', 'private', '{application}'
);
insert into app.profile_revisions (
  tenant_id, profile_id, revision, snapshot
) values (
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000003', 1,
  '{"name":"Test User","claims":[]}'
);

set local session_replication_role = replica;
insert into app.applications (
  id, tenant_id, company, role, raw_text, accent,
  create_idempotency_key, create_input_hash
) values (
  'ee000000-0000-4000-8000-000000000008',
  'ee000000-0000-4000-8000-000000000001',
  'Test Co', 'Engineer', 'Test role', '#5847e8', gen_random_uuid(), repeat('a', 64)
);
insert into app.opportunities (
  id, tenant_id, application_id, application_revision,
  company, role, raw_text, extraction_status
) values (
  'ee000000-0000-4000-8000-000000000005',
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000008', 1,
  'Test Co', 'Engineer', 'Test role', 'ready'
);
insert into app.workflow_runs (
  id, tenant_id, opportunity_id, state, status, token_budget,
  cost_budget_micros, deadline_at
) values (
  'ee000000-0000-4000-8000-000000000006',
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000005',
  'publication_ready', 'completed', 1, 0, now() + interval '1 hour'
);
insert into app.page_specs (
  id, tenant_id, workflow_run_id, version, spec
) values (
  'ee000000-0000-4000-8000-000000000007',
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000006', 1,
  '{"blocks":[]}'::jsonb
);
insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values (
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000007',
  'ee000000-0000-4000-8000-000000000004'
);
set local session_replication_role = origin;

do $$ begin
  begin
    insert into app.publications (tenant_id, page_spec_id) values (
      'ee000000-0000-4000-8000-000000000001',
      'ee000000-0000-4000-8000-000000000007'
    );
    raise exception 'unsupported claim was published';
  exception when others then
    if sqlerrm = 'unsupported claim was published' then raise; end if;
    if sqlerrm <> 'publication contains inferred or unsupported claims' then
      raise;
    end if;
  end;
end $$;

do $$ begin
  begin
    update app.profile_revisions set snapshot = '{}' where tenant_id =
      'ee000000-0000-4000-8000-000000000001';
    raise exception 'revision history was mutable';
  exception when others then
    if sqlerrm = 'revision history was mutable' then raise; end if;
    if sqlerrm <> 'Career Memory revision history is immutable' then raise; end if;
  end;
end $$;

select 1 / ((select count(*) from app.profile_revisions where tenant_id =
  'ee000000-0000-4000-8000-000000000001') = 1)::integer;

rollback;
select 'Career Memory keeps unsupported claims and immutable revisions' as result;
