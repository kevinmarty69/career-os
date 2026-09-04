import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const databaseName = `career_os_reviewers_${suffix}`;
const admin = new Client({ connectionString: databaseUrl });
const testUrl = new URL(databaseUrl);
testUrl.pathname = `/${databaseName}`;
const target = new Client({ connectionString: testUrl.toString() });
const clients = [];

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const ownerId = randomUUID();
const otherOwnerId = randomUUID();

function reviewOutput(input, reviewer, issues = []) {
  return {
    schemaVersion: 1,
    purpose: 'page-spec-review',
    pageSpecId: input.pageSpecId,
    pageSpecHash: input.pageSpecHash,
    reviewer,
    verdict: issues.length === 0 ? 'pass' : 'changes_required',
    issues,
  };
}

async function createLogin(role) {
  const login = `${role.replaceAll('-', '_')}_${suffix}_${clients.length}`;
  const password = `worker_${randomUUID().replaceAll('-', '')}`;
  await target.query(
    `create role ${login} login noinherit password '${password}' in role ${role}`,
  );
  const url = new URL(testUrl);
  url.username = login;
  url.password = password;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  clients.push(client);
  await assert.rejects(
    client.query('select * from app.workflow_steps'),
    /permission denied|does not exist/,
  );
  await client.query(`set role ${role}`);
  return client;
}

async function appClient(tenant = tenantId, user = ownerId) {
  const client = new Client({ connectionString: testUrl.toString() });
  await client.connect();
  clients.push(client);
  await client.query(
    `select set_config('request.jwt.claim.sub',$1,false),
      set_config('request.jwt.claim.tenant_id',$2,false)`,
    [user, tenant],
  );
  await client.query('set role career_app');
  return client;
}

async function seedPage(label, tenant = tenantId) {
  const applicationId = randomUUID();
  const opportunityId = randomUUID();
  const profileId = randomUUID();
  const runId = randomUUID();
  const artifactId = randomUUID();
  const pageSpecId = randomUUID();
  const localSourceId = randomUUID();
  const localEvidenceId = randomUUID();
  const localClaimId = randomUUID();
  const pageSpec = {
    version: 1,
    company: { name: label, role: 'Engineer', accent: '#21504b' },
    hero: {
      eyebrow: 'Private application',
      title: `Kevin x ${label}`,
      thesis: 'Built reliable distributed systems.',
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant experience',
        claimIds: [localClaimId],
      },
    ],
  };
  await target.query(
    `insert into app.applications (
      id,tenant_id,company,role,raw_text,accent,create_idempotency_key,
      create_input_hash
    ) values ($1,$2,$3,'Engineer','Build systems.','#21504b',$4,repeat('a',64))`,
    [applicationId, tenant, label, randomUUID()],
  );
  await target.query(
    `insert into app.opportunities (
      id,tenant_id,application_id,application_revision,company,role,raw_text,
      extraction_status,accent
    ) values ($1,$2,$3,1,$4,'Engineer','Build systems.','ready','#21504b')`,
    [opportunityId, tenant, applicationId, label],
  );
  await target.query(
    `insert into app.profiles (
      id,tenant_id,name,headline,profile_kind,revision
    ) values ($1,$2,'Kevin','Product engineer','snapshot',1)`,
    [profileId, tenant],
  );
  await target.query(
    `insert into app.sources (
      id,tenant_id,profile_id,position,kind,title,sensitivity,allowed_uses
    ) values ($1,$2,$3,0,'document','CV','private',array['application'])`,
    [localSourceId, tenant, profileId],
  );
  await target.query(
    `insert into app.evidence (
      id,tenant_id,profile_id,source_id,position,label,excerpt
    ) values ($1,$2,$3,$4,0,'System proof','Reliable production systems.')`,
    [localEvidenceId, tenant, profileId, localSourceId],
  );
  await target.query(
    `insert into app.claims (
      id,tenant_id,profile_id,position,statement,level,sensitivity,allowed_uses
    ) values ($1,$2,$3,0,'Built reliable distributed systems.',
      'verified','private',array['application'])`,
    [localClaimId, tenant, profileId],
  );
  await target.query(
    `insert into app.claim_evidence (
      tenant_id,profile_id,claim_id,evidence_id,position,relation
    ) values ($1,$2,$3,$4,0,'supports')`,
    [tenant, profileId, localClaimId, localEvidenceId],
  );
  await target.query(
    `insert into app.workflow_runs (
      id,tenant_id,opportunity_id,profile_id,state,status,token_budget,
      cost_budget_micros,deadline_at
    ) values ($1,$2,$3,$4,'page_spec_review','paused',10000,0,
      now()+interval '1 hour')`,
    [runId, tenant, opportunityId, profileId],
  );
  await target.query(
    `insert into app.artifacts (
      id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
    ) values ($1,$2,$3,'page_spec',1,1,$4,'page_composer')`,
    [artifactId, tenant, runId, pageSpec],
  );
  await target.query(
    `insert into app.page_specs (
      id,tenant_id,workflow_run_id,version,spec,input_hash,source_artifact_id
    ) values ($1,$2,$3,1,$4,repeat('b',64),$5)`,
    [pageSpecId, tenant, runId, pageSpec, artifactId],
  );
  await target.query(
    `insert into app.page_spec_claims (tenant_id,page_spec_id,claim_id)
     values ($1,$2,$3)`,
    [tenant, pageSpecId, localClaimId],
  );
  await target.query(
    `insert into app.page_spec_evidence (
      tenant_id,page_spec_id,claim_id,evidence_id,position
    ) values ($1,$2,$3,$4,0)`,
    [tenant, pageSpecId, localClaimId, localEvidenceId],
  );
  await target.query(
    `insert into app.workflow_steps (
      tenant_id,workflow_run_id,stage,status,idempotency_key,input,input_hash,
      output_artifact_id,page_spec_id,completed_at
    ) values ($1,$2,'page-composer','completed','page-composer-v1','{}',
      encode(digest('{}'::jsonb::text,'sha256'),'hex'),$3,$4,now())`,
    [tenant, runId, artifactId, pageSpecId],
  );
  const hash = (
    await target.query('select spec_hash from app.page_specs where id=$1', [
      pageSpecId,
    ])
  ).rows[0].spec_hash;
  return {
    runId,
    pageSpecId,
    artifactId,
    hash,
    claimId: localClaimId,
    evidenceId: localEvidenceId,
  };
}

async function startReviews(client, page, key = randomUUID()) {
  const result = await client.query(
    'select app.start_page_spec_reviews($1,$2,$3) started',
    [tenantId, page.runId, key],
  );
  return { started: result.rows[0].started, key };
}

async function claim(client, reviewer, lease = 60) {
  return client.query(`select * from app.claim_${reviewer}_reviewer_step($1)`, [
    lease,
  ]);
}

async function dispatch(client, reviewer, leased, tokens = 500) {
  await client.query(
    `select app.mark_${reviewer}_reviewer_in_flight(
      $1,$2,'openai-compatible-local','local-fake',$3,0
    )`,
    [leased.step_id, leased.lease_token, tokens],
  );
}

async function completeProvider(client, reviewer, leased, output) {
  return client.query(
    `select app.complete_${reviewer}_reviewer_step(
      $1,$2,$3,40,20,0,5,false,$4
    ) artifact_id`,
    [
      leased.step_id,
      leased.lease_token,
      JSON.stringify(output),
      `${reviewer}-${leased.step_id}`,
    ],
  );
}

async function runPipeline(page, app, workers, hiringIssues = []) {
  await startReviews(app, page);
  const recruiterClaim = await claim(workers.recruiter, 'recruiter');
  assert.equal(recruiterClaim.rowCount, 1);
  assert.equal('tenant_id' in recruiterClaim.rows[0], false);
  await dispatch(workers.recruiter, 'recruiter', recruiterClaim.rows[0]);
  const recruiterOutput = reviewOutput(
    recruiterClaim.rows[0].input,
    'recruiter',
  );
  const recruiterComplete = await completeProvider(
    workers.recruiter,
    'recruiter',
    recruiterClaim.rows[0],
    recruiterOutput,
  );
  const recruiterReplay = await completeProvider(
    workers.recruiter,
    'recruiter',
    recruiterClaim.rows[0],
    recruiterOutput,
  );
  assert.equal(
    recruiterComplete.rows[0].artifact_id,
    recruiterReplay.rows[0].artifact_id,
  );

  const hiringClaim = await claim(workers.hiring, 'hiring_manager');
  assert.equal(hiringClaim.rowCount, 1);
  await dispatch(workers.hiring, 'hiring_manager', hiringClaim.rows[0]);
  const hiringOutput = reviewOutput(
    hiringClaim.rows[0].input,
    'hiring_manager',
    hiringIssues,
  );
  await completeProvider(
    workers.hiring,
    'hiring_manager',
    hiringClaim.rows[0],
    hiringOutput,
  );

  const factualClaim = await claim(workers.factuality, 'factuality');
  assert.equal(factualClaim.rowCount, 1);
  const factualOutput = reviewOutput(factualClaim.rows[0].input, 'factuality');
  await assert.rejects(
    workers.factuality.query(
      `select app.complete_factuality_reviewer_step($1,$2,$3)`,
      [
        factualClaim.rows[0].step_id,
        factualClaim.rows[0].lease_token,
        JSON.stringify({ ...factualOutput, verdict: 'changes_required' }),
      ],
    ),
    /invalid factuality reviewer output/,
  );
  const completed = await workers.factuality.query(
    `select app.complete_factuality_reviewer_step($1,$2,$3) artifact_id`,
    [
      factualClaim.rows[0].step_id,
      factualClaim.rows[0].lease_token,
      JSON.stringify(factualOutput),
    ],
  );
  const replay = await workers.factuality.query(
    `select app.complete_factuality_reviewer_step($1,$2,$3) artifact_id`,
    [
      factualClaim.rows[0].step_id,
      factualClaim.rows[0].lease_token,
      JSON.stringify(factualOutput),
    ],
  );
  assert.equal(completed.rows[0].artifact_id, replay.rows[0].artifact_id);
}

try {
  await admin.connect();
  await admin.query(`create database ${databaseName}`);
  await target.connect();
  const migrations = (await readdir('supabase/migrations'))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  assert.equal(migrations.at(-1)?.slice(0, 4), '0022');
  for (const migration of migrations)
    await target.query(
      await readFile(`supabase/migrations/${migration}`, 'utf8'),
    );

  await target.query(
    `insert into app.tenants (id,owner_id,name) values
      ($1,$2,'Reviewer tenant'),($3,$4,'Other tenant')`,
    [tenantId, ownerId, otherTenantId, otherOwnerId],
  );
  const allPassPage = await seedPage('All Pass');
  const objectionsPage = await seedPage('Objections');
  const crashedPage = await seedPage('Crash');
  const budgetCapPage = await seedPage('Budget cap');
  const app = await appClient();
  const otherApp = await appClient(otherTenantId, otherOwnerId);
  const recruiterA = await createLogin('career_recruiter_reviewer');
  const recruiterB = await createLogin('career_recruiter_reviewer');
  const hiring = await createLogin('career_hiring_manager_reviewer');
  const factuality = await createLogin('career_factuality_reviewer');
  const workers = { recruiter: recruiterA, hiring, factuality };

  const starts = randomUUID();
  assert.equal((await startReviews(app, allPassPage, starts)).started, true);
  assert.equal((await startReviews(app, allPassPage, starts)).started, false);
  await assert.rejects(startReviews(app, allPassPage), /review start conflict/);
  await assert.rejects(
    startReviews(app, objectionsPage, starts),
    /review start conflict/,
  );
  assert.equal(
    (
      await app.query('select app.page_spec_review_gate($1,$2,$3) allowed', [
        tenantId,
        allPassPage.pageSpecId,
        allPassPage.hash,
      ])
    ).rows[0].allowed,
    false,
  );
  await assert.rejects(
    otherApp.query('select app.start_page_spec_reviews($1,$2,$3)', [
      tenantId,
      objectionsPage.runId,
      randomUUID(),
    ]),
    /invalid review start/,
  );

  const concurrent = await Promise.all([
    claim(recruiterA, 'recruiter'),
    claim(recruiterB, 'recruiter'),
  ]);
  assert.deepEqual(concurrent.map((result) => result.rowCount).sort(), [0, 1]);
  const winner = concurrent.find((result) => result.rowCount === 1).rows[0];
  const winningClient = concurrent[0].rowCount === 1 ? recruiterA : recruiterB;
  workers.recruiter = winningClient;
  await dispatch(winningClient, 'recruiter', winner);
  await assert.rejects(
    completeProvider(
      winningClient,
      'recruiter',
      winner,
      reviewOutput(winner.input, 'recruiter', [
        {
          section: 'hero',
          message: 'Forged cross-run proof.',
          blocking: true,
          claimId: randomUUID(),
          evidenceIds: [randomUUID()],
        },
      ]),
    ),
    /invalid durable reviewer provenance/,
  );
  await assert.rejects(
    recruiterB.query(
      `select app.complete_recruiter_reviewer_step(
        $1,$2,$3,1,1,0,1,false,null
      )`,
      [
        winner.step_id,
        randomUUID(),
        JSON.stringify(reviewOutput(winner.input, 'recruiter')),
      ],
    ),
    /lease token mismatch/,
  );
  await completeProvider(
    winningClient,
    'recruiter',
    winner,
    reviewOutput(winner.input, 'recruiter'),
  );
  const firstHiring = (await claim(hiring, 'hiring_manager')).rows[0];
  await dispatch(hiring, 'hiring_manager', firstHiring);
  await completeProvider(
    hiring,
    'hiring_manager',
    firstHiring,
    reviewOutput(firstHiring.input, 'hiring_manager'),
  );
  const firstFactual = (await claim(factuality, 'factuality')).rows[0];
  const firstFactualOutput = reviewOutput(firstFactual.input, 'factuality');
  await factuality.query(
    'select app.complete_factuality_reviewer_step($1,$2,$3)',
    [
      firstFactual.step_id,
      firstFactual.lease_token,
      JSON.stringify(firstFactualOutput),
    ],
  );
  assert.deepEqual(
    (
      await target.query(
        'select status,state from app.workflow_runs where id=$1',
        [allPassPage.runId],
      )
    ).rows[0],
    { status: 'awaiting_approval', state: 'human_approval' },
  );
  assert.equal(
    (
      await app.query('select app.page_spec_review_gate($1,$2,$3) allowed', [
        tenantId,
        allPassPage.pageSpecId,
        allPassPage.hash,
      ])
    ).rows[0].allowed,
    true,
  );
  await app.query('select app.approve_page_spec($1)', [allPassPage.pageSpecId]);

  await target.query(
    'update app.workflow_runs set token_budget=200000 where id=$1',
    [budgetCapPage.runId],
  );
  await startReviews(app, budgetCapPage);
  const budgetClaim = (await claim(workers.recruiter, 'recruiter')).rows[0];
  await assert.rejects(
    dispatch(workers.recruiter, 'recruiter', budgetClaim, 99_329),
    /invalid durable reviewer dispatch/,
  );
  await dispatch(workers.recruiter, 'recruiter', budgetClaim, 99_328);
  assert.equal(
    (
      await target.query(
        `select requested_tokens from app.run_budget_reservations
         where workflow_run_id=$1 and owner_id=$2`,
        [budgetCapPage.runId, budgetClaim.lease_token],
      )
    ).rows[0].requested_tokens,
    99_328,
  );
  await workers.recruiter.query(
    'select app.fail_recruiter_reviewer_step($1,$2,$3)',
    [budgetClaim.step_id, budgetClaim.lease_token, 'provider_unavailable'],
  );

  await runPipeline(objectionsPage, app, workers, [
    {
      section: 'relevant_experience',
      message: 'The selected proof needs stronger emphasis for this role.',
      blocking: false,
      claimId: (
        await target.query(
          'select claim_id from app.page_spec_claims where page_spec_id=$1',
          [objectionsPage.pageSpecId],
        )
      ).rows[0].claim_id,
      evidenceIds: [
        (
          await target.query(
            'select evidence_id from app.page_spec_evidence where page_spec_id=$1',
            [objectionsPage.pageSpecId],
          )
        ).rows[0].evidence_id,
      ],
    },
  ]);
  assert.deepEqual(
    (
      await target.query(
        'select status,state from app.workflow_runs where id=$1',
        [objectionsPage.runId],
      )
    ).rows[0],
    { status: 'awaiting_approval', state: 'review_decision' },
  );
  assert.equal(
    (
      await app.query('select app.page_spec_review_gate($1,$2,$3) allowed', [
        tenantId,
        objectionsPage.pageSpecId,
        objectionsPage.hash,
      ])
    ).rows[0].allowed,
    false,
  );
  const objection = (
    await app.query(
      `select id,issues->0->>'message' message from app.reviews
       where page_spec_id=$1 and reviewer='hiring_manager'`,
      [objectionsPage.pageSpecId],
    )
  ).rows[0];
  await app.query(
    `insert into app.review_issue_decisions (
      tenant_id,workflow_run_id,page_spec_id,review_id,issue_index,issue_text,
      decision,decided_by,idempotency_key,input_hash
    ) values ($1,$2,$3,$4,0,$5,'keep',$6,$7,repeat('c',64))`,
    [
      tenantId,
      objectionsPage.runId,
      objectionsPage.pageSpecId,
      objection.id,
      objection.message,
      ownerId,
      randomUUID(),
    ],
  );
  assert.equal(
    (
      await app.query('select app.page_spec_review_gate($1,$2,$3) allowed', [
        tenantId,
        objectionsPage.pageSpecId,
        objectionsPage.hash,
      ])
    ).rows[0].allowed,
    true,
  );

  await startReviews(app, crashedPage);
  const crashed = (await claim(workers.recruiter, 'recruiter', 1)).rows[0];
  await dispatch(workers.recruiter, 'recruiter', crashed, 100);
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const reaped = await workers.recruiter.query(
    'select app.reap_expired_recruiter_reviewer_step() step_id',
  );
  assert.equal(reaped.rows[0].step_id, crashed.step_id);
  assert.deepEqual(
    (
      await target.query(
        `select run.status,run.reserved_tokens,run.used_tokens,
          step.failure_code,usage.usage_basis
         from app.workflow_runs run
         join app.workflow_steps step on step.workflow_run_id=run.id
         join app.model_usage usage on usage.workflow_step_id=step.id
         where run.id=$1 and step.id=$2`,
        [crashedPage.runId, crashed.step_id],
      )
    ).rows[0],
    {
      status: 'failed',
      reserved_tokens: 0,
      used_tokens: 100,
      failure_code: 'provider_outcome_unknown',
      usage_basis: 'reserved_unknown',
    },
  );
  assert.equal((await claim(workers.recruiter, 'recruiter')).rowCount, 0);

  await assert.rejects(
    hiring.query('select app.claim_recruiter_reviewer_step(60)'),
    /permission denied/,
  );
  const acl = await target.query(
    `select role_name,
      has_schema_privilege(role_name,'app','usage') app_usage,
      has_schema_privilege(role_name,'auth','usage') auth_usage,
      exists (
        select 1 from pg_class relation
        join pg_namespace namespace on namespace.oid=relation.relnamespace
        where namespace.nspname in ('app','auth')
          and relation.relkind in ('r','p','v','m','f')
          and (has_table_privilege(role_name,relation.oid,
            'select,insert,update,delete,truncate,references,trigger')
            or has_any_column_privilege(role_name,relation.oid,
              'select,insert,update,references'))
      ) table_access,
      array(
        select procedure.proname::text
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid=procedure.pronamespace
        where namespace.nspname in ('app','auth')
          and has_function_privilege(role_name,procedure.oid,'execute')
        order by procedure.proname
      ) executable
     from unnest(array[
       'career_recruiter_reviewer','career_hiring_manager_reviewer',
       'career_factuality_reviewer'
     ]) role_name`,
  );
  const expected = {
    career_recruiter_reviewer: [
      'claim_recruiter_reviewer_step',
      'complete_recruiter_reviewer_step',
      'fail_recruiter_reviewer_step',
      'mark_recruiter_reviewer_in_flight',
      'reap_expired_recruiter_reviewer_step',
      'record_worker_heartbeat',
    ],
    career_hiring_manager_reviewer: [
      'claim_hiring_manager_reviewer_step',
      'complete_hiring_manager_reviewer_step',
      'fail_hiring_manager_reviewer_step',
      'mark_hiring_manager_reviewer_in_flight',
      'reap_expired_hiring_manager_reviewer_step',
      'record_worker_heartbeat',
    ],
    career_factuality_reviewer: [
      'claim_factuality_reviewer_step',
      'complete_factuality_reviewer_step',
      'fail_factuality_reviewer_step',
      'reap_expired_factuality_reviewer_step',
      'record_worker_heartbeat',
    ],
  };
  for (const row of acl.rows) {
    assert.equal(row.app_usage, true);
    assert.equal(row.auth_usage, false);
    assert.equal(row.table_access, false);
    assert.deepEqual(row.executable, expected[row.role_name]);
  }
  assert.deepEqual(
    (
      await target.query(
        `select has_schema_privilege('career_reviewer','app','usage') app_usage,
          has_table_privilege('career_reviewer','app.reviews','insert') can_insert`,
      )
    ).rows[0],
    { app_usage: false, can_insert: false },
  );
  assert.equal(
    (
      await target.query(
        `select count(*)::int count from app.reviews
         where workflow_step_id is not null`,
      )
    ).rows[0].count,
    6,
  );
  assert.equal(
    (
      await target.query(
        `select count(*)::int count from app.model_usage usage
         join app.workflow_steps step on step.id=usage.workflow_step_id
         where step.stage in ('recruiter-reviewer','hiring-manager-reviewer')
           and usage.usage_basis='actual'`,
      )
    ).rows[0].count,
    4,
  );

  console.log('durable reviewer security tests passed');
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  await target.end().catch(() => undefined);
  if (admin._connected)
    await admin
      .query(`drop database if exists ${databaseName} with (force)`)
      .catch(() => undefined);
  await admin.end().catch(() => undefined);
}
