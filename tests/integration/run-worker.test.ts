import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from 'pg';
import { LocalOpenAICompanyResearchClient } from '../../lib/server/local-openai-client';
import { processCompanyResearchStep } from '../../lib/server/run-worker';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

test('the durable worker dispatches one local call and stores one wrapped result', async () => {
  const databaseName = `career_os_worker_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const admin = new Client({ connectionString: databaseUrl });
  const testUrl = new URL(databaseUrl);
  testUrl.pathname = `/${databaseName}`;
  const target = new Client({ connectionString: testUrl.toString() });
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const runId = randomUUID();
  const opportunityId = randomUUID();
  const applicationId = randomUUID();
  const workerLogin = `career_company_researcher_${randomUUID()
    .replaceAll('-', '')
    .slice(0, 16)}`;
  const workerPassword = `worker-${randomUUID()}`;
  const workerUrl = new URL(testUrl);
  workerUrl.username = workerLogin;
  workerUrl.password = workerPassword;
  const apiKey = 'sentinel-worker-api-key';
  const sourceUrl = 'https://jobs.example.test/staff-product-engineer';
  let calls = 0;
  let authorization = '';
  let releaseProvider!: () => void;
  let providerStarted!: () => void;
  const providerRelease = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const providerRequest = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });

  const provider = createServer(async (request, response) => {
    calls += 1;
    authorization = request.headers.authorization ?? '';
    for await (const chunk of request) {
      // Drain the bounded request before responding.
      void chunk;
    }
    providerStarted();
    await providerRelease;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'local-provider-request-1',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                signals: [
                  {
                    statement: 'Own reliable delivery end to end.',
                    excerpt:
                      'Own reliable delivery from discovery to production.',
                    category: 'responsibility',
                    priority: 'high',
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      }),
    );
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
       in role career_company_researcher`,
    );
    const restricted = new Client({ connectionString: workerUrl.toString() });
    await restricted.connect();
    await assert.rejects(
      restricted.query('select * from app.workflow_steps'),
      /permission denied/,
    );
    await restricted.end();

    await target.query(
      `insert into app.tenants (id, owner_id, name)
       values ($1, $2, 'Worker integration tenant')`,
      [tenantId, ownerId],
    );
    await target.query(
      `insert into app.applications (
         id, tenant_id, company, role, raw_text, url, accent,
         create_idempotency_key, create_input_hash
       ) values (
         $1, $2, 'Northstar Labs', 'Staff Product Engineer',
         'Own reliable delivery from discovery to production.', $3, '#5847e8',
         $4, repeat('a', 64)
       )`,
      [applicationId, tenantId, sourceUrl, randomUUID()],
    );
    await target.query(
      `insert into app.opportunities (
         id, tenant_id, application_id, application_revision, company, role,
         raw_text, url, extraction_status
       ) values (
         $1, $2, $3, 1, 'Northstar Labs', 'Staff Product Engineer',
         'Own reliable delivery from discovery to production.', $4, 'ready'
       )`,
      [opportunityId, tenantId, applicationId, sourceUrl],
    );
    await target.query(
      `insert into app.workflow_runs (
         id, tenant_id, opportunity_id, state, status, token_budget,
         cost_budget_micros, deadline_at
       ) values (
         $1, $2, $3, 'research', 'running', 30000, 0,
         now() + interval '1 hour'
       )`,
      [runId, tenantId, opportunityId],
    );

    await target.query(
      `select set_config('request.jwt.claim.sub', $1, false),
        set_config('request.jwt.claim.tenant_id', $2, false)`,
      [ownerId, tenantId],
    );
    await target.query('set role career_app');
    await target.query(
      `select app.enqueue_company_researcher_step($1, $2, $3::jsonb)`,
      [
        tenantId,
        runId,
        JSON.stringify({
          schemaVersion: 1,
          company: 'Northstar Labs',
          role: 'Staff Product Engineer',
          description: 'Own reliable delivery from discovery to production.',
          source: {
            kind: 'job-posting',
            url: sourceUrl,
            trust: 'untrusted-data',
          },
        }),
      ],
    );
    await target.query('reset role');

    await new Promise<void>((resolve) =>
      provider.listen(0, '127.0.0.1', resolve),
    );
    const address = provider.address();
    assert.ok(address && typeof address === 'object');
    const client = new LocalOpenAICompanyResearchClient({
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey,
      model: 'local-company-researcher',
    });
    await assert.rejects(
      processCompanyResearchStep({
        databaseUrl: testUrl.toString(),
        client,
      }),
      /restricted company researcher login/,
    );
    assert.equal(calls, 0);
    await target.query(
      'grant select on app.workflow_steps to career_company_researcher',
    );
    await assert.rejects(
      processCompanyResearchStep({
        databaseUrl: workerUrl.toString(),
        client,
      }),
      /restricted company researcher login/,
    );
    assert.equal(calls, 0);
    await target.query(
      'revoke select on app.workflow_steps from career_company_researcher',
    );
    await target.query(`grant select on app.profiles to ${workerLogin}`);
    await assert.rejects(
      processCompanyResearchStep({
        databaseUrl: workerUrl.toString(),
        client,
      }),
      /restricted company researcher login/,
    );
    assert.equal(calls, 0);
    await target.query(`revoke select on app.profiles from ${workerLogin}`);
    await target.query(`grant usage on schema app to ${workerLogin}`);
    await target.query(
      `grant execute on function app.claim_company_researcher_step(uuid, integer)
       to ${workerLogin}`,
    );
    await assert.rejects(
      processCompanyResearchStep({
        databaseUrl: workerUrl.toString(),
        client,
      }),
      /restricted company researcher login/,
    );
    assert.equal(calls, 0);
    await target.query(
      `revoke execute on function app.claim_company_researcher_step(uuid, integer)
       from ${workerLogin}`,
    );
    await target.query(`revoke usage on schema app from ${workerLogin}`);
    const outcomesPromise = Promise.all([
      processCompanyResearchStep({
        databaseUrl: workerUrl.toString(),
        client,
      }),
      processCompanyResearchStep({
        databaseUrl: workerUrl.toString(),
        client,
      }),
    ]);
    await providerRequest;
    await target.query(
      `update app.worker_heartbeats
       set last_seen_at = clock_timestamp() - interval '16 seconds'
       where service = 'company-researcher'`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5_500));
    await target.query('set role career_app');
    const availability = await target.query(
      `select status
       from app.worker_service_status('company-researcher')`,
    );
    await target.query('reset role');
    assert.equal(availability.rows[0].status, 'fresh');
    releaseProvider();
    const outcomes = await outcomesPromise;

    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), [
      'completed',
      'idle',
    ]);
    assert.equal(calls, 1);
    assert.equal(authorization, `Bearer ${apiKey}`);

    const run = await target.query(
      `select status, state, used_tokens, reserved_tokens,
        used_cost_micros::text, reserved_cost_micros::text
       from app.workflow_runs where id = $1`,
      [runId],
    );
    assert.deepEqual(run.rows[0], {
      status: 'paused',
      state: 'evidence_archive',
      used_tokens: 30,
      reserved_tokens: 0,
      used_cost_micros: '0',
      reserved_cost_micros: '0',
    });

    const artifacts = await target.query(
      `select body from app.artifacts where workflow_run_id = $1`,
      [runId],
    );
    assert.equal(artifacts.rowCount, 1);
    assert.deepEqual(artifacts.rows[0].body, {
      company: 'Northstar Labs',
      role: 'Staff Product Engineer',
      signals: [
        {
          statement: 'Own reliable delivery end to end.',
          excerpt: 'Own reliable delivery from discovery to production.',
          category: 'responsibility',
          priority: 'high',
        },
      ],
      source: {
        kind: 'job-posting',
        url: sourceUrl,
        trust: 'untrusted-data',
      },
    });

    const usage = await target.query(
      `select actor::text, provider, model, input_tokens, output_tokens,
        cost_micros::text, usage_basis, provider_request_id
       from app.model_usage where workflow_run_id = $1`,
      [runId],
    );
    assert.equal(usage.rowCount, 1);
    assert.deepEqual(usage.rows[0], {
      actor: 'company_researcher',
      provider: 'openai-compatible-local',
      model: 'local-company-researcher',
      input_tokens: 20,
      output_tokens: 10,
      cost_micros: '0',
      usage_basis: 'actual',
      provider_request_id: 'local-provider-request-1',
    });

    const step = await target.query(
      `select status, provider, model, output_artifact_id is not null as has_output
       from app.workflow_steps where workflow_run_id = $1`,
      [runId],
    );
    assert.equal(step.rowCount, 1);
    assert.deepEqual(step.rows[0], {
      status: 'completed',
      provider: 'openai-compatible-local',
      model: 'local-company-researcher',
      has_output: true,
    });

    for (const table of [
      'workflow_runs',
      'workflow_steps',
      'run_budget_reservations',
      'artifacts',
      'model_usage',
      'workflow_events',
    ]) {
      const leaked = await target.query(
        `select count(*)::integer as count from app.${table} row
         where row_to_json(row)::text like $1`,
        [`%${apiKey}%`],
      );
      assert.equal(leaked.rows[0].count, 0, `${table} stored the API key`);
    }
  } finally {
    releaseProvider();
    if (provider.listening)
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    await target.end().catch(() => undefined);
    await admin
      .query(`drop database if exists ${databaseName} with (force)`)
      .catch(() => undefined);
    await admin
      .query(`drop role if exists ${workerLogin}`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
