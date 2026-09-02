import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { syntheticProfile } from '../../lib/fixture';
import type { PageSpec, Profile } from '../../lib/schemas';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3019';
const authOrigin = process.env.TEST_AUTH_ORIGIN ?? baseUrl;
const requestOrigin = process.env.TEST_REQUEST_ORIGIN ?? baseUrl;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const suffix = randomUUID();
const opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
};

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
  const organization = await browser.request(
    '/api/auth/organization/create',
    'POST',
    { name: label, slug: `${label.toLowerCase()}-${suffix}` },
    { origin: authOrigin },
  );
  await expectStatus(organization, 200, `${label} organization`);
  return {
    browser,
    organization: (await organization.json()) as { id: string },
  };
}

async function main() {
  const anonymous = new BrowserSession();
  await expectStatus(
    await anonymous.request('/api/runs', 'POST', {
      opportunity,
      profileRevision: 1,
    }),
    401,
    'anonymous run',
  );

  const owner = await createWorkspace('RunOwner');
  const saved = await owner.browser.request('/api/profile', 'PUT', {
    profile: syntheticProfile,
    expectedRevision: 0,
  });
  await expectStatus(saved, 200, 'saved Career Memory');
  const savedProfile = (await saved.json()) as { revision: number };
  const idempotencyKey = randomUUID();
  const create = await owner.browser.request(
    '/api/runs',
    'POST',
    { opportunity, profileRevision: savedProfile.revision },
    { 'idempotency-key': idempotencyKey },
  );
  await expectStatus(create, 201, 'persisted run');
  const run = (await create.json()) as {
    runId: string;
    status: string;
    revision: number;
    usedCostMicros: number;
    profile: Profile;
    spec: PageSpec;
    reviews: Array<{ passed: boolean }>;
    events: unknown[];
  };
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(run.revision, 1);
  assert.equal(run.usedCostMicros, 0);
  const claimIds = new Set(run.profile.claims.map((claim) => claim.id));
  assert.ok(
    run.spec.blocks
      .flatMap((block) => ('claimIds' in block ? block.claimIds : []))
      .every((claimId) => claimIds.has(claimId)),
  );
  assert.ok(run.spec);
  assert.equal(run.reviews.length, 3);
  assert.ok(run.reviews.every((review) => review.passed));
  assert.ok(run.events.length > 0);

  const replay = await owner.browser.request(
    '/api/runs',
    'POST',
    { opportunity, profileRevision: savedProfile.revision },
    { 'idempotency-key': idempotencyKey },
  );
  await expectStatus(replay, 200, 'idempotent replay');
  assert.deepEqual(await replay.json(), run);
  await expectStatus(
    await owner.browser.request(
      '/api/runs',
      'POST',
      {
        opportunity: { ...opportunity, company: 'Different Company' },
        profileRevision: savedProfile.revision,
      },
      { 'idempotency-key': idempotencyKey },
    ),
    409,
    'idempotency key reused with a different input',
  );
  const read = await owner.browser.request(`/api/runs/${run.runId}`);
  await expectStatus(read, 200, 'run read');
  assert.deepEqual(await read.json(), run);

  const other = await createWorkspace('RunOther');
  await expectStatus(
    await other.browser.request(`/api/runs/${run.runId}`),
    404,
    'cross-tenant run read',
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const stored = await pool.query<{
      profile_kind: string;
      source_profile_revision: string;
      event_count: string;
      artifact_count: string;
      page_spec_count: string;
      review_count: string;
      usage_count: string;
    }>(
      `select p.profile_kind, wr.source_profile_revision,
        (select count(*) from app.workflow_events where workflow_run_id = wr.id) event_count,
        (select count(*) from app.artifacts where workflow_run_id = wr.id) artifact_count,
        (select count(*) from app.page_specs where workflow_run_id = wr.id) page_spec_count,
        (select count(*) from app.reviews r join app.page_specs ps on ps.id = r.page_spec_id where ps.workflow_run_id = wr.id) review_count,
        (select count(*) from app.model_usage where workflow_run_id = wr.id) usage_count
      from app.workflow_runs wr join app.profiles p on p.id = wr.profile_id
      where wr.id = $1`,
      [run.runId],
    );
    assert.equal(stored.rows[0].profile_kind, 'snapshot');
    assert.equal(Number(stored.rows[0].source_profile_revision), 1);
    assert.ok(Number(stored.rows[0].event_count) > 0);
    assert.equal(Number(stored.rows[0].artifact_count), 7);
    assert.equal(Number(stored.rows[0].page_spec_count), 2);
    assert.equal(Number(stored.rows[0].review_count), 6);
    assert.equal(Number(stored.rows[0].usage_count), 0);
  } finally {
    await pool.end();
  }
}

main().then(
  () => console.log('agent runs integration ok'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
