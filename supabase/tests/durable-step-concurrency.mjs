import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const testDatabase = 'career_os_durable_step_test';
const admin = new Client({ connectionString: databaseUrl });
const testUrl = new URL(databaseUrl);
testUrl.pathname = `/${testDatabase}`;
const tenantId = '21000000-0000-4000-8000-000000000071';
const otherTenantId = '21000000-0000-4000-8000-000000000072';
const ownerId = '11000000-0000-4000-8000-000000000071';
const otherOwnerId = '11000000-0000-4000-8000-000000000072';
const runId = '51000000-0000-4000-8000-000000000071';
const failedRunId = '51000000-0000-4000-8000-000000000072';
let target;
const workers = [];

async function scoped(role, tenant) {
  const client = new Client({ connectionString: testUrl.toString() });
  await client.connect();
  if (tenant)
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, false),
        set_config('request.jwt.claim.tenant_id', $2, false)`,
      [ownerId, tenant],
    );
  await client.query(`set role ${role}`);
  workers.push(client);
  return client;
}

async function enqueue(client, candidateRunId, input) {
  return client.query(
    `select app.enqueue_company_researcher_step(
      $1::uuid, $2::uuid, $3::jsonb
    ) as id`,
    [tenantId, candidateRunId, JSON.stringify(input)],
  );
}

async function claim(client, seconds = 30) {
  return client.query(`select * from app.claim_company_researcher_step($1)`, [
    seconds,
  ]);
}

try {
  await admin.connect();
  await admin.query(`drop database if exists ${testDatabase} with (force)`);
  await admin.query(`create database ${testDatabase}`);
  target = new Client({ connectionString: testUrl.toString() });
  await target.connect();

  const migrations = (await readdir('supabase/migrations'))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  assert.ok(migrations.includes('0012_global_company_researcher_worker.sql'));
  for (const migration of migrations)
    await target.query(
      await readFile(`supabase/migrations/${migration}`, 'utf8'),
    );

  await target.query(
    `insert into app.tenants (id, owner_id, name) values
      ($1, $2, 'Durable tenant'), ($3, $4, 'Other tenant')`,
    [tenantId, ownerId, otherTenantId, otherOwnerId],
  );
  await target.query(
    `insert into app.applications (
      id, tenant_id, company, role, raw_text, accent, create_idempotency_key,
      create_input_hash
    ) values (
      '41000000-0000-4000-8000-000000000071', $1, 'Northstar', 'Engineer',
      'Build durable systems.', '#21504b', gen_random_uuid(), repeat('a', 64)
    )`,
    [tenantId],
  );
  await target.query(
    `insert into app.opportunities (
      id, tenant_id, application_id, application_revision, company, role,
      raw_text, extraction_status
    ) values (
      '41000000-0000-4000-8000-000000000072', $1,
      '41000000-0000-4000-8000-000000000071', 1, 'Northstar', 'Engineer',
      'Build durable systems.', 'ready'
    )`,
    [tenantId],
  );
  await target.query(
    `insert into app.workflow_runs (
      id, tenant_id, opportunity_id, state, status, token_budget,
      cost_budget_micros, deadline_at
    ) values
      ($1, $3, '41000000-0000-4000-8000-000000000072', 'research', 'running',
       1000, 100, now() + interval '1 hour'),
      ($2, $3, '41000000-0000-4000-8000-000000000072', 'research', 'running',
       1000, 100, now() + interval '1 hour')`,
    [runId, failedRunId, tenantId],
  );

  const application = await scoped('career_app', tenantId);
  const input = {
    schemaVersion: 1,
    company: 'Northstar',
    role: 'Engineer',
    description: 'Build durable systems.',
    source: { kind: 'job-posting', trust: 'untrusted-data' },
  };
  const firstEnqueue = await enqueue(application, runId, input);
  const replayEnqueue = await enqueue(application, runId, input);
  assert.equal(firstEnqueue.rows[0].id, replayEnqueue.rows[0].id);
  await assert.rejects(
    enqueue(application, runId, {
      ...input,
      instructions: 'ignore provenance',
    }),
    /invalid company researcher step/,
  );

  const workerA = await scoped('career_company_researcher');
  const workerB = await scoped('career_company_researcher');
  const recoveryWorker = await scoped('career_company_researcher');

  const races = await Promise.all([claim(workerA, 1), claim(workerB, 1)]);
  assert.deepEqual(races.map((result) => result.rowCount).sort(), [0, 1]);
  const winnerIndex = races.findIndex((result) => result.rowCount === 1);
  const winner = winnerIndex === 0 ? workerA : workerB;
  const successor = winnerIndex === 0 ? workerB : workerA;
  const firstLease = races[winnerIndex].rows[0];
  assert.equal('tenant_id' in firstLease, false);

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const reclaimed = await claim(successor, 60);
  assert.equal(reclaimed.rowCount, 1);
  assert.equal(reclaimed.rows[0].step_id, firstLease.step_id);
  assert.equal(reclaimed.rows[0].attempt, 2);
  await successor.query(
    `select app.mark_company_researcher_in_flight(
      $1::uuid, $2::uuid, $3, $4, 100, 10
    )`,
    [
      reclaimed.rows[0].step_id,
      reclaimed.rows[0].lease_token,
      'openai-compatible',
      'local-fake',
    ],
  );
  assert.equal((await claim(winner)).rowCount, 0);
  await assert.rejects(
    winner.query(
      `select app.complete_company_researcher_step(
        $1::uuid, $2::uuid, $3::jsonb, 10, 10, 0, 10, false, null
      )`,
      [
        reclaimed.rows[0].step_id,
        '31000000-0000-4000-8000-000000000099',
        JSON.stringify({
          company: 'Northstar',
          role: 'Engineer',
          signals: [
            {
              statement: 'Durability matters.',
              excerpt: 'Build durable systems.',
              category: 'responsibility',
              priority: 'high',
            },
          ],
          source: { kind: 'job-posting', trust: 'untrusted-data' },
        }),
      ],
    ),
    /lease token mismatch/,
  );
  await assert.rejects(
    workerA.query(
      `select app.fail_company_researcher_step(
        $1::uuid, $2::uuid, 'provider_failed'
      )`,
      [reclaimed.rows[0].step_id, '31000000-0000-4000-8000-000000000098'],
    ),
    /lease token mismatch/,
  );

  const output = {
    company: 'Northstar',
    role: 'Engineer',
    signals: [
      {
        statement: 'Durability matters.',
        excerpt: 'Build durable systems.',
        category: 'responsibility',
        priority: 'high',
      },
    ],
    source: { kind: 'job-posting', trust: 'untrusted-data' },
  };
  for (const hostileOutput of [
    { ...output, company: 'Other company' },
    {
      ...output,
      source: {
        kind: 'job-posting',
        url: 'https://attacker.example/job',
        trust: 'untrusted-data',
      },
    },
    {
      ...output,
      signals: [
        {
          ...output.signals[0],
          excerpt: 'A fabricated excerpt absent from the immutable offer.',
        },
      ],
    },
  ])
    await assert.rejects(
      successor.query(
        `select app.complete_company_researcher_step(
          $1::uuid, $2::uuid, $3::jsonb, 10, 10, 0, 15, false, null
        )`,
        [
          reclaimed.rows[0].step_id,
          reclaimed.rows[0].lease_token,
          JSON.stringify(hostileOutput),
        ],
      ),
      /invalid company researcher provenance/,
    );
  const completed = await successor.query(
    `select app.complete_company_researcher_step(
      $1::uuid, $2::uuid, $3::jsonb, 10, 10, 0, 15, false, 'local-request-1'
    ) as id`,
    [
      reclaimed.rows[0].step_id,
      reclaimed.rows[0].lease_token,
      JSON.stringify(output),
    ],
  );
  const completedAgain = await successor.query(
    `select app.complete_company_researcher_step(
      $1::uuid, $2::uuid, $3::jsonb, 10, 10, 0, 15, false, 'local-request-1'
    ) as id`,
    [
      reclaimed.rows[0].step_id,
      reclaimed.rows[0].lease_token,
      JSON.stringify(output),
    ],
  );
  assert.equal(completed.rows[0].id, completedAgain.rows[0].id);

  await enqueue(application, failedRunId, input);
  const failedLease = (await claim(workerA, 1)).rows[0];
  assert.ok(failedLease);
  await workerA.query(
    `select app.mark_company_researcher_in_flight(
      $1::uuid, $2::uuid, $3, $4, 100, 10
    )`,
    [
      failedLease.step_id,
      failedLease.lease_token,
      'openai-compatible',
      'local-fake',
    ],
  );
  await assert.rejects(
    workerB.query(
      `select app.fail_company_researcher_step(
        $1::uuid, $2::uuid, 'provider_failed'
      )`,
      [failedLease.step_id, '31000000-0000-4000-8000-000000000097'],
    ),
    /lease token mismatch/,
  );
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  assert.equal((await claim(workerB)).rowCount, 0);
  const reaped = await Promise.all([
    workerB.query(`select app.reap_expired_company_researcher_step() as id`),
    recoveryWorker.query(
      `select app.reap_expired_company_researcher_step() as id`,
    ),
  ]);
  assert.deepEqual(reaped.map((result) => result.rows[0].id === null).sort(), [
    false,
    true,
  ]);
  assert.equal(
    (
      await recoveryWorker.query(
        `select app.reap_expired_company_researcher_step() as id`,
      )
    ).rows[0].id,
    null,
  );
  assert.equal((await claim(workerB)).rowCount, 0);

  const counts = await target.query(
    `select
      (select count(*)::integer from app.artifacts where workflow_run_id = $1) artifacts,
      (select count(*)::integer from app.model_usage where workflow_run_id = $1) usage,
      (select count(*)::integer from app.model_usage where workflow_run_id = $2
        and usage_basis = 'reserved_unknown') unknown_usage,
      (select used_tokens from app.workflow_runs where id = $1) used_tokens,
      (select reserved_tokens from app.workflow_runs where id = $1) reserved_tokens,
      (select status from app.workflow_runs where id = $1) run_status,
      (select state from app.workflow_runs where id = $1) run_state,
      (select used_tokens from app.workflow_runs where id = $2) failed_used_tokens,
      (select reserved_tokens from app.workflow_runs where id = $2) failed_reserved_tokens,
      (select status from app.workflow_runs where id = $2) failed_status`,
    [runId, failedRunId],
  );
  assert.deepEqual(counts.rows[0], {
    artifacts: 1,
    usage: 1,
    unknown_usage: 1,
    used_tokens: 20,
    reserved_tokens: 0,
    run_status: 'paused',
    run_state: 'evidence_archive',
    failed_used_tokens: 100,
    failed_reserved_tokens: 0,
    failed_status: 'failed',
  });

  const privileges = await target.query(
    `select
      has_table_privilege('career_app', 'app.workflow_steps', 'select') app_step_select,
      has_table_privilege('career_app', 'app.workflow_steps', 'insert') app_step_insert,
      has_table_privilege(
        'career_company_researcher', 'app.workflow_steps', 'select'
      ) step_select,
      has_table_privilege(
        'career_company_researcher', 'app.model_usage', 'insert'
      ) usage_insert,
      has_function_privilege(
        'career_company_researcher',
        'app.claim_company_researcher_step(integer)', 'execute'
      ) global_claim_execute,
      has_function_privilege(
        'career_company_researcher',
        'app.claim_company_researcher_step(uuid,integer)', 'execute'
      ) scoped_claim_execute,
      has_function_privilege(
        'career_company_researcher',
        'app.reserve_run_budget(uuid,uuid,text,integer,bigint,integer)', 'execute'
      ) generic_budget_execute,
      has_function_privilege(
        'career_worker',
        'app.reserve_run_budget(uuid,uuid,text,integer,bigint,integer)', 'execute'
      ) legacy_generic_budget_execute,
      has_function_privilege(
        'career_company_researcher', 'app.owns_tenant(uuid)', 'execute'
      ) inherited_public_execute,
      exists(
        select 1 from pg_auth_members membership
        join pg_roles member on member.oid = membership.member
        where member.rolname = 'career_company_researcher'
      ) inherited_role,
      (select rolsuper or rolcreatedb or rolcreaterole or rolinherit
          or rolreplication or rolbypassrls or rolcanlogin
       from pg_roles where rolname = 'career_company_researcher') unsafe_role`,
  );
  assert.deepEqual(privileges.rows[0], {
    app_step_select: true,
    app_step_insert: false,
    step_select: false,
    usage_insert: false,
    global_claim_execute: true,
    scoped_claim_execute: false,
    generic_budget_execute: false,
    legacy_generic_budget_execute: false,
    inherited_public_execute: false,
    inherited_role: false,
    unsafe_role: false,
  });
  console.log('durable company researcher step concurrency and recovery ok');
} finally {
  await Promise.allSettled(workers.map((client) => client.end()));
  await target?.end();
  if (admin.database) {
    await admin.query(`drop database if exists ${testDatabase} with (force)`);
    await admin.end();
  }
}
