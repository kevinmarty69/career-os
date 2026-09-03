import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const databaseName = `career_os_page_composer_${suffix}`;
const workerLogin = `page_composer_${suffix}`;
const workerPassword = `worker_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ connectionString: databaseUrl });
const testUrl = new URL(databaseUrl);
testUrl.pathname = `/${databaseName}`;
const target = new Client({ connectionString: testUrl.toString() });
const workerUrl = new URL(testUrl);
workerUrl.username = workerLogin;
workerUrl.password = workerPassword;
const workers = [];

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const ownerId = randomUUID();
const applicationId = randomUUID();
const opportunityId = randomUUID();
const staleApplicationId = randomUUID();
const staleOpportunityId = randomUUID();
const profileId = randomUUID();
const runId = randomUUID();
const legacyRunId = randomUUID();
const legacyPageSpecId = randomUUID();
const legacyPublicationId = randomUUID();
const researchId = randomUUID();
const archiveId = randomUUID();
const strategyId = randomUUID();
const sourceId = randomUUID();
const evidenceId = randomUUID();
const unusedEvidenceId = randomUUID();
const claimId = randomUUID();
const supportClaimId = randomUUID();

async function restrictedWorker() {
  const worker = new Client({ connectionString: workerUrl.toString() });
  await worker.connect();
  workers.push(worker);
  await assert.rejects(
    worker.query('select * from app.workflow_steps'),
    /permission denied|does not exist/,
  );
  await worker.query('set role career_page_composer');
  return worker;
}

async function digestArtifact(id) {
  const result = await target.query(
    `select encode(digest(body::text, 'sha256'), 'hex') hash
     from app.artifacts where id = $1`,
    [id],
  );
  return result.rows[0].hash;
}

try {
  await admin.connect();
  await admin.query(`create database ${databaseName}`);
  await target.connect();
  const migrations = (await readdir('supabase/migrations'))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  assert.equal(migrations.at(-1)?.slice(0, 4), '0015');
  for (const migration of migrations.slice(0, -1))
    await target.query(
      await readFile(`supabase/migrations/${migration}`, 'utf8'),
    );

  await target.query(
    `insert into app.tenants (id, owner_id, name) values
      ($1, $2, 'Composer tenant'), ($3, $2, 'Other tenant')`,
    [tenantId, ownerId, otherTenantId],
  );
  await target.query(
    `insert into app.applications (
       id, tenant_id, company, role, raw_text, accent, revision,
       create_idempotency_key, create_input_hash
     ) values
       ($1,$2,'Northstar','Staff Engineer','Build systems.','#21504b',1,
         $3, repeat('a', 64)),
       ($4,$2,'Legacy','Engineer','Older snapshot.','#ff0000',2,
         $5, repeat('b', 64))`,
    [applicationId, tenantId, randomUUID(), staleApplicationId, randomUUID()],
  );
  await target.query(
    `insert into app.opportunities (
       id, tenant_id, application_id, application_revision, company, role,
       raw_text, extraction_status
     ) values
       ($1,$2,$3,1,'Northstar','Staff Engineer','Build systems.','ready'),
       ($4,$2,$5,1,'Legacy','Engineer','Older snapshot.','ready')`,
    [
      opportunityId,
      tenantId,
      applicationId,
      staleOpportunityId,
      staleApplicationId,
    ],
  );
  await target.query(
    `insert into app.profiles
      (id,tenant_id,name,headline,profile_kind,revision)
     values ($1,$2,'Kevin','Product engineer','snapshot',1)`,
    [profileId, tenantId],
  );
  await target.query(
    `insert into app.sources
      (id,tenant_id,profile_id,position,kind,title,sensitivity,allowed_uses)
     values ($1,$2,$3,0,'document','CV','private',array['application'])`,
    [sourceId, tenantId, profileId],
  );
  await target.query(
    `insert into app.evidence
      (id,tenant_id,profile_id,source_id,position,label,excerpt)
     values ($1,$2,$3,$4,0,'Incident review','Reliable systems in production.'),
       ($5,$2,$3,$4,1,'Unused proof','This proof was not selected.')`,
    [evidenceId, tenantId, profileId, sourceId, unusedEvidenceId],
  );
  await target.query(
    `insert into app.claims
      (id,tenant_id,profile_id,position,statement,level,sensitivity,allowed_uses)
     values ($1,$2,$3,0,'Built reliable distributed systems.',
       'verified','private',array['application']),
       ($4,$2,$3,1,'Operated reliable systems in production.',
       'verified','private',array['application'])`,
    [claimId, tenantId, profileId, supportClaimId],
  );
  await target.query(
    `insert into app.claim_evidence
      (tenant_id,profile_id,claim_id,evidence_id,position,relation)
     values ($1,$2,$3,$4,0,'supports'),($1,$2,$3,$5,1,'supports'),
       ($1,$2,$6,$4,0,'supports')`,
    [
      tenantId,
      profileId,
      claimId,
      evidenceId,
      unusedEvidenceId,
      supportClaimId,
    ],
  );
  await target.query(
    `insert into app.workflow_runs
      (id,tenant_id,opportunity_id,profile_id,state,status,token_budget,
       cost_budget_micros,deadline_at)
     values ($1,$2,$3,$4,'page_spec_review','paused',1,0,
       now()+interval '1 hour')`,
    [legacyRunId, tenantId, opportunityId, profileId],
  );
  await target.query(
    `insert into app.page_specs (id,tenant_id,workflow_run_id,version,spec,input_hash)
     values ($1,$2,$3,1,
       jsonb_build_object('version',1,'blocks',jsonb_build_array(
         jsonb_build_object('type','fit','title','Legacy','claimIds',jsonb_build_array($4::text))
       )),
       repeat('a',64))`,
    [legacyPageSpecId, tenantId, legacyRunId, claimId],
  );
  await target.query(
    `insert into app.page_spec_claims (tenant_id,page_spec_id,claim_id)
     values ($1,$2,$3)`,
    [tenantId, legacyPageSpecId, claimId],
  );
  const legacyHash = (
    await target.query('select spec_hash from app.page_specs where id=$1', [
      legacyPageSpecId,
    ])
  ).rows[0].spec_hash;
  await target.query(
    `insert into app.reviews
      (tenant_id,page_spec_id,reviewer,verdict,issues,page_spec_hash)
     select $1,$2,reviewer,'pass','[]',$3 from unnest(
       array['recruiter','hiring_manager','factuality']
     ) reviewer`,
    [tenantId, legacyPageSpecId, legacyHash],
  );
  await target.query(
    `insert into app.approvals (tenant_id,page_spec_id,page_spec_hash,approved_by)
     values ($1,$2,$3,$4)`,
    [tenantId, legacyPageSpecId, legacyHash, ownerId],
  );
  await target.query(
    `select set_config('request.jwt.claim.sub',$1,false),
      set_config('request.jwt.claim.tenant_id',$2,false)`,
    [ownerId, tenantId],
  );
  await target.query(
    `insert into app.publications
      (id,tenant_id,page_spec_id,page_spec_hash,publication_payload)
     values ($1,$2,$3,$4,'{}')`,
    [legacyPublicationId, tenantId, legacyPageSpecId, legacyHash],
  );
  await target.query(
    `insert into app.share_links
      (tenant_id,publication_id,token_hash,expires_at)
     values ($1,$2,digest('legacy-token','sha256'),now()+interval '1 day')`,
    [tenantId, legacyPublicationId],
  );

  await target.query(
    await readFile(`supabase/migrations/${migrations.at(-1)}`, 'utf8'),
  );
  assert.equal(
    (
      await target.query('select accent from app.opportunities where id=$1', [
        opportunityId,
      ])
    ).rows[0].accent,
    '#21504b',
  );
  assert.equal(
    (
      await target.query('select accent from app.opportunities where id=$1', [
        staleOpportunityId,
      ])
    ).rows[0].accent,
    '#5847e8',
  );
  assert.deepEqual(
    (
      await target.query(
        `select publication.revoked_at is not null publication_revoked,
          link.revoked_at is not null link_revoked
         from app.publications publication join app.share_links link
           on link.publication_id=publication.id
         where publication.id=$1`,
        [legacyPublicationId],
      )
    ).rows[0],
    { publication_revoked: true, link_revoked: true },
  );
  await target.query(
    `create role ${workerLogin} login noinherit password '${workerPassword}'
     in role career_page_composer`,
  );

  const acl = await target.query(
    `select
       has_schema_privilege('career_page_composer','app','usage') schema_usage,
       has_schema_privilege('career_page_composer','app','create') schema_create,
       exists (
         select 1 from pg_class relation
         join pg_namespace namespace on namespace.oid=relation.relnamespace
         where namespace.nspname in ('app','auth')
           and relation.relkind in ('r','p','v','m','f')
           and (has_table_privilege('career_page_composer', relation.oid,
             'select,insert,update,delete,truncate,references,trigger')
             or has_any_column_privilege('career_page_composer', relation.oid,
               'select,insert,update,references'))
       ) table_access,
       array(
         select procedure.proname::text from pg_proc procedure
         join pg_namespace namespace on namespace.oid=procedure.pronamespace
         where namespace.nspname='app'
           and has_function_privilege('career_page_composer',procedure.oid,'execute')
         order by procedure.proname
       ) functions`,
  );
  assert.deepEqual(acl.rows[0], {
    schema_usage: true,
    schema_create: false,
    table_access: false,
    functions: [
      'claim_page_composer_step',
      'complete_page_composer_step',
      'fail_page_composer_step',
      'reap_expired_page_composer_step',
    ],
  });
  assert.equal(
    (
      await target.query(
        `select has_table_privilege('career_worker','app.workflow_steps','select')
          or has_table_privilege('career_worker','app.workflow_steps','insert')
          or has_table_privilege('career_worker','app.workflow_steps','update') allowed`,
      )
    ).rows[0].allowed,
    false,
  );

  await target.query(
    `insert into app.workflow_runs
      (id,tenant_id,opportunity_id,profile_id,state,status,token_budget,
       cost_budget_micros,deadline_at)
     values ($1,$2,$3,$4,'strategy_review','paused',300000,0,
       now()+interval '1 hour')`,
    [runId, tenantId, opportunityId, profileId],
  );

  const research = {
    company: 'Northstar',
    role: 'Staff Engineer',
    signals: [
      {
        statement: 'Build reliable distributed systems.',
        excerpt: 'Build reliable distributed systems.',
        category: 'requirement',
        priority: 'high',
      },
      {
        statement: 'Operate reliable systems in production.',
        excerpt: 'Operate reliable systems in production.',
        category: 'responsibility',
        priority: 'medium',
      },
    ],
    source: { kind: 'job-posting', trust: 'untrusted-data' },
  };
  await target.query(
    `insert into app.artifacts
      (id,tenant_id,workflow_run_id,kind,version,body,created_by)
     values ($1,$2,$3,'research',1,$4,'company_researcher')`,
    [researchId, tenantId, runId, research],
  );
  const researchHash = await digestArtifact(researchId);
  const archive = {
    schemaVersion: 1,
    purpose: 'application',
    profileSnapshotId: profileId,
    researchArtifactId: researchId,
    researchArtifactHash: researchHash,
    signals: [
      {
        signalId: 'signal-1',
        coverage: 'verified_candidate',
        matches: [
          {
            claimId,
            evidenceIds: [evidenceId, unusedEvidenceId],
            provenance: 'verified',
            relevanceScore: 90,
          },
        ],
      },
      {
        signalId: 'signal-2',
        coverage: 'verified_candidate',
        matches: [
          {
            claimId: supportClaimId,
            evidenceIds: [evidenceId],
            provenance: 'verified',
            relevanceScore: 80,
          },
        ],
      },
    ],
  };
  await target.query(
    `insert into app.artifacts
      (id,tenant_id,workflow_run_id,kind,version,body,created_by)
     values ($1,$2,$3,'evidence_archive',1,$4,'evidence_archivist')`,
    [archiveId, tenantId, runId, archive],
  );
  const archiveHash = await digestArtifact(archiveId);
  const strategyInput = {
    schemaVersion: 1,
    purpose: 'application',
    profileSnapshotId: profileId,
    researchArtifactId: researchId,
    researchArtifactHash: researchHash,
    evidenceArchiveArtifactId: archiveId,
    evidenceArchiveArtifactHash: archiveHash,
    company: 'Northstar',
    role: 'Staff Engineer',
    signals: [
      {
        signalId: 'signal-1',
        statement: research.signals[0].statement,
        excerpt: research.signals[0].excerpt,
        category: 'requirement',
        priority: 'high',
        coverage: 'verified_candidate',
        matches: [
          {
            claimId,
            statement: 'Built reliable distributed systems.',
            provenance: 'verified',
            evidence: [
              {
                evidenceId,
                label: 'Incident review',
                excerpt: 'Reliable systems in production.',
              },
              {
                evidenceId: unusedEvidenceId,
                label: 'Unused proof',
                excerpt: 'This proof was not selected.',
              },
            ],
          },
        ],
      },
      {
        signalId: 'signal-2',
        statement: research.signals[1].statement,
        excerpt: research.signals[1].excerpt,
        category: 'responsibility',
        priority: 'medium',
        coverage: 'verified_candidate',
        matches: [
          {
            claimId: supportClaimId,
            statement: 'Operated reliable systems in production.',
            provenance: 'verified',
            evidence: [
              {
                evidenceId,
                label: 'Incident review',
                excerpt: 'Reliable systems in production.',
              },
            ],
          },
        ],
      },
    ],
  };
  const strategy = {
    schemaVersion: 1,
    purpose: 'application',
    profileSnapshotId: profileId,
    researchArtifactId: researchId,
    researchArtifactHash: researchHash,
    evidenceArchiveArtifactId: archiveId,
    evidenceArchiveArtifactHash: archiveHash,
    copyPolicy: 'internal-editorial-direction',
    positioning: {
      message: 'Lead with reliable distributed systems delivery.',
      sourceSignalIds: ['signal-1'],
    },
    lead: {
      signalId: 'signal-1',
      claimId,
      evidenceIds: [evidenceId],
      rationale: 'Direct evidence for reliable distributed systems.',
    },
    supports: [
      {
        signalId: 'signal-2',
        claimId: supportClaimId,
        evidenceIds: [evidenceId],
        rationale: 'Shared evidence also supports production operations.',
      },
    ],
    gaps: [],
    omittedSignalIds: [],
  };
  await target.query(
    `insert into app.artifacts
      (id,tenant_id,workflow_run_id,kind,version,body,created_by)
     values ($1,$2,$3,'strategy',1,$4,'recruiter_strategist')`,
    [strategyId, tenantId, runId, strategy],
  );
  const strategyHash = await digestArtifact(strategyId);
  const strategyInputHash = (
    await target.query(
      `select encode(digest($1::jsonb::text,'sha256'),'hex') hash`,
      [strategyInput],
    )
  ).rows[0].hash;
  await target.query(
    `insert into app.workflow_steps
      (tenant_id,workflow_run_id,stage,status,idempotency_key,input,input_hash,
       output_artifact_id,completed_at)
     values ($1,$2,'recruiter-strategist','completed','strategy-fixture',$3,$4,$5,now())`,
    [tenantId, runId, strategyInput, strategyInputHash, strategyId],
  );

  await target.query(
    `select set_config('request.jwt.claim.sub',$1,false),
      set_config('request.jwt.claim.tenant_id',$2,false)`,
    [ownerId, tenantId],
  );
  await target.query('set role career_app');
  const approvalKey = randomUUID();
  await assert.rejects(
    target.query('select app.approve_recruiter_strategy($1,$2,$3,$4,$5)', [
      otherTenantId,
      runId,
      strategyId,
      strategyHash,
      approvalKey,
    ]),
    /invalid strategy approval/,
  );
  assert.equal(
    (
      await target.query(
        'select app.approve_recruiter_strategy($1,$2,$3,$4,$5) created',
        [tenantId, runId, strategyId, strategyHash, approvalKey],
      )
    ).rows[0].created,
    true,
  );
  assert.equal(
    (
      await target.query(
        'select app.approve_recruiter_strategy($1,$2,$3,$4,$5) created',
        [tenantId, runId, strategyId, strategyHash, approvalKey],
      )
    ).rows[0].created,
    false,
  );
  await assert.rejects(
    target.query('select app.approve_recruiter_strategy($1,$2,$3,$4,$5)', [
      tenantId,
      runId,
      strategyId,
      strategyHash,
      randomUUID(),
    ]),
    /strategy approval conflict/,
  );
  await target.query('reset role');

  const storedStep = await target.query(
    `select input,octet_length(convert_to(input::text,'UTF8')) bytes
     from app.workflow_steps where workflow_run_id=$1 and stage='page-composer'`,
    [runId],
  );
  assert.equal(storedStep.rows[0].bytes <= 64 * 1024, true);
  assert.deepEqual(
    Object.keys(storedStep.rows[0].input).sort(),
    [
      'candidateName',
      'company',
      'evidenceArchiveArtifactHash',
      'evidenceArchiveArtifactId',
      'lead',
      'profileSnapshotId',
      'purpose',
      'researchArtifactHash',
      'researchArtifactId',
      'schemaVersion',
      'strategyApprovalId',
      'strategyArtifactHash',
      'strategyArtifactId',
      'supports',
    ].sort(),
  );
  assert.equal('positioning' in storedStep.rows[0].input, false);
  assert.equal('gaps' in storedStep.rows[0].input, false);
  assert.equal('rationale' in storedStep.rows[0].input.lead, false);
  assert.equal(
    (
      await target.query(
        `select app.valid_page_composer_input(
          jsonb_set($1::jsonb,'{schemaVersion}','"1"'::jsonb)
        ) valid`,
        [storedStep.rows[0].input],
      )
    ).rows[0].valid,
    false,
  );
  assert.equal(
    (
      await target.query(
        `select app.valid_page_composer_input(
          $1::jsonb || jsonb_build_object('instructions',repeat('x',70000))
        ) valid`,
        [storedStep.rows[0].input],
      )
    ).rows[0].valid,
    false,
  );

  const workerA = await restrictedWorker();
  const workerB = await restrictedWorker();
  const claims = await Promise.all([
    workerA.query('select * from app.claim_page_composer_step(300)'),
    workerB.query('select * from app.claim_page_composer_step(300)'),
  ]);
  assert.deepEqual(claims.map((claim) => claim.rowCount).sort(), [0, 1]);
  const leased = claims.find((claim) => claim.rowCount === 1).rows[0];
  assert.equal('tenant_id' in leased, false);
  const expectedOutput = (
    await target.query('select app.materialize_page_composer_spec($1) output', [
      leased.input,
    ])
  ).rows[0].output;
  assert.equal(expectedOutput.hero.eyebrow, 'Private application');
  assert.equal(
    expectedOutput.hero.thesis,
    'Built reliable distributed systems.',
  );
  assert.deepEqual(expectedOutput.blocks, [
    {
      type: 'fit',
      title: 'Relevant experience',
      claimIds: [claimId, supportClaimId],
    },
  ]);
  await assert.rejects(
    workerA.query('select app.complete_page_composer_step($1,$2,$3)', [
      leased.step_id,
      leased.lease_token,
      {
        ...expectedOutput,
        hero: { ...expectedOutput.hero, thesis: 'Forged copy.' },
      },
    ]),
    /invalid page composer output/,
  );
  await assert.rejects(
    workerA.query('select app.complete_page_composer_step($1,$2,$3)', [
      leased.step_id,
      randomUUID(),
      expectedOutput,
    ]),
    /lease token mismatch/,
  );
  const completions = await Promise.all([
    workerA.query('select app.complete_page_composer_step($1,$2,$3) id', [
      leased.step_id,
      leased.lease_token,
      expectedOutput,
    ]),
    workerB.query('select app.complete_page_composer_step($1,$2,$3) id', [
      leased.step_id,
      leased.lease_token,
      expectedOutput,
    ]),
  ]);
  assert.equal(completions[0].rows[0].id, completions[1].rows[0].id);
  const pageSpecId = completions[0].rows[0].id;

  const materialized = await target.query(
    `select page.spec,page.source_artifact_id,step.output_artifact_id,
      (select count(*)::integer from app.page_spec_claims where page_spec_id=page.id) claims,
      (select count(*)::integer from app.page_spec_evidence
       where page_spec_id=page.id) evidence_links,
      (select count(distinct evidence_id)::integer from app.page_spec_evidence
       where page_spec_id=page.id) unique_evidence,
      (select count(*)::integer from app.model_usage usage
       join app.workflow_steps step on step.id=usage.workflow_step_id
       where step.stage='page-composer') usages
     from app.page_specs page join app.workflow_steps step
       on step.page_spec_id=page.id and step.stage='page-composer'
     where page.id=$1`,
    [pageSpecId],
  );
  assert.deepEqual(materialized.rows[0], {
    spec: expectedOutput,
    source_artifact_id: materialized.rows[0].output_artifact_id,
    output_artifact_id: materialized.rows[0].output_artifact_id,
    claims: 2,
    evidence_links: 2,
    unique_evidence: 1,
    usages: 0,
  });
  assert.deepEqual(
    (
      await target.query(
        'select status,state from app.workflow_runs where id=$1',
        [runId],
      )
    ).rows[0],
    { status: 'paused', state: 'page_spec_review' },
  );
  const pageSpecHash = (
    await target.query('select spec_hash from app.page_specs where id=$1', [
      pageSpecId,
    ])
  ).rows[0].spec_hash;
  await target.query(
    `insert into app.reviews (tenant_id,page_spec_id,reviewer,verdict,issues,page_spec_hash)
     select $1,$2,reviewer,'pass','[]',$3 from unnest(
       array['recruiter','hiring_manager','factuality']
     ) reviewer`,
    [tenantId, pageSpecId, pageSpecHash],
  );
  await target.query(
    `insert into app.approvals (tenant_id,page_spec_id,page_spec_hash,approved_by)
     values ($1,$2,$3,$4)`,
    [tenantId, pageSpecId, pageSpecHash, ownerId],
  );
  await target.query(
    `insert into app.publications (tenant_id,page_spec_id,page_spec_hash)
     values ($1,$2,$3)`,
    [tenantId, pageSpecId, pageSpecHash],
  );
  const payload = (
    await target.query('select app.build_publication_payload($1) payload', [
      pageSpecId,
    ])
  ).rows[0].payload;
  assert.deepEqual(payload.profile.claims[0].evidenceIds, [evidenceId]);
  assert.deepEqual(payload.profile.claims[1].evidenceIds, [evidenceId]);
  assert.equal(payload.profile.evidence.length, 1);
  assert.deepEqual(
    payload.profile.evidence.map((proof) => proof.id),
    [evidenceId],
  );

  const forgedRun = randomUUID();
  await target.query(
    `insert into app.workflow_runs
      (id,tenant_id,opportunity_id,profile_id,state,status,token_budget,
       cost_budget_micros,deadline_at)
     values ($1,$2,$3,$4,'page_spec','running',1,0,now()+interval '1 hour')`,
    [forgedRun, tenantId, opportunityId, profileId],
  );
  await target.query(
    `insert into app.workflow_steps
      (tenant_id,workflow_run_id,stage,status,idempotency_key,input,input_hash)
     values ($1,$2,'page-composer','pending','forged-lineage',$3,
       encode(digest($3::jsonb::text,'sha256'),'hex'))`,
    [tenantId, forgedRun, storedStep.rows[0].input],
  );
  const forgedLease = (
    await workerA.query('select * from app.claim_page_composer_step(300)')
  ).rows[0];
  await assert.rejects(
    workerA.query('select app.complete_page_composer_step($1,$2,$3)', [
      forgedLease.step_id,
      forgedLease.lease_token,
      expectedOutput,
    ]),
    /page composer lineage rejected/,
  );
  await workerA.query('select app.fail_page_composer_step($1,$2,$3)', [
    forgedLease.step_id,
    forgedLease.lease_token,
    'invalid_lineage',
  ]);
  await workerA.query('select app.fail_page_composer_step($1,$2,$3)', [
    forgedLease.step_id,
    forgedLease.lease_token,
    'invalid_lineage',
  ]);
  await assert.rejects(
    workerA.query('select app.fail_page_composer_step($1,$2,$3)', [
      forgedLease.step_id,
      forgedLease.lease_token,
      'different_failure',
    ]),
    /page composer failure conflict/,
  );

  const expiredRun = randomUUID();
  await target.query(
    `insert into app.workflow_runs
      (id,tenant_id,opportunity_id,profile_id,state,status,token_budget,
       cost_budget_micros,deadline_at)
     values ($1,$2,$3,$4,'page_spec','running',1,0,now()-interval '1 second')`,
    [expiredRun, tenantId, opportunityId, profileId],
  );
  await target.query(
    `insert into app.workflow_steps
      (tenant_id,workflow_run_id,stage,status,idempotency_key,input,input_hash)
     values ($1,$2,'page-composer','pending','expired',$3,
       encode(digest($3::jsonb::text,'sha256'),'hex'))`,
    [tenantId, expiredRun, storedStep.rows[0].input],
  );
  const reaped = await Promise.all([
    workerA.query('select app.reap_expired_page_composer_step() id'),
    workerB.query('select app.reap_expired_page_composer_step() id'),
  ]);
  assert.equal(reaped.filter((result) => result.rows[0].id !== null).length, 1);
  assert.deepEqual(
    (
      await target.query(
        'select status,state from app.workflow_runs where id=$1',
        [expiredRun],
      )
    ).rows[0],
    { status: 'failed', state: 'page_spec' },
  );

  console.log('page composer SQL security and durability checks passed');
} finally {
  await Promise.allSettled(workers.map((worker) => worker.end()));
  await target.end().catch(() => undefined);
  await admin
    .query(`drop database if exists ${databaseName} with (force)`)
    .catch(() => undefined);
  await admin
    .query(`drop role if exists ${workerLogin}`)
    .catch(() => undefined);
  await admin.end().catch(() => undefined);
}
