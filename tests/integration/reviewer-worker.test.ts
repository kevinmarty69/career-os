import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from 'pg';
import { buildQualitativeReview, parseReviewerInput } from '../../lib/reviewer';
import { LocalOpenAIReviewClient } from '../../lib/server/local-openai-review-client';
import { processReviewerStep } from '../../lib/server/reviewer-worker';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

test('three isolated reviewers persist exactly once without a paid provider', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const databaseName = `career_os_review_${suffix}`;
  const admin = new Client({ connectionString: databaseUrl });
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${databaseName}`;
  const target = new Client({ connectionString: targetUrl.toString() });
  const credentials = {
    recruiter: workerCredential(targetUrl, `recruiter_review_${suffix}`),
    hiringManager: workerCredential(targetUrl, `hiring_review_${suffix}`),
    factuality: workerCredential(targetUrl, `factuality_review_${suffix}`),
  };
  let providerCalls = 0;
  const fake = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      providerCalls += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: `review-request-${providerCalls}`,
          choices: [
            {
              message: { content: JSON.stringify({ issues: [] }) },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 10,
            total_tokens: 40,
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

    await createWorker(
      target,
      credentials.recruiter,
      'career_recruiter_reviewer',
    );
    await createWorker(
      target,
      credentials.hiringManager,
      'career_hiring_manager_reviewer',
    );
    await createWorker(
      target,
      credentials.factuality,
      'career_factuality_reviewer',
    );
    const restricted = new Client({
      connectionString: credentials.recruiter.url.toString(),
    });
    await restricted.connect();
    await assert.rejects(
      restricted.query('select * from app.reviews'),
      /permission denied/,
    );
    await restricted.end();

    const fixture = fixtureIds();
    await insertFixture(target, fixture);
    await target.query(
      `select set_config('request.jwt.claim.sub', $1, false),
        set_config('request.jwt.claim.tenant_id', $2, false)`,
      [fixture.ownerId, fixture.tenantId],
    );
    await target.query('set role career_app');
    const started = await target.query(
      'select app.start_page_spec_reviews($1,$2,$3) started',
      [fixture.tenantId, fixture.runId, randomUUID()],
    );
    assert.equal(started.rows[0].started, true);
    await target.query('reset role');
    const queued = await target.query(
      `select input from app.workflow_steps
       where workflow_run_id = $1 and stage = 'recruiter-reviewer'`,
      [fixture.runId],
    );
    const expectedPass = buildQualitativeReview(
      parseReviewerInput(queued.rows[0].input, 'recruiter'),
      'recruiter',
      { issues: [] },
    );
    const validOutput = await target.query(
      'select app.valid_durable_review_output($1::jsonb) valid',
      [JSON.stringify(expectedPass)],
    );
    assert.equal(validOutput.rows[0].valid, true);

    await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const address = fake.address();
    assert(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const recruiterClient = new LocalOpenAIReviewClient({
      reviewer: 'recruiter',
      baseUrl,
      apiKey: 'local-test',
      model: 'fake-reviewer',
    });
    const recruiterOutcomes = await Promise.all([
      processReviewerStep({
        reviewer: 'recruiter',
        databaseUrl: credentials.recruiter.url.toString(),
        client: recruiterClient,
      }),
      processReviewerStep({
        reviewer: 'recruiter',
        databaseUrl: credentials.recruiter.url.toString(),
        client: recruiterClient,
      }),
    ]);
    assert.deepEqual(
      recruiterOutcomes.map((outcome) => outcome.status).sort(),
      ['completed', 'idle'],
    );

    await assert.rejects(
      processReviewerStep({
        reviewer: 'hiring-manager',
        databaseUrl: credentials.recruiter.url.toString(),
        client: new LocalOpenAIReviewClient({
          reviewer: 'hiring-manager',
          baseUrl,
          apiKey: 'local-test',
          model: 'fake-reviewer',
        }),
      }),
      /restricted hiring-manager reviewer login/,
    );
    const hiring = await processReviewerStep({
      reviewer: 'hiring-manager',
      databaseUrl: credentials.hiringManager.url.toString(),
      client: new LocalOpenAIReviewClient({
        reviewer: 'hiring-manager',
        baseUrl,
        apiKey: 'local-test',
        model: 'fake-reviewer',
      }),
    });
    assert.equal(hiring.status, 'completed');
    assert.equal(providerCalls, 2);

    const factuality = await processReviewerStep({
      reviewer: 'factuality',
      databaseUrl: credentials.factuality.url.toString(),
    });
    assert.equal(factuality.status, 'completed');
    assert.equal(providerCalls, 2);

    const durable = await target.query(
      `select run.status, run.state,
        (select count(*)::integer from app.reviews review
          where review.workflow_run_id = run.id) review_count,
        (select count(*)::integer from app.model_usage usage
          where usage.workflow_run_id = run.id) usage_count,
        (select coalesce(sum(cost_micros), 0)::text from app.model_usage usage
          where usage.workflow_run_id = run.id) cost_micros
       from app.workflow_runs run where run.id = $1`,
      [fixture.runId],
    );
    assert.deepEqual(durable.rows[0], {
      status: 'awaiting_approval',
      state: 'human_approval',
      review_count: 3,
      usage_count: 2,
      cost_micros: '0',
    });
    const factualUsage = await target.query(
      `select count(*)::integer count from app.model_usage usage
       join app.workflow_steps step on step.id = usage.workflow_step_id
       where step.workflow_run_id = $1 and step.stage = 'factuality-reviewer'`,
      [fixture.runId],
    );
    assert.equal(factualUsage.rows[0].count, 0);
  } finally {
    await new Promise<void>((resolve) => fake.close(() => resolve())).catch(
      () => undefined,
    );
    await target.end().catch(() => undefined);
    await admin
      .query(`drop database if exists ${databaseName} with (force)`)
      .catch(() => undefined);
    for (const credential of Object.values(credentials))
      await admin
        .query(`drop role if exists ${credential.login}`)
        .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});

function workerCredential(base: URL, login: string) {
  const password = `worker-${randomUUID()}`;
  const url = new URL(base);
  url.username = login;
  url.password = password;
  return { login, password, url };
}

async function createWorker(
  target: Client,
  credential: ReturnType<typeof workerCredential>,
  role: string,
) {
  await target.query(
    `create role ${credential.login} login noinherit
      password '${credential.password}' in role ${role}`,
  );
}

function fixtureIds() {
  return {
    ownerId: randomUUID(),
    tenantId: randomUUID(),
    profileId: randomUUID(),
    sourceId: randomUUID(),
    evidenceId: randomUUID(),
    claimId: randomUUID(),
    applicationId: randomUUID(),
    opportunityId: randomUUID(),
    runId: randomUUID(),
    pageArtifactId: randomUUID(),
    pageSpecId: randomUUID(),
    composerStepId: randomUUID(),
  };
}

async function insertFixture(
  target: Client,
  ids: ReturnType<typeof fixtureIds>,
) {
  await target.query(
    `insert into app.tenants (id, owner_id, name)
     values ($1, $2, 'Review tenant')`,
    [ids.tenantId, ids.ownerId],
  );
  await target.query(
    `insert into app.profiles
      (id, tenant_id, name, headline, profile_kind, revision)
     values ($1, $2, 'Ada', 'Product engineer', 'snapshot', 1)`,
    [ids.profileId, ids.tenantId],
  );
  await target.query(
    `insert into app.sources
      (id, tenant_id, profile_id, position, kind, title,
       sensitivity, allowed_uses)
     values ($1, $2, $3, 0, 'document', 'CV', 'private',
       array['application'])`,
    [ids.sourceId, ids.tenantId, ids.profileId],
  );
  await target.query(
    `insert into app.evidence
      (id, tenant_id, profile_id, source_id, position, label, excerpt)
     values ($1, $2, $3, $4, 0, 'Production review',
       'Operated reliable production systems end to end.')`,
    [ids.evidenceId, ids.tenantId, ids.profileId, ids.sourceId],
  );
  await target.query(
    `insert into app.claims
      (id, tenant_id, profile_id, position, statement, level,
       sensitivity, allowed_uses)
     values ($1, $2, $3, 0, 'Built reliable production systems.',
       'verified', 'private', array['application'])`,
    [ids.claimId, ids.tenantId, ids.profileId],
  );
  await target.query(
    `insert into app.claim_evidence
      (tenant_id, profile_id, claim_id, evidence_id, position, relation)
     values ($1, $2, $3, $4, 0, 'supports')`,
    [ids.tenantId, ids.profileId, ids.claimId, ids.evidenceId],
  );
  await target.query(
    `insert into app.applications
      (id, tenant_id, company, role, raw_text, accent,
       create_idempotency_key, create_input_hash)
     values ($1, $2, 'Northstar', 'Staff Engineer', 'Build systems', '#5847e8',
       $3, repeat('a', 64))`,
    [ids.applicationId, ids.tenantId, randomUUID()],
  );
  await target.query(
    `insert into app.opportunities
      (id, tenant_id, application_id, application_revision, company, role,
       raw_text, extraction_status, accent)
     values ($1, $2, $3, 1, 'Northstar', 'Staff Engineer', 'Build systems',
       'ready', '#5847e8')`,
    [ids.opportunityId, ids.tenantId, ids.applicationId],
  );
  await target.query(
    `insert into app.workflow_runs
      (id, tenant_id, opportunity_id, profile_id, state, status,
       token_budget, cost_budget_micros, deadline_at)
     values ($1, $2, $3, $4, 'page_spec_review', 'paused', 300000, 0,
       now() + interval '1 hour')`,
    [ids.runId, ids.tenantId, ids.opportunityId, ids.profileId],
  );
  const pageSpec = {
    version: 1,
    company: {
      name: 'Northstar',
      role: 'Staff Engineer',
      accent: '#5847e8',
    },
    hero: {
      eyebrow: 'Private application',
      title: 'Ada × Northstar',
      thesis: 'Built reliable production systems.',
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant experience',
        claimIds: [ids.claimId],
      },
    ],
  };
  await target.query(
    `insert into app.artifacts
      (id, tenant_id, workflow_run_id, kind, version, body, created_by)
     values ($1, $2, $3, 'page_spec', 1, $4::jsonb, 'page_composer')`,
    [ids.pageArtifactId, ids.tenantId, ids.runId, JSON.stringify(pageSpec)],
  );
  await target.query(
    `insert into app.page_specs
      (id, tenant_id, workflow_run_id, version, spec, input_hash,
       source_artifact_id)
     values ($1, $2, $3, 1, $4::jsonb, repeat('c', 64), $5)`,
    [
      ids.pageSpecId,
      ids.tenantId,
      ids.runId,
      JSON.stringify(pageSpec),
      ids.pageArtifactId,
    ],
  );
  await target.query(
    `insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id)
     values ($1, $2, $3)`,
    [ids.tenantId, ids.pageSpecId, ids.claimId],
  );
  await target.query(
    `insert into app.page_spec_evidence
      (tenant_id, page_spec_id, claim_id, evidence_id, position)
     values ($1, $2, $3, $4, 0)`,
    [ids.tenantId, ids.pageSpecId, ids.claimId, ids.evidenceId],
  );
  await target.query(
    `insert into app.workflow_steps
      (id, tenant_id, workflow_run_id, stage, status, idempotency_key,
       input, input_hash, output_artifact_id, page_spec_id, completed_at)
     values ($1, $2, $3, 'page-composer', 'completed', 'page-composer-fixture',
       '{}'::jsonb, encode(digest('{}'::jsonb::text, 'sha256'), 'hex'),
       $4, $5, now())`,
    [
      ids.composerStepId,
      ids.tenantId,
      ids.runId,
      ids.pageArtifactId,
      ids.pageSpecId,
    ],
  );
}
