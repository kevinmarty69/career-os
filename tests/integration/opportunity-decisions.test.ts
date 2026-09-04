import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { storeDiscoveredJob } from '../../lib/server/discovered-jobs';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3019';
const authOrigin = process.env.TEST_AUTH_ORIGIN ?? baseUrl;
const requestOrigin = process.env.TEST_REQUEST_ORIGIN ?? baseUrl;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const requiredDatabaseUrl: string = databaseUrl;
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
  const response = await browser.request('/api/auth/get-session');
  await expectStatus(response, 200, `${label} session`);
  const payload = (await response.json()) as {
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

const searchProfile = {
  name: 'Product engineering',
  active: true,
  hardConstraints: {
    roles: ['Product Engineer'],
    seniorities: [],
    locations: [],
    remoteModes: [],
    timezones: [],
    languages: [],
    contractTypes: [],
    excludedCompanies: [],
    excludedNetworks: [],
  },
  softPreferences: {
    stacks: [],
    sectors: [],
    productTypes: [],
    companySizes: [],
    cultures: [],
  },
};

function importedJob() {
  const url = 'https://jobs.example.test/product-engineer';
  return {
    extraction: {
      company: 'Example Labs',
      role: 'Product Engineer',
      description: 'Build dependable product systems.',
      sourceUrl: url,
    },
    provenance: {
      requestedUrl: url,
      finalUrl: url,
      fetchedUrl: url,
      fetchedAt: '2026-09-04T12:00:00.000Z',
      contentType: 'text/html' as const,
      bytes: 1_024,
      sha256: 'a'.repeat(64),
      trust: 'untrusted-data' as const,
    },
    normalized: {
      location: 'Paris, France',
      remoteMode: 'hybrid' as const,
      contractType: 'full_time' as const,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: 'unknown' as const,
      publishedAt: null,
      externalId: null,
      sourceKind: 'generic_html' as const,
      lifecycleSignal: 'open' as const,
    },
  };
}

function decision(searchProfileId: string | null, expectedRevision: number) {
  return {
    searchProfileId,
    disposition: 'ignored',
    qualification: 'exploratory',
    reason: 'location',
    note: 'Outside the current commute boundary.',
    expectedRevision,
  };
}

async function main() {
  const anonymous = new BrowserSession();
  await expectStatus(
    await anonymous.request('/api/opportunities/decisions'),
    401,
    'anonymous decision list',
  );

  const owner = await createWorkspace('DecisionOwner');
  const other = await createWorkspace('DecisionOther');
  const opportunity = await storeDiscoveredJob(owner.session, importedJob());
  const profileResponse = await owner.browser.request(
    '/api/search-profiles',
    'POST',
    searchProfile,
  );
  await expectStatus(profileResponse, 201, 'search profile create');
  const profile = (await profileResponse.json()) as {
    searchProfileId: string;
    revision: number;
  };
  const path = `/api/opportunities/${opportunity.opportunity.opportunityId}/decision`;
  const input = decision(profile.searchProfileId, 0);

  await expectStatus(
    await owner.browser.request(path, 'PUT', input, {
      origin: 'https://attacker.example',
      'idempotency-key': randomUUID(),
    }),
    403,
    'cross-origin mutation',
  );
  await expectStatus(
    await owner.browser.request(path, 'PUT', input),
    400,
    'missing idempotency key',
  );
  await expectStatus(
    await owner.browser.request(
      path,
      'PUT',
      { ...input, note: 'x'.repeat(501) },
      { 'idempotency-key': randomUUID() },
    ),
    400,
    'bounded note',
  );
  await expectStatus(
    await owner.browser.request(
      path,
      'PUT',
      { ...input, note: 'x'.repeat(5_000) },
      { 'idempotency-key': randomUUID() },
    ),
    413,
    'bounded payload',
  );
  await expectStatus(
    await other.browser.request(path, 'PUT', input, {
      'idempotency-key': randomUUID(),
    }),
    404,
    'cross-tenant mutation',
  );

  const key = randomUUID();
  const createdResponse = await owner.browser.request(path, 'PUT', input, {
    'idempotency-key': key,
  });
  await expectStatus(createdResponse, 200, 'decision create');
  const created = (await createdResponse.json()) as {
    decision: {
      decisionId: string;
      revision: number;
      actor: string;
      history: unknown[];
    };
  };
  assert.equal(created.decision.revision, 1);
  assert.equal(created.decision.actor, 'human');
  assert.equal(created.decision.history.length, 1);

  const replay = await owner.browser.request(path, 'PUT', input, {
    'idempotency-key': key,
  });
  await expectStatus(replay, 200, 'idempotent replay');
  assert.deepEqual(await replay.json(), created);
  await expectStatus(
    await owner.browser.request(
      path,
      'PUT',
      { ...input, note: 'Different input' },
      { 'idempotency-key': key },
    ),
    409,
    'idempotency mismatch',
  );

  const correctedInput = {
    ...input,
    disposition: 'archived',
    qualification: 'interesting',
    reason: 'career_direction',
    note: null,
    expectedRevision: 1,
  };
  const correctedResponse = await owner.browser.request(
    path,
    'PUT',
    correctedInput,
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(correctedResponse, 200, 'decision correction');
  const corrected = (await correctedResponse.json()) as {
    decision: { revision: number; history: unknown[] };
  };
  assert.equal(corrected.decision.revision, 2);
  assert.equal(corrected.decision.history.length, 2);

  const concurrent = await Promise.all([
    owner.browser.request(
      path,
      'PUT',
      {
        ...correctedInput,
        disposition: 'saved',
        qualification: 'priority',
        reason: 'strong_fit',
        expectedRevision: 2,
      },
      { 'idempotency-key': randomUUID() },
    ),
    owner.browser.request(
      path,
      'PUT',
      {
        ...correctedInput,
        disposition: 'ignored',
        qualification: 'ignore',
        reason: 'weak_evidence',
        expectedRevision: 2,
      },
      { 'idempotency-key': randomUUID() },
    ),
  ]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 409]);

  const listResponse = await owner.browser.request(
    '/api/opportunities/decisions',
  );
  await expectStatus(listResponse, 200, 'decision list');
  const list = (await listResponse.json()) as {
    decisions: Array<{
      decisionId: string;
      searchProfileId: string | null;
      history: unknown[];
    }>;
    feedback: Array<{
      searchProfileId: string;
      outcomes: Array<{ count: number }>;
    }>;
  };
  assert.equal(list.decisions.length, 1);
  assert.equal(list.decisions[0].history.length, 3);
  assert.equal(list.feedback.length, 1);
  assert.equal(
    list.feedback[0].outcomes.reduce((sum, item) => sum + item.count, 0),
    1,
  );
  const otherList = await other.browser.request('/api/opportunities/decisions');
  await expectStatus(otherList, 200, 'isolated decision list');
  assert.deepEqual(await otherList.json(), { decisions: [], feedback: [] });

  const sql = postgres(requiredDatabaseUrl, { max: 1 });
  try {
    const [integrity] = await sql<
      {
        job_revision: string;
        profile_revision: string;
        events: string;
        audits: string;
        note_leaked: boolean;
      }[]
    >`select
      (select revision from app.discovered_jobs
        where id = ${opportunity.opportunity.opportunityId}) as job_revision,
      (select revision from app.search_profiles
        where id = ${profile.searchProfileId}) as profile_revision,
      (select count(*) from app.opportunity_decision_events
        where decision_id = ${created.decision.decisionId}) as events,
      (select count(*) from app.audit_events
        where entity_id = ${opportunity.opportunity.opportunityId}
          and event_type = 'opportunity_decision_recorded') as audits,
      exists(select 1 from app.audit_events
        where entity_id = ${opportunity.opportunity.opportunityId}
          and summary::text like '%commute%') as note_leaked`;
    assert.deepEqual(integrity, {
      job_revision: '1',
      profile_revision: '1',
      events: '3',
      audits: '3',
      note_leaked: false,
    });

    const profileDelete = await owner.browser.request(
      `/api/search-profiles/${profile.searchProfileId}`,
      'DELETE',
      { expectedRevision: profile.revision },
    );
    await expectStatus(profileDelete, 204, 'search profile delete');
    const afterProfileDelete = await owner.browser.request(
      '/api/opportunities/decisions',
    );
    await expectStatus(
      afterProfileDelete,
      200,
      'decision after profile delete',
    );
    const preserved = (await afterProfileDelete.json()) as {
      decisions: Array<{
        searchProfileId: string | null;
        history: Array<{ searchProfileId: string | null }>;
      }>;
      feedback: unknown[];
    };
    assert.equal(preserved.decisions.length, 1);
    assert.equal(preserved.decisions[0].searchProfileId, null);
    assert.equal(
      preserved.decisions[0].history.every(
        (event) => event.searchProfileId === null,
      ),
      true,
    );
    assert.deepEqual(preserved.feedback, []);
  } finally {
    await sql.end();
  }
}

main().then(
  () => console.log('opportunity decisions integration ok'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
