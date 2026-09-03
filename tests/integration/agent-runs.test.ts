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
      token_budget: 131840,
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
  } finally {
    await pool.end();
  }

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
