import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { Client } from 'pg';
import { composeApprovedStrategyPage } from '../../lib/page-composer';
import { processPageComposerStep } from '../../lib/server/page-composer-worker';
import {
  decideReviewIssue,
  readPersistedRun,
  RunConflictError,
} from '../../lib/server/runs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

test('a correction creates one child PageSpec without rerunning upstream stages', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const databaseName = `career_os_correction_${suffix}`;
  const login = `page_correction_${suffix}`;
  const password = `worker-${randomUUID()}`;
  const admin = new Client({ connectionString: databaseUrl });
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${databaseName}`;
  const target = new Client({ connectionString: targetUrl.toString() });
  const workerUrl = new URL(targetUrl);
  workerUrl.username = login;
  workerUrl.password = password;
  try {
    await admin.connect();
    await admin.query(`create database ${databaseName}`);
    await target.connect();
    for (const migration of (await readdir('supabase/migrations'))
      .filter((name) => /^\d{4}_.*\.sql$/.test(name))
      .sort())
      await target.query(
        await readFile(`supabase/migrations/${migration}`, 'utf8'),
      );
    await target.query(
      `create role ${login} login noinherit password '${password}'
       in role career_page_composer`,
    );

    const ids = Object.fromEntries(
      [
        'owner',
        'tenant',
        'application',
        'opportunity',
        'profile',
        'source',
        'leadEvidence',
        'supportEvidence',
        'leadClaim',
        'supportClaim',
        'run',
        'researchArtifact',
        'evidenceArtifact',
        'strategyArtifact',
        'strategyApproval',
        'artifact',
        'page',
        'step',
        'reviewArtifact',
        'reviewStep',
        'review',
        'decisionKey',
      ].map((key) => [key, randomUUID()]),
    );
    await target.query(
      `insert into app.tenants(id,owner_id,name) values($1,$2,'Correction')`,
      [ids.tenant, ids.owner],
    );
    await target.query(
      `insert into app.applications(
         id,tenant_id,company,role,raw_text,accent,revision,
         create_idempotency_key,create_input_hash
       ) values($2,$1,'Northstar','Engineer','Build systems','#5847e8',1,$3,repeat('a',64))`,
      [ids.tenant, ids.application, randomUUID()],
    );
    await target.query(
      `insert into app.opportunities(
         id,tenant_id,application_id,application_revision,company,role,raw_text,
         extraction_status,accent
       ) values($2,$1,$3,1,'Northstar','Engineer','Build systems','ready','#5847e8')`,
      [ids.tenant, ids.opportunity, ids.application],
    );
    await target.query(
      `insert into app.profiles(
         id,tenant_id,name,headline,profile_kind,revision
       ) values($2,$1,'Ada','Product engineer','snapshot',1)`,
      [ids.tenant, ids.profile],
    );
    await target.query(
      `insert into app.sources(
         id,tenant_id,profile_id,position,kind,title,sensitivity,allowed_uses
       ) values($2,$1,$3,0,'document','CV','private',array['application'])`,
      [ids.tenant, ids.source, ids.profile],
    );
    await target.query(
      `insert into app.evidence(
         id,tenant_id,profile_id,source_id,position,label,excerpt
       ) values($2,$1,$4,$5,0,'Lead','Lead proof'),
         ($3,$1,$4,$5,1,'Support','Support proof')`,
      [
        ids.tenant,
        ids.leadEvidence,
        ids.supportEvidence,
        ids.profile,
        ids.source,
      ],
    );
    await target.query(
      `insert into app.claims(
         id,tenant_id,profile_id,position,statement,level,sensitivity,allowed_uses
       ) values($2,$1,$4,0,'Lead proof','verified','private',array['application']),
         ($3,$1,$4,1,'Support proof','verified','private',array['application'])`,
      [ids.tenant, ids.leadClaim, ids.supportClaim, ids.profile],
    );
    await target.query(
      `insert into app.claim_evidence(
         tenant_id,profile_id,claim_id,evidence_id,position,relation
       ) values($1,$2,$3,$4,0,'supports'),($1,$2,$5,$6,0,'supports')`,
      [
        ids.tenant,
        ids.profile,
        ids.leadClaim,
        ids.leadEvidence,
        ids.supportClaim,
        ids.supportEvidence,
      ],
    );
    await target.query(
      `insert into app.workflow_runs(
         id,tenant_id,opportunity_id,profile_id,state,status,token_budget,
         cost_budget_micros,deadline_at
       ) values($2,$1,$3,$4,'review_decision','awaiting_approval',300000,0,
         now()+interval '1 hour')`,
      [ids.tenant, ids.run, ids.opportunity, ids.profile],
    );
    await target.query(
      `insert into app.workflow_events(
         tenant_id,workflow_run_id,actor,event_type,summary,payload
       ) values($1,$2,'system','research_reused','Root research completed.',
         '{"costMicros":0}')`,
      [ids.tenant, ids.run],
    );
    const research = {
      company: 'Northstar',
      role: 'Engineer',
      source: { kind: 'job-posting', trust: 'untrusted-data' },
      signals: [
        {
          signalId: 'signal-1',
          statement: 'Build reliable systems',
          excerpt: 'Own reliable systems in production.',
          category: 'requirement',
          priority: 'high',
        },
      ],
    };
    const researchHash = (
      await target.query<{ hash: string }>(
        `insert into app.artifacts(
           id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
         ) values($1,$2,$3,'research',1,1,$4,'company_researcher')
         returning encode(digest(body::text,'sha256'),'hex') hash`,
        [ids.researchArtifact, ids.tenant, ids.run, research],
      )
    ).rows[0].hash;
    const evidenceArchive = {
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: ids.profile,
      researchArtifactId: ids.researchArtifact,
      researchArtifactHash: researchHash,
      signals: [
        {
          signalId: 'signal-1',
          coverage: 'verified_candidate',
          matches: [
            {
              claimId: ids.leadClaim,
              evidenceIds: [ids.leadEvidence],
              provenance: 'verified',
              relevanceScore: 100,
            },
          ],
        },
      ],
    };
    const evidenceHash = (
      await target.query<{ hash: string }>(
        `insert into app.artifacts(
           id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
         ) values($1,$2,$3,'evidence_archive',1,1,$4,'evidence_archivist')
         returning encode(digest(body::text,'sha256'),'hex') hash`,
        [ids.evidenceArtifact, ids.tenant, ids.run, evidenceArchive],
      )
    ).rows[0].hash;
    const strategy = {
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: ids.profile,
      researchArtifactId: ids.researchArtifact,
      researchArtifactHash: researchHash,
      evidenceArchiveArtifactId: ids.evidenceArtifact,
      evidenceArchiveArtifactHash: evidenceHash,
      copyPolicy: 'internal-editorial-direction',
      positioning: {
        message: 'Lead with reliable production systems ownership.',
        sourceSignalIds: ['signal-1'],
      },
      lead: {
        signalId: 'signal-1',
        claimId: ids.leadClaim,
        evidenceIds: [ids.leadEvidence],
        rationale: 'Direct evidence of reliable systems ownership.',
      },
      supports: [],
      gaps: [],
      omittedSignalIds: [],
    };
    const strategyHash = (
      await target.query<{ hash: string }>(
        `insert into app.artifacts(
           id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
         ) values($1,$2,$3,'strategy',1,1,$4,'recruiter_strategist')
         returning encode(digest(body::text,'sha256'),'hex') hash`,
        [ids.strategyArtifact, ids.tenant, ids.run, strategy],
      )
    ).rows[0].hash;
    await target.query(
      `insert into app.strategy_approvals(
         id,tenant_id,workflow_run_id,strategy_artifact_id,
         strategy_artifact_hash,idempotency_key,approved_by
       ) values($1,$2,$3,$4,$5,$6,$7)`,
      [
        ids.strategyApproval,
        ids.tenant,
        ids.run,
        ids.strategyArtifact,
        strategyHash,
        randomUUID(),
        ids.owner,
      ],
    );
    const baseInput = {
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: ids.profile,
      researchArtifactId: ids.researchArtifact,
      researchArtifactHash: researchHash,
      evidenceArchiveArtifactId: ids.evidenceArtifact,
      evidenceArchiveArtifactHash: evidenceHash,
      strategyArtifactId: ids.strategyArtifact,
      strategyArtifactHash: strategyHash,
      strategyApprovalId: ids.strategyApproval,
      candidateName: 'Ada',
      company: { name: 'Northstar', role: 'Engineer', accent: '#5847e8' },
      lead: {
        signalId: 'signal-1',
        claimId: ids.leadClaim,
        statement: 'Lead proof',
        provenance: 'verified',
        evidenceIds: [ids.leadEvidence],
      },
      supports: [
        {
          signalId: 'signal-2',
          claimId: ids.supportClaim,
          statement: 'Support proof',
          provenance: 'verified',
          evidenceIds: [ids.supportEvidence],
        },
      ],
    } as const;
    const sourcePage = composeApprovedStrategyPage(baseInput);
    const issue = {
      section: 'hero',
      message: 'Promote the supporting proof.',
      blocking: true,
      claimId: ids.leadClaim,
      evidenceIds: [ids.leadEvidence],
    };
    await target.query(
      `insert into app.artifacts(
         id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
       ) values($1,$2,$3,'page_spec',1,1,$4,'page_composer')`,
      [ids.artifact, ids.tenant, ids.run, sourcePage],
    );
    await target.query(
      `insert into app.page_specs(
         id,tenant_id,workflow_run_id,version,spec,input_hash,source_artifact_id
       ) values($1,$2,$3,1,$4,encode(digest($5::jsonb::text,'sha256'),'hex'),$6)`,
      [ids.page, ids.tenant, ids.run, sourcePage, baseInput, ids.artifact],
    );
    await target.query(
      `insert into app.workflow_steps(
         id,tenant_id,workflow_run_id,stage,status,idempotency_key,input,input_hash,
         output_artifact_id,page_spec_id,completed_at
       ) values($1,$2,$3,'page-composer','completed','source',$4,
         encode(digest($4::jsonb::text,'sha256'),'hex'),$5,$6,now())`,
      [ids.step, ids.tenant, ids.run, baseInput, ids.artifact, ids.page],
    );
    await target.query(
      `insert into app.artifacts(
         id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
       ) values($1,$2,$3,'review',1,1,'{}','recruiter_strategist')`,
      [ids.reviewArtifact, ids.tenant, ids.run],
    );
    await target.query(
      `insert into app.workflow_steps(
         id,tenant_id,workflow_run_id,stage,status,idempotency_key,input,input_hash,
         output_artifact_id,completed_at
       ) values($1,$2,$3,'recruiter-reviewer','completed','review-source','{}',
         encode(digest('{}'::jsonb::text,'sha256'),'hex'),$4,now())`,
      [ids.reviewStep, ids.tenant, ids.run, ids.reviewArtifact],
    );
    await target.query(
      `insert into app.reviews(
         id,tenant_id,workflow_run_id,workflow_step_id,output_artifact_id,
         page_spec_id,page_spec_hash,reviewer,verdict,issues
       ) select $1,$2,$3,$6,$7,$4,spec_hash,'recruiter','changes_required',$5
         from app.page_specs where id=$4`,
      [
        ids.review,
        ids.tenant,
        ids.run,
        ids.page,
        JSON.stringify([issue]),
        ids.reviewStep,
        ids.reviewArtifact,
      ],
    );
    await target.query(
      `insert into app.worker_heartbeats(service,last_seen_at)
       values('page-composer',clock_timestamp())`,
    );
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl.toString();
    let childId = '';
    try {
      const session = {
        userId: ids.owner,
        tenantId: ids.tenant,
        tenantName: 'Correction',
      };
      const input = {
        reviewId: ids.review,
        issueIndex: 0,
        decision: 'correct' as const,
      };
      const created = await decideReviewIssue(
        session,
        ids.run,
        input,
        ids.decisionKey,
      );
      assert.equal(created.created, true);
      assert.ok(created.decision.correctedRun);
      childId = created.decision.correctedRun.runId;
      assert.equal(created.decision.correctedRun.status, 'running');
      assert.equal(created.decision.correctedRun.stage, 'page_spec');
      assert.deepEqual(created.decision.correctedRun.steps, [
        { stage: 'page-composer', status: 'pending', attempt: 1 },
      ]);
      assert.ok(created.decision.correctedRun.research);
      assert.ok(created.decision.correctedRun.evidenceArchive);
      assert.ok(created.decision.correctedRun.strategy);

      const replay = await decideReviewIssue(
        session,
        ids.run,
        input,
        ids.decisionKey,
      );
      assert.equal(replay.created, false);
      assert.equal(replay.decision.correctedRun?.runId, childId);
      const recoveredWithNewKey = await decideReviewIssue(
        session,
        ids.run,
        input,
        randomUUID(),
      );
      assert.equal(recoveredWithNewKey.created, false);
      assert.equal(recoveredWithNewKey.decision.correctedRun?.runId, childId);
      await assert.rejects(
        decideReviewIssue(
          session,
          ids.run,
          { ...input, decision: 'keep' },
          ids.decisionKey,
        ),
        RunConflictError,
      );

      const recovered = await readPersistedRun(session, ids.run);
      assert.equal(recovered?.runId, childId);
      assert.ok(recovered?.research);
      assert.ok(recovered?.evidenceArchive);
      assert.ok(recovered?.strategy);
      assert.equal(recovered?.events[0].summary, 'Root research completed.');
      assert.ok(
        recovered?.events.some(
          ({ summary }) =>
            summary ===
            'Targeted PageSpec correction started from an immutable review issue.',
        ),
      );
    } finally {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    assert.ok(childId);
    await assert.rejects(
      target.query(
        `update app.workflow_runs set token_budget=token_budget-1 where id=$1`,
        [ids.run],
      ),
      /workflow run lineage is immutable/,
    );
    const outcome = await processPageComposerStep({
      databaseUrl: workerUrl.toString(),
      composePage: async (input) => composeApprovedStrategyPage(input),
    });
    assert.equal(outcome.status, 'completed');

    const result = await target.query(
      `select child.parent_run_id,child.revision_count,child.state,child.status,
        page.spec,page.invalidated_at,
        (select count(*)::integer from app.page_specs p
          where p.workflow_run_id=child.id) page_count,
        (select count(*)::integer from app.workflow_steps s
          where s.workflow_run_id=child.id and s.stage in
            ('company-researcher','evidence-archivist','recruiter-strategist')) upstream
       from app.workflow_runs child
       join app.page_specs page on page.workflow_run_id=child.id
       where child.id=$1`,
      [childId],
    );
    assert.equal(result.rows[0].parent_run_id, ids.run);
    assert.equal(result.rows[0].revision_count, 1);
    assert.deepEqual(
      { state: result.rows[0].state, status: result.rows[0].status },
      { state: 'page_spec_review', status: 'paused' },
    );
    assert.equal(result.rows[0].page_count, 1);
    assert.equal(result.rows[0].upstream, 0);
    assert.equal(result.rows[0].spec.hero.thesis, 'Support proof');
    const correctedPage = (
      await target.query(
        `select id,spec_hash from app.page_specs where workflow_run_id=$1`,
        [childId],
      )
    ).rows[0];
    const projectionDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl.toString();
    try {
      const recovered = await readPersistedRun(
        {
          userId: ids.owner,
          tenantId: ids.tenant,
          tenantName: 'Correction',
        },
        ids.run,
      );
      assert.equal(recovered?.runId, childId);
      assert.equal(recovered?.status, 'paused');
      assert.equal(recovered?.stage, 'page_spec_review');
      assert.equal(recovered?.spec?.hero.thesis, 'Support proof');
      assert.deepEqual(recovered?.steps, [
        { stage: 'page-composer', status: 'completed', attempt: 1 },
      ]);
      assert.ok(recovered?.research);
      assert.ok(recovered?.evidenceArchive);
      assert.ok(recovered?.strategy);
    } finally {
      process.env.DATABASE_URL = projectionDatabaseUrl;
    }
    await assert.rejects(
      target.query(
        `update app.page_specs set spec=jsonb_set(spec,'{hero,thesis}','"tampered"')
         where workflow_run_id=$1`,
        [childId],
      ),
      /PageSpec is immutable/,
    );
    assert.equal(
      (
        await target.query(
          'select invalidated_at is not null invalid from app.page_specs where id=$1',
          [ids.page],
        )
      ).rows[0].invalid,
      true,
    );
    await target.query(
      `select set_config('request.jwt.claim.sub',$1,false),
        set_config('request.jwt.claim.tenant_id',$2,false)`,
      [ids.owner, ids.tenant],
    );
    await target.query('set role career_app');
    assert.equal(
      (
        await target.query(
          'select app.start_page_spec_reviews($1,$2,$3) started',
          [ids.tenant, childId, randomUUID()],
        )
      ).rows[0].started,
      true,
    );
    await target.query('reset role');
    assert.deepEqual(
      (
        await target.query(
          `select array_agg(stage order by stage) stages,
            (select count(*)::integer from app.reviews
              where workflow_run_id=$1) reviews
           from app.workflow_steps where workflow_run_id=$1
             and stage like '%reviewer'`,
          [childId],
        )
      ).rows[0],
      { stages: ['recruiter-reviewer'], reviews: 0 },
    );
    const sourceHash = (
      await target.query(`select spec_hash from app.page_specs where id=$1`, [
        ids.page,
      ])
    ).rows[0].spec_hash;
    await assert.rejects(
      target.query(
        `insert into app.publications(tenant_id,page_spec_id,page_spec_hash)
         values($1,$2,$3)`,
        [ids.tenant, ids.page, sourceHash],
      ),
      /current immutable PageSpec hash/,
    );
    assert.equal(
      (
        await target.query(
          `select app.valid_page_composer_publication_lineage($1,$2) valid`,
          [ids.tenant, correctedPage.id],
        )
      ).rows[0].valid,
      true,
    );
    const childStrategyId = randomUUID();
    const childStrategyApprovalId = randomUUID();
    const childStrategyHash = (
      await target.query<{ hash: string }>(
        `insert into app.artifacts(
           id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
         ) values($1,$2,$3,'strategy',1,1,$4,'recruiter_strategist')
         returning encode(digest(body::text,'sha256'),'hex') hash`,
        [childStrategyId, ids.tenant, childId, strategy],
      )
    ).rows[0].hash;
    await target.query(
      `insert into app.strategy_approvals(
         id,tenant_id,workflow_run_id,strategy_artifact_id,
         strategy_artifact_hash,idempotency_key,approved_by
       ) values($1,$2,$3,$4,$5,$6,$7)`,
      [
        childStrategyApprovalId,
        ids.tenant,
        childId,
        childStrategyId,
        childStrategyHash,
        randomUUID(),
        ids.owner,
      ],
    );
    const composer = (
      await target.query<{ id: string; input: Record<string, unknown> }>(
        `select id,input from app.workflow_steps
         where workflow_run_id=$1 and stage='page-composer'`,
        [childId],
      )
    ).rows[0];
    const tamperedInput = structuredClone(composer.input) as Record<
      string,
      unknown
    > & {
      correction: Record<string, unknown>;
    };
    tamperedInput.strategyArtifactId = childStrategyId;
    tamperedInput.strategyArtifactHash = childStrategyHash;
    tamperedInput.strategyApprovalId = childStrategyApprovalId;
    tamperedInput.correction.pageSpecHash = '0'.repeat(64);
    await target.query(
      `update app.workflow_steps set input=$2,
         input_hash=encode(digest($2::jsonb::text,'sha256'),'hex')
       where id=$1`,
      [composer.id, tamperedInput],
    );
    assert.equal(
      (
        await target.query(
          `select app.valid_page_composer_publication_lineage($1,$2) valid`,
          [ids.tenant, correctedPage.id],
        )
      ).rows[0].valid,
      false,
      'schemaVersion 2 must not fall through to legacy strategy lineage',
    );
    const grandchildId = randomUUID();
    await target.query(
      `insert into app.workflow_runs(
         id,tenant_id,opportunity_id,profile_id,source_profile_id,
         source_profile_revision,parent_run_id,state,status,revision_count,
         token_budget,cost_budget_micros,deadline_at
       ) select $1,tenant_id,opportunity_id,profile_id,source_profile_id,
         source_profile_revision,id,'page_spec','running',revision_count+1,
         1,0,now()+interval '1 hour'
       from app.workflow_runs where id=$2`,
      [grandchildId, childId],
    );
    const replayDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl.toString();
    try {
      const session = {
        userId: ids.owner,
        tenantId: ids.tenant,
        tenantName: 'Correction',
      };
      const replay = await decideReviewIssue(
        session,
        ids.run,
        {
          reviewId: ids.review,
          issueIndex: 0,
          decision: 'correct',
        },
        ids.decisionKey,
      );
      assert.equal(replay.decision.correctedRun?.runId, childId);
      assert.equal(
        (await readPersistedRun(session, ids.run))?.runId,
        grandchildId,
      );
    } finally {
      process.env.DATABASE_URL = replayDatabaseUrl;
    }
  } finally {
    await target.end().catch(() => undefined);
    if (admin.database) {
      await admin
        .query(`drop database if exists ${databaseName} with (force)`)
        .catch(() => undefined);
      await admin.query(`drop role if exists ${login}`).catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
});
