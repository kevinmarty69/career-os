import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from 'pg';
import { composeApprovedStrategyPage } from '../../lib/page-composer';
import { LocalOpenAIRecruiterStrategyClient } from '../../lib/server/local-openai-strategy-client';
import { processPageComposerStep } from '../../lib/server/page-composer-worker';
import { processRecruiterStrategyStep } from '../../lib/server/strategy-worker';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

test('the recruiter strategist is tenant-safe, durable and exactly-once', async () => {
  const databaseName = `career_os_strategy_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const admin = new Client({ connectionString: databaseUrl });
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${databaseName}`;
  const target = new Client({ connectionString: targetUrl.toString() });
  const workerLogin = `strategy_worker_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const workerPassword = `worker-${randomUUID()}`;
  const workerUrl = new URL(targetUrl);
  workerUrl.username = workerLogin;
  workerUrl.password = workerPassword;
  const composerLogin = `page_composer_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const composerPassword = `worker-${randomUUID()}`;
  const composerUrl = new URL(targetUrl);
  composerUrl.username = composerLogin;
  composerUrl.password = composerPassword;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const ownerId = randomUUID();
  const profileId = randomUUID();
  const applicationId = randomUUID();
  const opportunityId = randomUUID();
  const runId = randomUUID();
  const researchId = randomUUID();
  const evidenceArchiveId = randomUUID();
  const sourceId = randomUUID();
  const evidenceId = randomUUID();
  const claimId = randomUUID();
  let worker: Client | undefined;
  let providerCalls = 0;
  const fake = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      providerCalls += 1;
      const envelope = JSON.parse(raw) as {
        messages: Array<{ content: string }>;
      };
      const input = JSON.parse(envelope.messages[1].content) as {
        signals: Array<{
          signalId: string;
          matches: Array<{
            claimId: string;
            evidence: Array<{ evidenceId: string }>;
          }>;
        }>;
      };
      const signal = input.signals[0];
      const match = signal.matches[0];
      const content = {
        positioning: {
          message: 'Lead with reliable distributed systems delivery.',
          sourceSignalIds: [signal.signalId],
        },
        lead: {
          signalId: signal.signalId,
          claimId: match.claimId,
          evidenceIds: [match.evidence[0].evidenceId],
          rationale: 'Direct evidence for reliable distributed systems.',
        },
        supports: [],
        gaps: [],
        omittedSignalIds: [],
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'strategy-request-1',
          choices: [{ message: { content: JSON.stringify(content) } }],
          usage: {
            prompt_tokens: 80,
            completion_tokens: 40,
            total_tokens: 120,
          },
        }),
      );
    });
  });

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
      `create role ${workerLogin} login noinherit password '${workerPassword}'
       in role career_recruiter_strategist`,
    );
    await target.query(
      `create role ${composerLogin} login noinherit password '${composerPassword}'
       in role career_page_composer`,
    );
    worker = new Client({ connectionString: workerUrl.toString() });
    await worker.connect();
    await assert.rejects(
      worker.query('select * from app.workflow_steps'),
      /permission denied/,
    );

    await target.query(
      `insert into app.tenants (id, owner_id, name) values
        ($1, $2, 'Strategy tenant'), ($3, $2, 'Other tenant')`,
      [tenantId, ownerId, otherTenantId],
    );
    await target.query(
      `insert into app.profiles
        (id, tenant_id, name, headline, profile_kind, revision)
       values ($1, $2, 'Kevin', 'Product engineer', 'snapshot', 1)`,
      [profileId, tenantId],
    );
    await target.query(
      `insert into app.sources
        (id, tenant_id, profile_id, position, kind, title, sensitivity, allowed_uses)
       values ($1, $2, $3, 0, 'document', 'CV', 'private', array['application'])`,
      [sourceId, tenantId, profileId],
    );
    await target.query(
      `insert into app.evidence
        (id, tenant_id, profile_id, source_id, position, label, excerpt)
       values ($1, $2, $3, $4, 0, 'Incident review',
        'Reliable distributed systems in production.')`,
      [evidenceId, tenantId, profileId, sourceId],
    );
    await target.query(
      `insert into app.claims
        (id, tenant_id, profile_id, position, statement, level, sensitivity, allowed_uses)
       values ($1, $2, $3, 0, 'Built reliable distributed systems.',
        'verified', 'private', array['application'])`,
      [claimId, tenantId, profileId],
    );
    await target.query(
      `insert into app.claim_evidence
        (tenant_id, profile_id, claim_id, evidence_id, position, relation)
       values ($1, $2, $3, $4, 0, 'supports')`,
      [tenantId, profileId, claimId, evidenceId],
    );
    await target.query(
      `insert into app.applications
        (id, tenant_id, company, role, raw_text, accent,
         create_idempotency_key, create_input_hash)
       values ($1, $2, 'Northstar', 'Staff Engineer', 'Build systems', '#5847e8',
         $3, repeat('a', 64))`,
      [applicationId, tenantId, randomUUID()],
    );
    await target.query(
      `insert into app.opportunities
        (id, tenant_id, application_id, application_revision,
         company, role, raw_text, extraction_status)
       values ($1, $2, $3, 1, 'Northstar', 'Staff Engineer',
         'Build systems', 'ready')`,
      [opportunityId, tenantId, applicationId],
    );
    await target.query(
      `insert into app.workflow_runs
        (id, tenant_id, opportunity_id, profile_id, state, status,
         token_budget, cost_budget_micros, deadline_at)
       values ($1, $2, $3, $4, 'strategy', 'paused', 300000, 0,
         now() + interval '1 hour')`,
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
      ],
      source: { kind: 'job-posting', trust: 'untrusted-data' },
    };
    await target.query(
      `insert into app.artifacts
        (id, tenant_id, workflow_run_id, kind, version, body, created_by)
       values ($1, $2, $3, 'research', 1, $4::jsonb, 'company_researcher')`,
      [researchId, tenantId, runId, JSON.stringify(research)],
    );
    const researchHash = (
      await target.query(
        `select encode(digest(body::text, 'sha256'), 'hex') hash
         from app.artifacts where id = $1`,
        [researchId],
      )
    ).rows[0].hash as string;
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
        (id, tenant_id, workflow_run_id, kind, version, body, created_by)
       values ($1, $2, $3, 'evidence_archive', 1, $4::jsonb,
        'evidence_archivist')`,
      [evidenceArchiveId, tenantId, runId, JSON.stringify(archive)],
    );
    const archiveHash = (
      await target.query(
        `select encode(digest(body::text, 'sha256'), 'hex') hash
         from app.artifacts where id = $1`,
        [evidenceArchiveId],
      )
    ).rows[0].hash as string;

    await target.query(
      `select set_config('request.jwt.claim.sub', $1, false),
        set_config('request.jwt.claim.tenant_id', $2, false)`,
      [ownerId, tenantId],
    );
    await target.query('set role career_app');
    await assert.rejects(
      target.query(
        `select app.confirm_evidence_archive_selection($1,$2,$3,$4,$5)`,
        [tenantId, runId, evidenceArchiveId, 'f'.repeat(64), randomUUID()],
      ),
      /evidence archive selection unavailable/,
    );
    await assert.rejects(
      target.query(
        `select app.confirm_evidence_archive_selection($1,$2,$3,$4,$5)`,
        [otherTenantId, runId, evidenceArchiveId, archiveHash, randomUUID()],
      ),
      /invalid evidence archive selection/,
    );
    const selectionKey = randomUUID();
    const created = await target.query(
      `select app.confirm_evidence_archive_selection($1,$2,$3,$4,$5) created`,
      [tenantId, runId, evidenceArchiveId, archiveHash, selectionKey],
    );
    assert.equal(created.rows[0].created, true);
    const replay = await target.query(
      `select app.confirm_evidence_archive_selection($1,$2,$3,$4,$5) created`,
      [tenantId, runId, evidenceArchiveId, archiveHash, selectionKey],
    );
    assert.equal(replay.rows[0].created, false);
    await target.query('reset role');

    await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const address = fake.address();
    assert(address && typeof address !== 'string');
    const client = new LocalOpenAIRecruiterStrategyClient({
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'local-test',
      model: 'fake-strategist',
    });
    const outcomes = await Promise.all([
      processRecruiterStrategyStep({
        databaseUrl: workerUrl.toString(),
        client,
      }),
      processRecruiterStrategyStep({
        databaseUrl: workerUrl.toString(),
        client,
      }),
    ]);
    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), [
      'completed',
      'idle',
    ]);
    assert.equal(providerCalls, 1);

    const [strategy] = (
      await target.query(
        `select id, body, encode(digest(body::text, 'sha256'), 'hex') hash
         from app.artifacts where workflow_run_id = $1 and kind = 'strategy'`,
        [runId],
      )
    ).rows as Array<{
      id: string;
      body: Record<string, unknown>;
      hash: string;
    }>;
    assert(strategy);
    const state = await target.query(
      `select status, state, used_tokens, used_cost_micros::text,
        reserved_tokens, reserved_cost_micros::text
       from app.workflow_runs where id = $1`,
      [runId],
    );
    assert.deepEqual(state.rows[0], {
      status: 'paused',
      state: 'strategy_review',
      used_tokens: 120,
      used_cost_micros: '0',
      reserved_tokens: 0,
      reserved_cost_micros: '0',
    });
    const ledger = await target.query(
      `select count(*)::integer count, min(usage_basis) usage_basis,
        min(cost_micros)::text cost_micros
       from app.model_usage where workflow_run_id = $1`,
      [runId],
    );
    assert.deepEqual(ledger.rows[0], {
      count: 1,
      usage_basis: 'actual',
      cost_micros: '0',
    });
    const reservation = await target.query(
      `select status, actual_tokens, actual_cost_micros::text
       from app.run_budget_reservations where workflow_run_id = $1`,
      [runId],
    );
    assert.deepEqual(reservation.rows[0], {
      status: 'settled',
      actual_tokens: 120,
      actual_cost_micros: '0',
    });

    const completedStep = await target.query(
      `select id, lease_owner from app.workflow_steps
       where workflow_run_id = $1 and stage = 'recruiter-strategist'`,
      [runId],
    );
    const forged = structuredClone(strategy.body);
    forged.researchArtifactHash = 'e'.repeat(64);
    await target.query('set role career_recruiter_strategist');
    await assert.rejects(
      target.query(
        `select app.complete_recruiter_strategist_step(
          $1,$2,$3::jsonb,80,40,0,0,false,'strategy-request-1'
        )`,
        [
          completedStep.rows[0].id,
          completedStep.rows[0].lease_owner,
          JSON.stringify(forged),
        ],
      ),
      /invalid recruiter strategist lineage/,
    );
    await target.query('reset role');

    await target.query('set role career_app');
    await assert.rejects(
      target.query(`select app.approve_recruiter_strategy($1,$2,$3,$4,$5)`, [
        tenantId,
        runId,
        strategy.id,
        'd'.repeat(64),
        randomUUID(),
      ]),
      /strategy approval artifact unavailable/,
    );
    const approvalKey = randomUUID();
    const approved = await target.query(
      `select app.approve_recruiter_strategy($1,$2,$3,$4,$5) approved`,
      [tenantId, runId, strategy.id, strategy.hash, approvalKey],
    );
    assert.equal(approved.rows[0].approved, true);
    const approvalReplay = await target.query(
      `select app.approve_recruiter_strategy($1,$2,$3,$4,$5) approved`,
      [tenantId, runId, strategy.id, strategy.hash, approvalKey],
    );
    assert.equal(approvalReplay.rows[0].approved, false);
    await assert.rejects(
      target.query(`select app.approve_recruiter_strategy($1,$2,$3,$4,$5)`, [
        tenantId,
        runId,
        strategy.id,
        strategy.hash,
        randomUUID(),
      ]),
      /strategy approval conflict/,
    );
    await target.query('reset role');
    const approvedRun = await target.query(
      'select status, state from app.workflow_runs where id = $1',
      [runId],
    );
    assert.deepEqual(approvedRun.rows[0], {
      status: 'running',
      state: 'page_spec',
    });
    const composerStep = await target.query(
      `select status, stage from app.workflow_steps
       where workflow_run_id = $1 and stage = 'page-composer'`,
      [runId],
    );
    assert.deepEqual(composerStep.rows, [
      { status: 'pending', stage: 'page-composer' },
    ]);
    const composed = await processPageComposerStep({
      databaseUrl: composerUrl.toString(),
      composePage: async (input) => composeApprovedStrategyPage(input),
    });
    assert.equal(composed.status, 'completed');
    assert.equal(composed.runId, runId);
    const composedRun = await target.query(
      `select run.status, run.state, page.spec
       from app.workflow_runs run
       join app.page_specs page on page.workflow_run_id = run.id
       where run.id = $1`,
      [runId],
    );
    assert.equal(composedRun.rows[0].status, 'paused');
    assert.equal(composedRun.rows[0].state, 'page_spec_review');
    assert.equal(
      composedRun.rows[0].spec.hero.thesis,
      'Built reliable distributed systems.',
    );

    const hostileRunId = randomUUID();
    const hostileResearchId = randomUUID();
    const hostileArchiveId = randomUUID();
    await target.query(
      `insert into app.workflow_runs
        (id, tenant_id, opportunity_id, profile_id, state, status,
         token_budget, cost_budget_micros, deadline_at)
       values ($1, $2, $3, $4, 'strategy', 'paused', 200000, 0,
         now() + interval '1 hour')`,
      [hostileRunId, tenantId, opportunityId, profileId],
    );
    await target.query(
      `insert into app.artifacts
        (id, tenant_id, workflow_run_id, kind, version, body, created_by)
       values ($1, $2, $3, 'research', 1, $4::jsonb, 'company_researcher')`,
      [hostileResearchId, tenantId, hostileRunId, JSON.stringify(research)],
    );
    const hostileResearchHash = (
      await target.query(
        `select encode(digest(body::text, 'sha256'), 'hex') hash
         from app.artifacts where id = $1`,
        [hostileResearchId],
      )
    ).rows[0].hash as string;
    const hostileArchive = {
      ...archive,
      researchArtifactId: hostileResearchId,
      researchArtifactHash: hostileResearchHash,
    };
    await target.query(
      `insert into app.artifacts
        (id, tenant_id, workflow_run_id, kind, version, body, created_by)
       values ($1, $2, $3, 'evidence_archive', 1, $4::jsonb,
        'evidence_archivist')`,
      [
        hostileArchiveId,
        tenantId,
        hostileRunId,
        JSON.stringify(hostileArchive),
      ],
    );
    const hostileArchiveHash = (
      await target.query(
        `select encode(digest(body::text, 'sha256'), 'hex') hash
         from app.artifacts where id = $1`,
        [hostileArchiveId],
      )
    ).rows[0].hash as string;
    await target.query('set role career_app');
    await target.query(
      `select app.confirm_evidence_archive_selection($1,$2,$3,$4,$5)`,
      [
        tenantId,
        hostileRunId,
        hostileArchiveId,
        hostileArchiveHash,
        randomUUID(),
      ],
    );
    await target.query('reset role');
    await target.query('set role career_recruiter_strategist');
    const hostileClaim = await target.query(
      'select * from app.claim_recruiter_strategist_step(300)',
    );
    assert.equal(hostileClaim.rows[0].workflow_run_id, hostileRunId);
    await target.query(
      `select app.mark_recruiter_strategist_in_flight(
        $1,$2,'openai-compatible-local','hostile-worker',1000,0
      )`,
      [hostileClaim.rows[0].step_id, hostileClaim.rows[0].lease_token],
    );
    const hostileInput = hostileClaim.rows[0].input as {
      profileSnapshotId: string;
      researchArtifactId: string;
      researchArtifactHash: string;
      evidenceArchiveArtifactId: string;
      evidenceArchiveArtifactHash: string;
      signals: Array<{
        signalId: string;
        matches: Array<{
          claimId: string;
          evidence: Array<{ evidenceId: string }>;
        }>;
      }>;
    };
    const hostileSignal = hostileInput.signals[0];
    const hostileMatch = hostileSignal.matches[0];
    const unsupportedStrategy = {
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: hostileInput.profileSnapshotId,
      researchArtifactId: hostileInput.researchArtifactId,
      researchArtifactHash: hostileInput.researchArtifactHash,
      evidenceArchiveArtifactId: hostileInput.evidenceArchiveArtifactId,
      evidenceArchiveArtifactHash: hostileInput.evidenceArchiveArtifactHash,
      copyPolicy: 'internal-editorial-direction',
      positioning: {
        message: 'Lead with a fabricated 100% success rate.',
        sourceSignalIds: [hostileSignal.signalId],
      },
      lead: {
        signalId: hostileSignal.signalId,
        claimId: hostileMatch.claimId,
        evidenceIds: [hostileMatch.evidence[0].evidenceId],
        rationale: 'Direct evidence for reliable distributed systems.',
      },
      supports: [],
      gaps: [],
      omittedSignalIds: [],
    };
    await assert.rejects(
      target.query(
        `select app.complete_recruiter_strategist_step(
          $1,$2,$3::jsonb,10,10,0,0,false,'forged-request'
        )`,
        [
          hostileClaim.rows[0].step_id,
          hostileClaim.rows[0].lease_token,
          JSON.stringify(unsupportedStrategy),
        ],
      ),
      /invalid recruiter strategist grounding/,
    );
    await assert.rejects(
      target.query(
        `select app.complete_recruiter_strategist_step(
          $1,$2,$3::jsonb,10,10,0,0,false,'forged-request'
        )`,
        [
          hostileClaim.rows[0].step_id,
          hostileClaim.rows[0].lease_token,
          JSON.stringify({
            ...unsupportedStrategy,
            positioning: {
              ...unsupportedStrategy.positioning,
              message: true,
            },
          }),
        ],
      ),
      /invalid recruiter strategist completion/,
    );
    await target.query(
      `select app.fail_recruiter_strategist_step($1,$2,'hostile_test_cleanup')`,
      [hostileClaim.rows[0].step_id, hostileClaim.rows[0].lease_token],
    );
    await target.query('reset role');

    const ceilingRunId = randomUUID();
    const ceilingStepId = randomUUID();
    const ceilingLease = randomUUID();
    await target.query(
      `insert into app.workflow_runs
        (id, tenant_id, opportunity_id, profile_id, state, status,
         token_budget, cost_budget_micros, deadline_at)
       values ($1, $2, $3, $4, 'strategy', 'running', 200000, 0,
         now() + interval '1 hour')`,
      [ceilingRunId, tenantId, opportunityId, profileId],
    );
    await target.query(
      `insert into app.workflow_steps
        (id, tenant_id, workflow_run_id, stage, status, idempotency_key,
         input, input_hash, lease_owner, lease_expires_at)
       values ($1, $2, $3, 'recruiter-strategist', 'leased', $4,
         '{}'::jsonb, repeat('b', 64), $5, now() + interval '5 minutes')`,
      [ceilingStepId, tenantId, ceilingRunId, randomUUID(), ceilingLease],
    );
    await target.query('set role career_recruiter_strategist');
    await target.query(
      `select app.mark_recruiter_strategist_in_flight(
        $1,$2,'openai-compatible-local','fake-strategist',132096,0
      )`,
      [ceilingStepId, ceilingLease],
    );
    await target.query(
      `select app.fail_recruiter_strategist_step($1,$2,'test_cleanup')`,
      [ceilingStepId, ceilingLease],
    );
    await target.query('reset role');
    const ceilingReservation = await target.query(
      `select requested_tokens, status from app.run_budget_reservations
       where workflow_run_id = $1`,
      [ceilingRunId],
    );
    assert.deepEqual(ceilingReservation.rows[0], {
      requested_tokens: 132096,
      status: 'settled',
    });

    const invalidRunId = randomUUID();
    const invalidStepId = randomUUID();
    await target.query(
      `insert into app.workflow_runs
        (id, tenant_id, opportunity_id, profile_id, state, status,
         token_budget, cost_budget_micros, deadline_at)
       values ($1, $2, $3, $4, 'strategy', 'running', 200000, 0,
         now() + interval '1 hour')`,
      [invalidRunId, tenantId, opportunityId, profileId],
    );
    await target.query(
      `insert into app.workflow_steps
        (id, tenant_id, workflow_run_id, stage, status, idempotency_key,
         input, input_hash)
       values ($1, $2, $3, 'recruiter-strategist', 'pending', $4,
         '{}'::jsonb, repeat('c', 64))`,
      [invalidStepId, tenantId, invalidRunId, randomUUID()],
    );
    const invalidOutcome = await processRecruiterStrategyStep({
      databaseUrl: workerUrl.toString(),
      client,
    });
    assert.deepEqual(invalidOutcome, {
      status: 'failed',
      runId: invalidRunId,
      stepId: invalidStepId,
      failureCode: 'invalid_step_input',
    });
    assert.equal(providerCalls, 1);
    const invalidState = await target.query(
      `select run.status run_status, step.status step_status, step.failure_code
       from app.workflow_runs run
       join app.workflow_steps step on step.workflow_run_id = run.id
       where run.id = $1`,
      [invalidRunId],
    );
    assert.deepEqual(invalidState.rows[0], {
      run_status: 'failed',
      step_status: 'failed',
      failure_code: 'invalid_step_input',
    });
  } finally {
    await new Promise<void>((resolve) => fake.close(() => resolve())).catch(
      () => undefined,
    );
    await worker?.end().catch(() => undefined);
    await target.end().catch(() => undefined);
    await admin
      .query(`drop database if exists ${databaseName} with (force)`)
      .catch(() => undefined);
    await admin
      .query(`drop role if exists ${workerLogin}`)
      .catch(() => undefined);
    await admin
      .query(`drop role if exists ${composerLogin}`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
