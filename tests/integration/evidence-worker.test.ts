import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { Client } from 'pg';
import { buildEvidenceArchive } from '../../lib/evidence-archive';
import { processEvidenceArchivistStep } from '../../lib/server/evidence-worker';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

test('the evidence archivist keeps only permitted proof and writes no model usage', async () => {
  const databaseName = `career_os_evidence_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const admin = new Client({ connectionString: databaseUrl });
  const testUrl = new URL(databaseUrl);
  testUrl.pathname = `/${databaseName}`;
  const target = new Client({ connectionString: testUrl.toString() });
  const workerLogin = `evidence_worker_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const workerPassword = `worker-${randomUUID()}`;
  const extraRole = `extra_worker_role_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const workerUrl = new URL(testUrl);
  workerUrl.username = workerLogin;
  workerUrl.password = workerPassword;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const ownerId = randomUUID();
  const profileId = randomUUID();
  const applicationId = randomUUID();
  const opportunityId = randomUUID();
  const runId = randomUUID();
  const expiredPendingRunId = randomUUID();
  const expiredLeasedRunId = randomUUID();
  const researchId = randomUUID();
  const safeSourceId = randomUUID();
  const restrictedSourceId = randomUUID();
  const safeEvidenceId = randomUUID();
  const declaredEvidenceId = randomUUID();
  const restrictedEvidenceId = randomUUID();
  const verifiedClaimId = randomUUID();
  const declaredClaimId = randomUUID();
  const mixedClaimId = randomUUID();
  const inferredClaimId = randomUUID();
  let restricted: Client | undefined;

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
       in role career_evidence_archivist`,
    );
    restricted = new Client({ connectionString: workerUrl.toString() });
    await restricted.connect();
    await assert.rejects(
      restricted.query('select * from app.workflow_steps'),
      /permission denied/,
    );
    await target.query(
      'grant select (id) on app.workflow_steps to career_evidence_archivist',
    );
    await assert.rejects(
      processEvidenceArchivistStep(workerUrl.toString()),
      /restricted evidence archivist login/,
    );
    await target.query(
      'revoke select (id) on app.workflow_steps from career_evidence_archivist',
    );
    await target.query(`create role ${extraRole} nologin`);
    await target.query(`grant ${extraRole} to ${workerLogin}`);
    await assert.rejects(
      processEvidenceArchivistStep(workerUrl.toString()),
      /restricted evidence archivist login/,
    );
    await target.query(`revoke ${extraRole} from ${workerLogin}`);

    await target.query(
      `insert into app.tenants (id, owner_id, name) values
        ($1, $2, 'Evidence tenant'), ($3, $2, 'Other tenant')`,
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
       values
        ($1, $3, $4, 0, 'document', 'CV', 'private', array['application']),
        ($2, $3, $4, 1, 'manual', 'Secret notes', 'restricted', array['application'])`,
      [safeSourceId, restrictedSourceId, tenantId, profileId],
    );
    await target.query(
      `insert into app.evidence
        (id, tenant_id, profile_id, source_id, position, label, excerpt)
       values
        ($1, $4, $5, $6, 0, 'Incident review', 'Reliable distributed systems in production.'),
        ($2, $4, $5, $6, 1, 'Product brief', 'Built product systems end to end.'),
        ($3, $4, $5, $7, 2, 'Private salary', 'DO NOT LEAK RESTRICTED EVIDENCE')`,
      [
        safeEvidenceId,
        declaredEvidenceId,
        restrictedEvidenceId,
        tenantId,
        profileId,
        safeSourceId,
        restrictedSourceId,
      ],
    );
    await target.query(
      `insert into app.claims
        (id, tenant_id, profile_id, position, statement, level, sensitivity, allowed_uses)
       values
        ($1, $5, $6, 0, 'Built reliable distributed systems.', 'verified', 'private', array['application']),
        ($2, $5, $6, 1, 'Built product systems end to end.', 'declared', 'private', array['application']),
        ($3, $5, $6, 2, 'Mixed safe and secret claim.', 'verified', 'private', array['application']),
        ($4, $5, $6, 3, 'Inferred distributed skill.', 'inferred', 'private', array['application'])`,
      [
        verifiedClaimId,
        declaredClaimId,
        mixedClaimId,
        inferredClaimId,
        tenantId,
        profileId,
      ],
    );
    await target.query(
      `insert into app.claim_evidence
        (tenant_id, profile_id, claim_id, evidence_id, position, relation)
       values
        ($1, $2, $3, $4, 0, 'supports'),
        ($1, $2, $5, $6, 0, 'supports'),
        ($1, $2, $7, $4, 0, 'supports'),
        ($1, $2, $7, $8, 1, 'supports'),
        ($1, $2, $9, $4, 0, 'supports')`,
      [
        tenantId,
        profileId,
        verifiedClaimId,
        safeEvidenceId,
        declaredClaimId,
        declaredEvidenceId,
        mixedClaimId,
        restrictedEvidenceId,
        inferredClaimId,
      ],
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
       values ($1, $2, $3, 1, 'Northstar', 'Staff Engineer', 'Build systems', 'ready')`,
      [opportunityId, tenantId, applicationId],
    );
    await target.query(
      `insert into app.workflow_runs
        (id, tenant_id, opportunity_id, profile_id, state, status,
         token_budget, cost_budget_micros, deadline_at)
       values ($1, $2, $3, $4, 'evidence_archive', 'paused', 30000, 0,
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
        {
          statement: 'Own product delivery end to end.',
          excerpt: 'Own product delivery end to end.',
          category: 'responsibility',
          priority: 'medium',
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

    await target.query(
      `select set_config('request.jwt.claim.sub', $1, false),
        set_config('request.jwt.claim.tenant_id', $2, false)`,
      [ownerId, tenantId],
    );
    await target.query('set role career_app');
    await assert.rejects(
      target.query(
        `select app.confirm_research_signal_selection($1, $2, $3, $4, $5)`,
        [otherTenantId, runId, researchId, ['signal-1'], randomUUID()],
      ),
      /invalid research selection/,
    );
    const selectionKey = randomUUID();
    const created = await target.query(
      `select app.confirm_research_signal_selection($1, $2, $3, $4, $5) created`,
      [tenantId, runId, researchId, ['signal-1', 'signal-2'], selectionKey],
    );
    assert.equal(created.rows[0].created, true);
    const replay = await target.query(
      `select app.confirm_research_signal_selection($1, $2, $3, $4, $5) created`,
      [tenantId, runId, researchId, ['signal-1', 'signal-2'], selectionKey],
    );
    assert.equal(replay.rows[0].created, false);
    await assert.rejects(
      target.query(
        `select app.confirm_research_signal_selection($1, $2, $3, $4, $5)`,
        [tenantId, runId, researchId, ['signal-1'], randomUUID()],
      ),
      /research selection conflict/,
    );
    await target.query('reset role');

    const step = await target.query(
      `select input from app.workflow_steps where workflow_run_id = $1
        and stage = 'evidence-archivist'`,
      [runId],
    );
    assert.equal(step.rowCount, 1);
    assert.deepEqual(
      step.rows[0].input.candidates.map(
        (candidate: { claimId: string }) => candidate.claimId,
      ),
      [verifiedClaimId, declaredClaimId],
    );
    assert.equal(
      JSON.stringify(step.rows[0].input).includes('DO NOT LEAK'),
      false,
    );

    await restricted.query('set role career_evidence_archivist');
    const claimed = await restricted.query(
      'select * from app.claim_evidence_archivist_step(300)',
    );
    assert.equal(claimed.rowCount, 1);
    const validOutput = buildEvidenceArchive(claimed.rows[0].input);
    const forgedOutput = structuredClone(validOutput);
    forgedOutput.signals[0].matches[0].claimId = randomUUID();
    await assert.rejects(
      restricted.query(
        'select app.complete_evidence_archivist_step($1, $2, $3::jsonb)',
        [
          claimed.rows[0].step_id,
          claimed.rows[0].lease_token,
          JSON.stringify(forgedOutput),
        ],
      ),
      /invalid evidence archivist provenance/,
    );
    await target.query(
      `update app.workflow_runs set status = 'cancelled' where id = $1`,
      [runId],
    );
    await assert.rejects(
      restricted.query(
        'select app.complete_evidence_archivist_step($1, $2, $3::jsonb)',
        [
          claimed.rows[0].step_id,
          claimed.rows[0].lease_token,
          JSON.stringify(validOutput),
        ],
      ),
      /evidence archivist run unavailable/,
    );
    const cancelled = await target.query(
      'select status, state from app.workflow_runs where id = $1',
      [runId],
    );
    assert.deepEqual(cancelled.rows[0], {
      status: 'cancelled',
      state: 'evidence_archive',
    });
    await target.query(
      `update app.workflow_runs set status = 'running',
        deadline_at = now() + interval '1 hour' where id = $1`,
      [runId],
    );
    await target.query(
      `update app.workflow_steps set lease_expires_at = now() - interval '1 second'
       where id = $1`,
      [claimed.rows[0].step_id],
    );
    await restricted.query('reset role');

    const outcomes = await Promise.all([
      processEvidenceArchivistStep(workerUrl.toString()),
      processEvidenceArchivistStep(workerUrl.toString()),
    ]);
    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), [
      'completed',
      'idle',
    ]);
    const run = await target.query(
      `select status, state, used_tokens, used_cost_micros::text
       from app.workflow_runs where id = $1`,
      [runId],
    );
    assert.deepEqual(run.rows[0], {
      status: 'paused',
      state: 'strategy',
      used_tokens: 0,
      used_cost_micros: '0',
    });
    const artifacts = await target.query(
      `select kind, body from app.artifacts where workflow_run_id = $1 order by kind`,
      [runId],
    );
    assert.equal(artifacts.rowCount, 2);
    assert.equal(artifacts.rows[0].kind, 'evidence_archive');
    assert.equal(artifacts.rows[0].body.signals.length, 2);
    assert.equal(
      artifacts.rows[0].body.signals[0].matches[0].claimId,
      verifiedClaimId,
    );
    const usage = await target.query(
      `select count(*)::integer count from app.model_usage where workflow_run_id = $1`,
      [runId],
    );
    assert.equal(usage.rows[0].count, 0);
    const events = await target.query(
      `select event_type, count(*)::integer count from app.workflow_events
       where workflow_run_id = $1 group by event_type order by event_type`,
      [runId],
    );
    assert.deepEqual(events.rows, [
      { event_type: 'artifact_written', count: 1 },
      { event_type: 'research_signals_confirmed', count: 1 },
    ]);

    await target.query(
      `insert into app.workflow_runs
        (id, tenant_id, opportunity_id, profile_id, state, status,
         token_budget, cost_budget_micros, deadline_at)
       values
        ($1, $3, $4, $5, 'evidence_archive', 'running', 30000, 0,
          now() - interval '2 minutes'),
        ($2, $3, $4, $5, 'evidence_archive', 'running', 30000, 0,
          now() - interval '1 minute')`,
      [
        expiredPendingRunId,
        expiredLeasedRunId,
        tenantId,
        opportunityId,
        profileId,
      ],
    );
    await target.query(
      `insert into app.workflow_steps
        (tenant_id, workflow_run_id, stage, status, idempotency_key,
         lease_owner, lease_expires_at, input, input_hash)
       values
        ($1, $2, 'evidence-archivist', 'pending', 'expired-pending',
          null, null, '{}'::jsonb, repeat('b', 64)),
        ($1, $3, 'evidence-archivist', 'leased', 'expired-leased',
          $4, now() + interval '4 minutes', '{}'::jsonb, repeat('c', 64))`,
      [tenantId, expiredPendingRunId, expiredLeasedRunId, randomUUID()],
    );

    const reaped = await Promise.all([
      processEvidenceArchivistStep(workerUrl.toString()),
      processEvidenceArchivistStep(workerUrl.toString()),
    ]);
    assert.deepEqual(
      reaped.map((outcome) => outcome.status),
      ['reaped', 'reaped'],
    );
    assert.equal(
      (await processEvidenceArchivistStep(workerUrl.toString())).status,
      'idle',
    );
    const expiredRuns = await target.query(
      `select run.id, run.status, step.status step_status, step.failure_code,
        run.used_tokens, run.used_cost_micros::text
       from app.workflow_runs run
       join app.workflow_steps step on step.tenant_id = run.tenant_id
         and step.workflow_run_id = run.id
       where run.id = any($1::uuid[]) order by run.id`,
      [[expiredPendingRunId, expiredLeasedRunId]],
    );
    assert.deepEqual(
      expiredRuns.rows.map((row) => ({
        status: row.status,
        step_status: row.step_status,
        failure_code: row.failure_code,
        used_tokens: row.used_tokens,
        used_cost_micros: row.used_cost_micros,
      })),
      [
        {
          status: 'failed',
          step_status: 'failed',
          failure_code: 'deadline_exceeded',
          used_tokens: 0,
          used_cost_micros: '0',
        },
        {
          status: 'failed',
          step_status: 'failed',
          failure_code: 'deadline_exceeded',
          used_tokens: 0,
          used_cost_micros: '0',
        },
      ],
    );
    const expiredEvents = await target.query(
      `select count(*)::integer count from app.workflow_events
       where workflow_run_id = any($1::uuid[])
         and event_type = 'failed'
         and payload ->> 'failureCode' = 'deadline_exceeded'
         and payload ->> 'costMicros' = '0'`,
      [[expiredPendingRunId, expiredLeasedRunId]],
    );
    assert.equal(expiredEvents.rows[0].count, 2);
    assert.equal(
      (
        await target.query(
          `select count(*)::integer count from app.model_usage
           where workflow_run_id = any($1::uuid[])`,
          [[expiredPendingRunId, expiredLeasedRunId]],
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await restricted?.end().catch(() => undefined);
    await target.end().catch(() => undefined);
    await admin
      .query(`drop database if exists ${databaseName} with (force)`)
      .catch(() => undefined);
    await admin
      .query(`drop role if exists ${workerLogin}`)
      .catch(() => undefined);
    await admin
      .query(`drop role if exists ${extraRole}`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
