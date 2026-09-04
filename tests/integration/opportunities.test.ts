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
      fetchedUrl: finalUrl,
      fetchedAt: '2026-09-04T10:00:00.000Z',
      contentType: 'text/html' as const,
      bytes: 2_048,
      sha256: 'a'.repeat(64),
      trust: 'untrusted-data' as const,
    },
    normalized: {
      location: null,
      remoteMode: 'unknown' as const,
      contractType: 'unknown' as const,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      publishedAt: null,
      externalId: null,
      sourceKind: 'generic_html' as const,
      lifecycleSignal: 'unknown' as const,
    },
  };
}

function greenhouseObservation(
  lifecycleSignal: 'open' | 'closed' | 'unknown',
  sha256: string,
  requestedUrl = 'https://job-boards.greenhouse.io/acme/jobs/101',
) {
  const finalUrl = 'https://job-boards.greenhouse.io/acme/jobs/101';
  return {
    extraction: {
      company: 'Acme Systems',
      role: 'Senior Engineer',
      description: 'Build dependable systems.',
      sourceUrl: finalUrl,
    },
    normalized: {
      location: 'Paris, France',
      remoteMode: 'hybrid' as const,
      contractType: 'full_time' as const,
      salaryMin: 80000,
      salaryMax: 100000,
      salaryCurrency: 'EUR',
      publishedAt: '2026-09-01T08:00:00.000Z',
      externalId: 'acme:101',
      sourceKind: 'greenhouse' as const,
      lifecycleSignal,
    },
    provenance: {
      requestedUrl,
      finalUrl,
      fetchedUrl:
        'https://boards-api.greenhouse.io/v1/boards/acme/jobs/101?pay_transparency=true',
      fetchedAt: '2026-09-04T11:00:00.000Z',
      contentType: 'application/json' as const,
      bytes: 1_024,
      sha256,
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
  assert.equal(first.opportunity.observations.length, 1);
  assert.equal(first.opportunity.lifecycle, 'open');

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
  assert.equal(replay.opportunity.observations.length, 2);
  assert.equal(
    replay.opportunity.observations.some(
      (observation) => observation.change === 'unchanged',
    ),
    true,
  );

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
  assert.equal(refresh.opportunity.lifecycle, 'changed');
  assert.equal(
    refresh.opportunity.observations.some(
      (observation) => observation.change === 'changed',
    ),
    true,
  );

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
  assert.equal(alias.opportunity.observations.length, 4);

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

  const connected = await storeDiscoveredJob(
    owner.session,
    greenhouseObservation('open', 'b'.repeat(64)),
  );
  assert.equal(connected.created, true);
  assert.equal(connected.opportunity.location, 'Paris, France');
  assert.equal(connected.opportunity.remoteMode, 'hybrid');
  assert.equal(connected.opportunity.salaryMin, 80000);
  assert.equal(connected.opportunity.fingerprint?.length, 64);

  const exactReplay = await storeDiscoveredJob(
    owner.session,
    greenhouseObservation(
      'open',
      'b'.repeat(64),
      'https://job-boards.greenhouse.io/acme/jobs/101?gh_src=campaign',
    ),
  );
  assert.equal(exactReplay.created, false);
  assert.equal(
    exactReplay.opportunity.opportunityId,
    connected.opportunity.opportunityId,
  );
  assert.equal(exactReplay.opportunity.sources.length, 1);
  assert.equal(exactReplay.opportunity.sources[0].matchedBy, 'exact_source');

  const closed = await storeDiscoveredJob(
    owner.session,
    greenhouseObservation('closed', 'b'.repeat(64)),
  );
  assert.equal(closed.opportunity.lifecycle, 'closed');
  assert.equal(
    closed.opportunity.observations.some(
      (observation) => observation.change === 'closed',
    ),
    true,
  );

  const noClosureInference = await storeDiscoveredJob(
    owner.session,
    greenhouseObservation('unknown', 'b'.repeat(64)),
  );
  assert.equal(noClosureInference.opportunity.lifecycle, 'closed');
  assert.equal(
    noClosureInference.opportunity.observations.some(
      (observation) => observation.change === 'unchanged',
    ),
    true,
  );

  const reposted = await storeDiscoveredJob(
    owner.session,
    greenhouseObservation('open', 'c'.repeat(64)),
  );
  assert.equal(reposted.opportunity.lifecycle, 'reposted');
  assert.equal(
    reposted.opportunity.observations.some(
      (observation) => observation.change === 'reposted',
    ),
    true,
  );
  assert.equal(reposted.opportunity.observations.length, 5);

  const greenhouse = greenhouseObservation('open', 'd'.repeat(64));
  const syndicatedUrl = 'https://jobs.ashbyhq.com/acme/syndicated-101';
  const syndicated = {
    ...greenhouse,
    extraction: { ...greenhouse.extraction, sourceUrl: syndicatedUrl },
    normalized: {
      ...greenhouse.normalized,
      sourceKind: 'ashby' as const,
      externalId: 'acme:syndicated-101',
    },
    provenance: {
      ...greenhouse.provenance,
      requestedUrl: syndicatedUrl,
      finalUrl: syndicatedUrl,
      fetchedUrl:
        'https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true',
    },
  };
  const fingerprintMatch = await storeDiscoveredJob(owner.session, syndicated);
  assert.equal(fingerprintMatch.created, false);
  assert.equal(
    fingerprintMatch.opportunity.opportunityId,
    connected.opportunity.opportunityId,
  );
  assert.equal(fingerprintMatch.opportunity.sources.length, 2);
  assert.equal(
    fingerprintMatch.opportunity.sources.some(
      (source) => source.matchedBy === 'fingerprint',
    ),
    true,
  );

  const ambiguityPool = new Pool({ connectionString: databaseUrl });
  const duplicateJobId = randomUUID();
  try {
    await ambiguityPool.query(
      `insert into app.discovered_jobs (
        id, tenant_id, company, role, description, canonical_url, location,
        fingerprint, first_seen_at, last_seen_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
      [
        duplicateJobId,
        owner.session.tenantId,
        'Acme Systems',
        'Senior Engineer',
        'A genuinely separate opening with the same public fields.',
        'https://careers.acme.test/separate-opening',
        'Paris, France',
        connected.opportunity.fingerprint,
      ],
    );
  } finally {
    await ambiguityPool.end();
  }
  const ambiguousUrl = 'https://jobs.ashbyhq.com/acme/ambiguous-opening';
  const ambiguous = {
    ...syndicated,
    extraction: { ...syndicated.extraction, sourceUrl: ambiguousUrl },
    normalized: {
      ...syndicated.normalized,
      externalId: 'acme:ambiguous-opening',
    },
    provenance: {
      ...syndicated.provenance,
      requestedUrl: ambiguousUrl,
      finalUrl: ambiguousUrl,
      sha256: 'e'.repeat(64),
    },
  };
  const ambiguityPreserved = await storeDiscoveredJob(owner.session, ambiguous);
  assert.equal(ambiguityPreserved.created, true);
  assert.notEqual(
    ambiguityPreserved.opportunity.opportunityId,
    connected.opportunity.opportunityId,
  );
  assert.notEqual(ambiguityPreserved.opportunity.opportunityId, duplicateJobId);

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
      jobs: '4',
      sources: '5',
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
