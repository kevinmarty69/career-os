begin;

do $$
declare
  lead_id uuid := '60000000-0000-4000-8000-000000000001';
  support_id uuid := '60000000-0000-4000-8000-000000000002';
  candidate jsonb;
  source_spec jsonb;
  output jsonb;
begin
  candidate := jsonb_build_object(
    'schemaVersion', 1, 'purpose', 'application',
    'profileSnapshotId', '10000000-0000-4000-8000-000000000001',
    'researchArtifactId', '20000000-0000-4000-8000-000000000001',
    'researchArtifactHash', repeat('a',64),
    'evidenceArchiveArtifactId', '30000000-0000-4000-8000-000000000001',
    'evidenceArchiveArtifactHash', repeat('b',64),
    'strategyArtifactId', '40000000-0000-4000-8000-000000000001',
    'strategyArtifactHash', repeat('c',64),
    'strategyApprovalId', '50000000-0000-4000-8000-000000000001',
    'candidateName', 'Kevin',
    'company', jsonb_build_object(
      'name','Northstar','role','Engineer','accent','#5847e8'
    ),
    'lead', jsonb_build_object(
      'signalId','signal-1','claimId',lead_id,'statement','Lead proof',
      'provenance','verified','evidenceIds',jsonb_build_array(
        '70000000-0000-4000-8000-000000000001'
      )
    ),
    'supports', jsonb_build_array(jsonb_build_object(
      'signalId','signal-2','claimId',support_id,'statement','Support proof',
      'provenance','verified','evidenceIds',jsonb_build_array(
        '70000000-0000-4000-8000-000000000002'
      )
    ))
  );
  source_spec := app.materialize_page_composer_spec(candidate);
  candidate := jsonb_set(candidate,'{schemaVersion}','2'::jsonb) ||
    jsonb_build_object('correction',jsonb_build_object(
      'decisionId','80000000-0000-4000-8000-000000000001',
      'parentRunId','90000000-0000-4000-8000-000000000001',
      'pageSpecId','a0000000-0000-4000-8000-000000000001',
      'pageSpecHash',repeat('d',64),
      'pageSpecArtifactId','b0000000-0000-4000-8000-000000000001',
      'pageSpecArtifactHash',repeat('e',64),
      'reviewId','c0000000-0000-4000-8000-000000000001',
      'issueIndex',0,
      'issue',jsonb_build_object(
        'section','hero','message','Replace hero','blocking',true,
        'claimId',lead_id,'evidenceIds',jsonb_build_array(
          '70000000-0000-4000-8000-000000000001'
        )
      ),
      'pageSpec',source_spec
    ));
  if not app.valid_page_composer_correction_input(candidate) then
    raise exception 'valid correction input rejected';
  end if;
  output := app.materialize_page_composer_correction(candidate);
  if output #>> '{hero,thesis}' <> 'Support proof'
    or output - 'hero' is distinct from source_spec - 'hero' then
    raise exception 'hero correction escaped its section';
  end if;
  if app.valid_page_composer_correction_input(jsonb_set(
    candidate,'{correction,issue,claimId}',to_jsonb(support_id::text)
  )) then raise exception 'hero accepted a non-hero claim'; end if;

  candidate := jsonb_set(candidate,'{correction,issue}',jsonb_build_object(
    'section','relevant_experience','message','Remove support','blocking',true,
    'claimId',support_id,'evidenceIds',jsonb_build_array(
      '70000000-0000-4000-8000-000000000002'
    )
  ));
  output := app.materialize_page_composer_correction(candidate);
  if output #> '{blocks,0,claimIds}' <> jsonb_build_array(lead_id::text)
    or output - 'blocks' is distinct from source_spec - 'blocks' then
    raise exception 'experience correction escaped its section';
  end if;
end $$;

insert into app.tenants (id,owner_id,name) values
  ('d0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002','Correction lineage');
insert into app.applications (
  id,tenant_id,company,role,raw_text,accent,revision,create_idempotency_key,
  create_input_hash
) values (
  'd0000000-0000-4000-8000-000000000005',
  'd0000000-0000-4000-8000-000000000001','Company','Role','Text','#5847e8',1,
  'd0000000-0000-4000-8000-000000000006',repeat('a',64)
);
insert into app.opportunities (
  id,tenant_id,application_id,application_revision,company,role,raw_text,
  extraction_status
) values (
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000005',1,
  'Company','Role','Text','ready'
);
insert into app.profiles (
  id,tenant_id,name,headline,profile_kind,revision
) values (
  'd0000000-0000-4000-8000-000000000004',
  'd0000000-0000-4000-8000-000000000001','Candidate','Engineer','snapshot',1
);
insert into app.workflow_runs (
  id,tenant_id,opportunity_id,profile_id,state,status,token_budget,
  cost_budget_micros,deadline_at
) values (
  'd0000000-0000-4000-8000-000000000010',
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000004',
  'research','running',200000,0,now()+interval '1 hour'
);
insert into app.workflow_runs (
  id,tenant_id,opportunity_id,profile_id,parent_run_id,revision_count,
  state,status,token_budget,cost_budget_micros,deadline_at
) values (
  'd0000000-0000-4000-8000-000000000011',
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000004',
  'd0000000-0000-4000-8000-000000000010',1,
  'page_spec','running',200000,0,now()+interval '1 hour'
);

do $$ begin
  begin
    update app.workflow_runs set revision_count=2
    where id='d0000000-0000-4000-8000-000000000011';
    raise exception 'lineage mutation was accepted';
  exception when others then
    if sqlerrm = 'lineage mutation was accepted' then raise; end if;
  end;
end $$;

do $$
declare tenant uuid := 'd0000000-0000-4000-8000-000000000001';
  opportunity uuid := 'd0000000-0000-4000-8000-000000000003';
  profile uuid := 'd0000000-0000-4000-8000-000000000004';
begin
  begin
    insert into app.workflow_runs (
      tenant_id,opportunity_id,profile_id,parent_run_id,revision_count,
      state,status,token_budget,cost_budget_micros,deadline_at
    ) values (
      tenant,opportunity,profile,
      'd0000000-0000-4000-8000-000000000011',2,
      'page_spec','running',200001,0,now()+interval '1 hour'
    );
    raise exception 'oversized child budget was accepted';
  exception when others then
    if sqlerrm = 'oversized child budget was accepted' then raise; end if;
  end;
  insert into app.workflow_runs (
    id,tenant_id,opportunity_id,profile_id,parent_run_id,revision_count,
    state,status,token_budget,cost_budget_micros,deadline_at
  ) values (
    'd0000000-0000-4000-8000-000000000012',tenant,opportunity,profile,
    'd0000000-0000-4000-8000-000000000011',2,
    'page_spec','running',200000,0,now()+interval '1 hour'
  ),(
    'd0000000-0000-4000-8000-000000000013',tenant,opportunity,profile,
    'd0000000-0000-4000-8000-000000000012',3,
    'page_spec','running',200000,0,now()+interval '1 hour'
  );
  begin
    insert into app.workflow_runs (
      tenant_id,opportunity_id,profile_id,parent_run_id,revision_count,
      state,status,token_budget,cost_budget_micros,deadline_at
    ) values (
      tenant,opportunity,profile,
      'd0000000-0000-4000-8000-000000000013',4,
      'page_spec','running',200000,0,now()+interval '1 hour'
    );
    raise exception 'fourth correction was accepted';
  exception when others then
    if sqlerrm = 'fourth correction was accepted' then raise; end if;
  end;
end $$;

rollback;
