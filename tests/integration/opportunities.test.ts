import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { storeDiscoveredJob } from '../../lib/server/discovered-jobs';

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
  const sessionResponse = await browser.request('/api/auth/get-session');
  await expectStatus(sessionResponse, 200, `${label} active session`);
  const payload = (await sessionResponse.json()) as {
    user: { id: string };
    session: { activeOrganizationId: string };
  };
  return {
    browser,
    session: {
      userId: payload.user.id,
      tenantId: payload.session.activeOrganizationId,
      tenantName: label,
    },
  };
}

function importedJob(
  requestedUrl: string,
  description = 'Build dependable platform systems.',
) {
  const finalUrl = 'https://jobs.example.test/platform-engineer';
  return {
    extraction: {
      company: 'Example Systems',
      role: 'Platform Engineer',
      description,
      sourceUrl: finalUrl,
    },
    provenance: {
      requestedUrl,
      finalUrl,
      fetchedAt: '2026-09-04T10:00:00.000Z',
      contentType: 'text/html' as const,
      bytes: 2_048,
      sha256: 'a'.repeat(64),
      trust: 'untrusted-data' as const,
    },
  };
}

async function main() {
  const anonymous = new BrowserSession();
  await expectStatus(
    await anonymous.request('/api/opportunities'),
    401,
    'anonymous opportunity list',
  );
  await expectStatus(
    await anonymous.request('/api/opportunities/import-url', 'POST', {
      url: 'https://jobs.example.test/platform-engineer',
    }),
    401,
    'anonymous opportunity import',
  );

  const owner = await createWorkspace('OpportunityOwner');
  await expectStatus(
    await owner.browser.request(
      '/api/opportunities/import-url',
      'POST',
      { url: 'https://jobs.example.test/platform-engineer' },
      { origin: 'https://attacker.example' },
    ),
    403,
    'cross-origin opportunity import',
  );
  await expectStatus(
    await owner.browser.request('/api/opportunities/import-url', 'POST', {
      url: 'http://127.0.0.1/admin',
    }),
    400,
    'private-network opportunity import',
  );

  const requestedUrl = 'https://jobs.example.test/opening?team=platform';
  const first = await storeDiscoveredJob(
    owner.session,
    importedJob(requestedUrl),
  );
  assert.equal(first.created, true);
  assert.equal(first.opportunity.revision, 1);
  assert.equal(first.opportunity.sources.length, 1);

  const replay = await storeDiscoveredJob(
    owner.session,
    importedJob(requestedUrl),
  );
  assert.equal(replay.created, false);
  assert.equal(
    replay.opportunity.opportunityId,
    first.opportunity.opportunityId,
  );
  assert.equal(replay.opportunity.revision, 1);
  assert.equal(replay.opportunity.sources.length, 1);

  const refresh = await storeDiscoveredJob(
    owner.session,
    importedJob(requestedUrl, 'Build dependable platform and product systems.'),
  );
  assert.equal(refresh.created, false);
  assert.equal(
    refresh.opportunity.opportunityId,
    first.opportunity.opportunityId,
  );
  assert.equal(refresh.opportunity.revision, 2);
  assert.equal(refresh.opportunity.sources.length, 1);

  const alias = await storeDiscoveredJob(
    owner.session,
    importedJob('https://careers.example.test/jobs/123'),
  );
  assert.equal(alias.created, false);
  assert.equal(
    alias.opportunity.opportunityId,
    first.opportunity.opportunityId,
  );
  assert.equal(alias.opportunity.sources.length, 2);

  const list = await owner.browser.request('/api/opportunities');
  await expectStatus(list, 200, 'opportunity list');
  const listed = (await list.json()) as {
    opportunities: (typeof alias.opportunity)[];
  };
  assert.equal(listed.opportunities.length, 1);
  assert.equal(
    listed.opportunities[0].opportunityId,
    first.opportunity.opportunityId,
  );
  assert.equal(listed.opportunities[0].sources.length, 2);

  const other = await createWorkspace('OpportunityOther');
  const otherList = await other.browser.request('/api/opportunities');
  await expectStatus(otherList, 200, 'other tenant opportunity list');
  assert.deepEqual(await otherList.json(), { opportunities: [] });

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const counts = await pool.query<{
      jobs: string;
      sources: string;
      applications: string;
    }>(
      `select
        (select count(*) from app.discovered_jobs where tenant_id = $1) jobs,
        (select count(*) from app.job_source_records where tenant_id = $1) sources,
        (select count(*) from app.applications where tenant_id = $1) applications`,
      [owner.session.tenantId],
    );
    assert.deepEqual(counts.rows[0], {
      jobs: '1',
      sources: '2',
      applications: '0',
    });
  } finally {
    await pool.end();
  }
}

main().then(
  () => console.log('opportunities integration ok'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
