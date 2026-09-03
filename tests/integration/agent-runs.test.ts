import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { syntheticProfile } from '../../lib/fixture';
import type { PersistedRun } from '../../lib/run-contract';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3019';
const authOrigin = process.env.TEST_AUTH_ORIGIN ?? baseUrl;
const requestOrigin = process.env.TEST_REQUEST_ORIGIN ?? baseUrl;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const suffix = randomUUID();

class BrowserSession {
  private readonly cookies = new Map<string, string>();

  async request(path: string, method = 'GET', body?: unknown, headers = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'GET' ? {} : { origin: requestOrigin }),
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseHeaders = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    for (const setCookie of responseHeaders.getSetCookie?.() ?? [
      response.headers.get('set-cookie'),
    ]) {
      if (!setCookie) continue;
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator > 0)
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }

  private cookieHeader() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

async function expectStatus(
  response: Response,
  expected: number,
  context: string,
) {
  if (response.status !== expected)
    assert.fail(
      `${context}: expected ${expected}, received ${response.status}: ${await response.text()}`,
    );
}

async function createWorkspace(label: string) {
  const browser = new BrowserSession();
  await expectStatus(
    await browser.request(
      '/api/auth/sign-up/email',
      'POST',
      {
        name: label,
        email: `${label.toLowerCase()}-${suffix}@example.test`,
        password: 'safe-local-password',
      },
      { origin: authOrigin },
    ),
    200,
    `${label} sign-up`,
  );
  await expectStatus(
    await browser.request(
      '/api/auth/organization/create',
      'POST',
      { name: label, slug: `${label.toLowerCase()}-${suffix}` },
      { origin: authOrigin },
    ),
    200,
    `${label} organization`,
  );
  return browser;
}

async function main() {
  const anonymous = new BrowserSession();
  await expectStatus(
    await anonymous.request('/api/runs', 'POST', {
      applicationId: randomUUID(),
      applicationRevision: 1,
      profileRevision: 1,
    }),
    401,
    'anonymous run',
  );

  const owner = await createWorkspace('RunOwner');
  const saved = await owner.request('/api/profile', 'PUT', {
    profile: syntheticProfile,
    expectedRevision: 0,
  });
  await expectStatus(saved, 200, 'saved Career Memory');
  const profile = (await saved.json()) as { revision: number };
  const applicationResponse = await owner.request(
    '/api/applications',
    'POST',
    {
      company: 'Northstar Labs',
      role: 'Senior Product Engineer',
      description: 'Ship dependable product workflows.',
      url: 'https://jobs.example.test/product-engineer',
      accent: '#21504b',
    },
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(applicationResponse, 201, 'persisted application');
  const application = (await applicationResponse.json()) as {
    applicationId: string;
    revision: number;
  };
  const runInput = {
    applicationId: application.applicationId,
    applicationRevision: application.revision,
    profileRevision: profile.revision,
  };
  const key = randomUUID();

  const create = await owner.request('/api/runs', 'POST', runInput, {
    'idempotency-key': key,
  });
  await expectStatus(create, 202, 'durable run accepted');
  assert.equal(create.headers.get('cache-control'), 'private, no-store');
  const run = (await create.json()) as PersistedRun;
  assert.equal(run.status, 'running');
  assert.equal(run.stage, 'research');
  assert.equal(run.revision, 0);
  assert.equal(run.usedTokens, 0);
  assert.equal(run.usedCostMicros, 0);
  assert.equal(run.spec, undefined);
  assert.deepEqual(run.reviews, []);
  assert.deepEqual(run.steps, [
    { stage: 'company-researcher', status: 'pending', attempt: 1 },
  ]);

  const replay = await owner.request('/api/runs', 'POST', runInput, {
    'idempotency-key': key,
  });
  await expectStatus(replay, 200, 'idempotent replay');
  assert.deepEqual(await replay.json(), run);

  for (let index = 0; index < 4; index += 1)
    await expectStatus(
      await owner.request('/api/runs', 'POST', runInput, {
        'idempotency-key': randomUUID(),
      }),
      202,
      `concurrent run ${index + 2}`,
    );
  const limited = await owner.request('/api/runs', 'POST', runInput, {
    'idempotency-key': randomUUID(),
  });
  await expectStatus(limited, 429, 'active run admission limit');
  assert.equal(limited.headers.get('retry-after'), '60');
  await expectStatus(
    await owner.request('/api/runs', 'POST', runInput, {
      'idempotency-key': key,
    }),
    200,
    'idempotent replay bypasses admission limit',
  );
  await expectStatus(
    await owner.request(
      '/api/runs',
      'POST',
      { ...runInput, applicationRevision: application.revision + 1 },
      { 'idempotency-key': key },
    ),
    409,
    'idempotency key reused with a different input',
  );

  const read = await owner.request(`/api/runs/${run.runId}`);
  await expectStatus(read, 200, 'run read');
  assert.deepEqual(await read.json(), run);
  await expectStatus(
    await owner.request(
      `/api/runs/${run.runId}/reviews`,
      'POST',
      {},
      { 'idempotency-key': randomUUID() },
    ),
    400,
    'review start rejected before PageSpec',
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const stored = await pool.query(
      `select p.profile_kind, wr.source_profile_revision, wr.token_budget,
        o.company as opportunity_company,
        (select count(*) from app.workflow_steps where workflow_run_id = wr.id) step_count,
        (select count(*) from app.artifacts where workflow_run_id = wr.id) artifact_count,
        (select count(*) from app.page_specs where workflow_run_id = wr.id) page_spec_count,
        (select count(*) from app.reviews r join app.page_specs ps on ps.id = r.page_spec_id where ps.workflow_run_id = wr.id) review_count,
        (select count(*) from app.model_usage where workflow_run_id = wr.id) usage_count,
        (select input from app.workflow_steps where workflow_run_id = wr.id) step_input
       from app.workflow_runs wr
       join app.profiles p on p.id = wr.profile_id
       join app.opportunities o on o.id = wr.opportunity_id
       where wr.id = $1`,
      [run.runId],
    );
    assert.deepEqual(stored.rows[0], {
      profile_kind: 'snapshot',
      source_profile_revision: '1',
      token_budget: 462592,
      opportunity_company: 'Northstar Labs',
      step_count: '1',
      artifact_count: '0',
      page_spec_count: '0',
      review_count: '0',
      usage_count: '0',
      step_input: {
        schemaVersion: 1,
        company: 'Northstar Labs',
        role: 'Senior Product Engineer',
        description: 'Ship dependable product workflows.',
        source: {
          kind: 'job-posting',
          url: 'https://jobs.example.test/product-engineer',
          trust: 'untrusted-data',
        },
      },
    });

    const proof = (
      await pool.query(
        `select claim.id claim_id,claim.statement,evidence.id evidence_id
         from app.workflow_runs run
         join app.claims claim on claim.profile_id=run.profile_id
           and claim.tenant_id=run.tenant_id
         join app.claim_evidence link on link.claim_id=claim.id
           and link.profile_id=claim.profile_id and link.tenant_id=claim.tenant_id
         join app.evidence evidence on evidence.id=link.evidence_id
           and evidence.profile_id=claim.profile_id
           and evidence.tenant_id=claim.tenant_id
         where run.id=$1 order by claim.position,link.position limit 1`,
        [run.runId],
      )
    ).rows[0];
    const artifactId = randomUUID();
    const pageSpecId = randomUUID();
    const pageSpec = {
      version: 1,
      company: {
        name: 'Northstar Labs',
        role: 'Senior Product Engineer',
        accent: '#21504b',
      },
      hero: {
        eyebrow: 'Private application',
        title: 'Ada Lovelace × Northstar Labs',
        thesis: proof.statement,
      },
      blocks: [
        {
          type: 'fit',
          title: 'Relevant experience',
          claimIds: [proof.claim_id],
        },
      ],
    };
    await pool.query(
      `insert into app.artifacts (
         id,tenant_id,workflow_run_id,kind,version,schema_version,body,created_by
       ) select $2,tenant_id,id,'page_spec',1,1,$3,'page_composer'
         from app.workflow_runs where id=$1`,
      [run.runId, artifactId, JSON.stringify(pageSpec)],
    );
    await pool.query(
      `insert into app.page_specs (
         id,tenant_id,workflow_run_id,version,spec,input_hash,source_artifact_id
       ) select $4,tenant_id,id,1,$3,repeat('d',64),$2
         from app.workflow_runs where id=$1`,
      [run.runId, artifactId, JSON.stringify(pageSpec), pageSpecId],
    );
    await pool.query(
      `insert into app.page_spec_claims (tenant_id,page_spec_id,claim_id)
         select tenant_id,$2,$3 from app.workflow_runs where id=$1`,
      [run.runId, pageSpecId, proof.claim_id],
    );
    await pool.query(
      `insert into app.page_spec_evidence (
         tenant_id,page_spec_id,claim_id,evidence_id,position
       ) select tenant_id,$2,$3,$4,0 from app.workflow_runs where id=$1`,
      [run.runId, pageSpecId, proof.claim_id, proof.evidence_id],
    );
    await pool.query(
      `insert into app.workflow_steps (
         tenant_id,workflow_run_id,stage,status,idempotency_key,input,input_hash,
         output_artifact_id,page_spec_id,completed_at
       ) select tenant_id,id,'page-composer','completed',
         'http-review-fixture','{}'::jsonb,
         encode(digest('{}'::jsonb::text,'sha256'),'hex'),$2,$3,now()
         from app.workflow_runs where id=$1`,
      [run.runId, artifactId, pageSpecId],
    );
    await pool.query(
      `update app.workflow_runs set status='paused',state='page_spec_review'
       where id=$1`,
      [run.runId],
    );
  } finally {
    await pool.end();
  }

  const reviewKey = randomUUID();
  await expectStatus(
    await owner.request(
      `/api/runs/${run.runId}/reviews`,
      'POST',
      {},
      { 'idempotency-key': reviewKey },
    ),
    202,
    'review start accepted',
  );
  await expectStatus(
    await owner.request(
      `/api/runs/${run.runId}/reviews`,
      'POST',
      {},
      { 'idempotency-key': reviewKey },
    ),
    200,
    'review start replayed',
  );
  await expectStatus(
    await owner.request(
      `/api/runs/${run.runId}/reviews`,
      'POST',
      {},
      { 'idempotency-key': randomUUID() },
    ),
    409,
    'review start conflict',
  );

  const other = await createWorkspace('RunOther');
  await expectStatus(
    await other.request(`/api/runs/${run.runId}`),
    404,
    'cross-tenant run read',
  );
}

main().then(
  () => console.log('durable agent run HTTP integration ok'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
