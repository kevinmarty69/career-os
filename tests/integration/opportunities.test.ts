import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { syntheticProfile } from '../../lib/fixture';
import {
  buildSemanticAnalysis,
  type SemanticAnalysisInput,
} from '../../lib/semantic-match';
import {
  listDiscoveredJobs,
  storeDiscoveredJob,
} from '../../lib/server/discovered-jobs';
import { LocalModelClientError } from '../../lib/server/local-openai-client';
import type { LocalSemanticMatchResult } from '../../lib/server/local-openai-semantic-client';
import {
  runSemanticAnalysis,
  SemanticAnalysisModelNotConfiguredError,
} from '../../lib/server/semantic-analyses';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3019';
const authOrigin = process.env.TEST_AUTH_ORIGIN ?? baseUrl;
const requestOrigin = process.env.TEST_REQUEST_ORIGIN ?? baseUrl;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const suffix = randomUUID();
const livingProfileInput = {
  ...syntheticProfile,
  claims: syntheticProfile.claims.map((claim) => ({
    ...claim,
    level: 'declared' as const,
  })),
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
      salaryPeriod: 'unknown' as const,
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
      salaryPeriod: 'unknown' as const,
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
  assert.equal((await listDiscoveredJobs(owner.session)).length, 1);

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

  const applicationPath = `/api/opportunities/${connected.opportunity.opportunityId}/application`;
  await expectStatus(
    await anonymous.request(applicationPath, 'POST'),
    401,
    'anonymous opportunity promotion',
  );
  await expectStatus(
    await owner.browser.request(applicationPath, 'POST', undefined, {
      origin: 'https://attacker.example',
    }),
    403,
    'cross-origin opportunity promotion',
  );
  const bodyRejected = await owner.browser.request(applicationPath, 'POST', {});
  await expectStatus(bodyRejected, 400, 'opportunity promotion body');
  assert.equal(await bodyRejected.text(), 'Request body is not allowed.');

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
  const closedPromotion = await owner.browser.request(applicationPath, 'POST');
  await expectStatus(closedPromotion, 409, 'closed opportunity promotion');
  assert.equal(await closedPromotion.text(), 'Opportunity is closed.');

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

  await expectStatus(
    await anonymous.request(
      `/api/opportunities/${connected.opportunity.opportunityId}/match`,
      'POST',
      { searchProfileId: randomUUID() },
    ),
    401,
    'anonymous hard match',
  );
  const searchProfileInput = {
    name: 'Senior engineering search',
    discoverySources: [
      {
        company: 'Nimbus',
        url: 'https://jobs.ashbyhq.com/nimbus',
      },
    ],
    discoveryIntervalHours: 12,
    alertThreshold: 80,
    active: true,
    hardConstraints: {
      roles: ['Senior Engineer'],
      seniorities: [],
      locations: ['Paris, France'],
      remoteModes: ['remote'],
      timezones: [],
      languages: [],
      contractTypes: [],
      minimumSalary: { amount: 90_000, currency: 'EUR' },
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
  const createSearchProfile = await owner.browser.request(
    '/api/search-profiles',
    'POST',
    searchProfileInput,
  );
  await expectStatus(createSearchProfile, 201, 'search profile create');
  const searchProfile = (await createSearchProfile.json()) as {
    searchProfileId: string;
    discoveryIntervalHours: number;
    alertThreshold: number | null;
    revision: number;
  };
  assert.equal(searchProfile.alertThreshold, 80);
  assert.equal(searchProfile.discoveryIntervalHours, 12);
  const matchPath = `/api/opportunities/${connected.opportunity.opportunityId}/match`;
  await expectStatus(
    await owner.browser.request(
      matchPath,
      'POST',
      { searchProfileId: searchProfile.searchProfileId },
      { origin: 'https://attacker.example' },
    ),
    403,
    'cross-origin hard match',
  );
  const concurrentMatches = await Promise.all(
    Array.from({ length: 6 }, () =>
      owner.browser.request(matchPath, 'POST', {
        searchProfileId: searchProfile.searchProfileId,
      }),
    ),
  );
  for (const [index, response] of concurrentMatches.entries())
    await expectStatus(response, 200, `concurrent hard match ${index}`);
  const persistedMatches = (await Promise.all(
    concurrentMatches.map((response) => response.json()),
  )) as Array<{
    matchId: string;
    jobRevision: number;
    searchProfileRevision: number;
    livingProfile: null | { profileId: string; revision: number };
    evaluation: {
      decision: string;
      blockedCriteria: string[];
      criteria: Array<{ criterion: string; state: string; blocks: boolean }>;
    };
  }>;
  assert.equal(new Set(persistedMatches.map((match) => match.matchId)).size, 1);
  assert.equal(persistedMatches[0].evaluation.decision, 'ineligible');
  assert.deepEqual(persistedMatches[0].evaluation.blockedCriteria, [
    'remoteMode',
  ]);
  assert.equal(
    persistedMatches[0].evaluation.criteria.find(
      (criterion) => criterion.criterion === 'salary',
    )?.state,
    'unknown',
  );
  assert.equal(persistedMatches[0].livingProfile, null);
  const promotedResponses = await Promise.all(
    Array.from({ length: 6 }, () =>
      owner.browser.request(applicationPath, 'POST'),
    ),
  );
  if (promotedResponses.some(({ status }) => ![200, 201].includes(status)))
    assert.fail(
      `concurrent opportunity promotion failed: ${await Promise.all(
        promotedResponses.map(async (response) => ({
          status: response.status,
          body: await response.text(),
        })),
      ).then(JSON.stringify)}`,
    );
  assert.deepEqual(
    promotedResponses.map(({ status }) => status).sort(),
    [200, 200, 200, 200, 200, 201],
  );
  const promotedApplications = (await Promise.all(
    promotedResponses.map((response) => response.json()),
  )) as Array<{
    applicationId: string;
    discoveredJobId: string;
    company: string;
    role: string;
    description: string;
    url: string;
    accent: string;
    stage: string;
    revision: number;
  }>;
  assert.equal(
    new Set(promotedApplications.map(({ applicationId }) => applicationId))
      .size,
    1,
  );
  assert.deepEqual(
    {
      ...promotedApplications[0],
      applicationId: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    },
    {
      applicationId: undefined,
      discoveredJobId: connected.opportunity.opportunityId,
      company: 'Acme Systems',
      role: 'Senior Engineer',
      description: 'Build dependable systems.',
      url: 'https://job-boards.greenhouse.io/acme/jobs/101',
      accent: '#5847e8',
      stage: 'draft',
      revision: 1,
      createdAt: undefined,
      updatedAt: undefined,
    },
  );
  let semanticCalls = 0;
  const blockedSemantic = await runSemanticAnalysis(
    owner.session,
    connected.opportunity.opportunityId,
    searchProfile.searchProfileId,
    {
      generate: async () => {
        semanticCalls += 1;
        throw new Error('blocked semantic analysis called the model');
      },
    },
  );
  assert.equal(blockedSemantic.status, 'blocked');
  assert.equal(blockedSemantic.reason, 'hard_constraints');
  assert.equal(semanticCalls, 0);
  await expectStatus(
    await owner.browser.request(matchPath),
    400,
    'hard match GET requires an explicit search profile',
  );
  const readMatch = await owner.browser.request(
    `${matchPath}?searchProfileId=${searchProfile.searchProfileId}`,
  );
  await expectStatus(readMatch, 200, 'hard match read');
  assert.equal(
    ((await readMatch.json()) as { matchId: string }).matchId,
    persistedMatches[0].matchId,
  );
  const createLivingProfile = await owner.browser.request(
    '/api/profile',
    'PUT',
    { profile: livingProfileInput, expectedRevision: 0 },
  );
  await expectStatus(createLivingProfile, 200, 'living profile create');
  const livingProfile = (await createLivingProfile.json()) as {
    revision: number;
  };
  assert.equal(livingProfile.revision, 1);
  const matchWithLivingProfile = await owner.browser.request(
    matchPath,
    'POST',
    { searchProfileId: searchProfile.searchProfileId },
  );
  await expectStatus(
    matchWithLivingProfile,
    200,
    'hard match with living profile provenance',
  );
  const withLiving =
    (await matchWithLivingProfile.json()) as (typeof persistedMatches)[number];
  assert.notEqual(withLiving.matchId, persistedMatches[0].matchId);
  assert.equal(withLiving.livingProfile?.revision, 1);
  const updateSearchProfile = await owner.browser.request(
    `/api/search-profiles/${searchProfile.searchProfileId}`,
    'PATCH',
    {
      ...searchProfileInput,
      alertThreshold: 70,
      hardConstraints: {
        ...searchProfileInput.hardConstraints,
        remoteModes: ['hybrid'],
      },
      expectedRevision: 1,
    },
  );
  await expectStatus(updateSearchProfile, 200, 'search profile update');
  assert.equal(
    ((await updateSearchProfile.json()) as { alertThreshold: number | null })
      .alertThreshold,
    70,
  );
  const revisedMatch = await owner.browser.request(matchPath, 'POST', {
    searchProfileId: searchProfile.searchProfileId,
  });
  await expectStatus(revisedMatch, 200, 'revised hard match');
  const revised =
    (await revisedMatch.json()) as (typeof persistedMatches)[number];
  assert.notEqual(revised.matchId, persistedMatches[0].matchId);
  assert.equal(revised.searchProfileRevision, 2);
  assert.equal(revised.evaluation.decision, 'priority');

  const semanticPath = `/api/opportunities/${connected.opportunity.opportunityId}/semantic-analysis?searchProfileId=${searchProfile.searchProfileId}`;
  await expectStatus(
    await anonymous.request(semanticPath, 'POST'),
    401,
    'anonymous semantic analysis',
  );
  await expectStatus(
    await owner.browser.request(semanticPath, 'POST', undefined, {
      origin: 'https://attacker.example',
    }),
    403,
    'cross-origin semantic analysis',
  );
  await assert.rejects(
    runSemanticAnalysis(
      owner.session,
      connected.opportunity.opportunityId,
      searchProfile.searchProfileId,
    ),
    SemanticAnalysisModelNotConfiguredError,
  );
  const unavailable = await owner.browser.request(semanticPath, 'POST');
  await expectStatus(unavailable, 503, 'unconfigured local semantic model');
  assert.equal(
    await unavailable.text(),
    'Local semantic model is not configured.',
  );
  let unavailableCalls = 0;
  await assert.rejects(
    runSemanticAnalysis(
      owner.session,
      connected.opportunity.opportunityId,
      searchProfile.searchProfileId,
      {
        generate: async () => {
          unavailableCalls += 1;
          throw new LocalModelClientError('PROVIDER_UNAVAILABLE');
        },
      },
    ),
    (error: unknown) =>
      error instanceof LocalModelClientError &&
      error.code === 'PROVIDER_UNAVAILABLE',
  );
  assert.equal(unavailableCalls, 1);

  const semanticClient = {
    async generate(
      input: SemanticAnalysisInput,
    ): Promise<LocalSemanticMatchResult> {
      semanticCalls += 1;
      await delay(25);
      return {
        output: buildSemanticAnalysis(input, {
          skills: [
            {
              statement: 'La preuve produit soutient ce besoin.',
              factor: 'strong',
              jobExcerpt: input.job.description,
              profileReferences: [
                {
                  claimId: input.profile.claims[0].claimId,
                  evidenceIds: [input.profile.claims[0].evidence[0].evidenceId],
                },
              ],
            },
          ],
          responsibilities: [],
          transfers: [],
          gaps: [],
          unknowns: [],
          risks: [],
        }),
        usage: {
          inputTokens: 12,
          outputTokens: 4,
          costMicros: 0,
          latencyMs: 7,
          reservedTokens: 200,
          reservedCostMicros: 0,
        },
        provider: 'openai-compatible-local',
        model: 'integration-semantic-model',
        providerRequestId: 'semantic-integration-request',
      };
    },
  };
  const analyses = await Promise.all(
    Array.from({ length: 4 }, () =>
      runSemanticAnalysis(
        owner.session,
        connected.opportunity.opportunityId,
        searchProfile.searchProfileId,
        semanticClient,
      ),
    ),
  );
  assert.equal(semanticCalls, 1);
  assert.equal(
    new Set(
      analyses.map((result) =>
        result.status === 'completed' ? result.analysis.analysisId : '',
      ),
    ).size,
    1,
  );
  const semantic = analyses[0];
  assert.equal(semantic.status, 'completed');
  if (semantic.status !== 'completed') throw new Error('analysis blocked');
  assert.equal(semantic.analysis.jobMatchId, revised.matchId);
  assert.equal(semantic.analysis.jobRevision, revised.jobRevision);
  assert.equal(
    semantic.analysis.searchProfileRevision,
    revised.searchProfileRevision,
  );
  assert.equal(
    semantic.analysis.livingProfile.revision,
    revised.livingProfile?.revision,
  );
  assert.equal(semantic.analysis.artifact.jobRevision, revised.jobRevision);
  assert.equal(semantic.analysis.usage.costBudgetMicros, 0);
  assert.equal(semantic.analysis.usage.costMicros, 0);
  assert.equal(semantic.analysis.proofIndex.length, 1);
  assert.equal(
    semantic.analysis.proofIndex[0].statement,
    'Reduced a fictional deployment workflow from 40 to 12 minutes.',
  );
  assert.equal(
    semantic.analysis.proofIndex[0].evidence[0].label,
    'Synthetic release record',
  );
  assert.equal(
    semantic.analysis.proofIndex[0].evidence[0].sourceTitle,
    'Synthetic launch postmortem',
  );
  assert.equal(
    JSON.stringify(semantic.analysis.proofIndex).includes('restricted'),
    false,
  );
  assert.equal(
    semantic.analysis.usage.providerRequestId,
    'semantic-integration-request',
  );
  await expectStatus(
    await owner.browser.request(semanticPath),
    403,
    'semantic analysis GET requires same origin',
  );
  const readSemantic = await owner.browser.request(
    semanticPath,
    'GET',
    undefined,
    { origin: requestOrigin },
  );
  await expectStatus(readSemantic, 200, 'semantic analysis read');
  assert.equal(
    ((await readSemantic.json()) as { analysis: { analysisId: string } })
      .analysis.analysisId,
    semantic.analysis.analysisId,
  );
  const reobservedInput = greenhouseObservation('open', 'c'.repeat(64));
  reobservedInput.provenance.fetchedAt = '2026-09-04T12:00:00.000Z';
  const reobserved = await storeDiscoveredJob(owner.session, reobservedInput);
  assert.equal(reobserved.opportunity.revision, revised.jobRevision);
  const replayedSemantic = await runSemanticAnalysis(
    owner.session,
    connected.opportunity.opportunityId,
    searchProfile.searchProfileId,
    semanticClient,
  );
  assert.equal(replayedSemantic.status, 'completed');
  if (replayedSemantic.status !== 'completed')
    throw new Error('replay blocked');
  assert.equal(
    replayedSemantic.analysis.analysisId,
    semantic.analysis.analysisId,
  );
  assert.equal(semanticCalls, 1);

  const semanticPool = new Pool({ connectionString: databaseUrl });
  try {
    const persisted = await semanticPool.query<{
      count: string;
      job_match_id: string;
      job_revision: string;
      search_profile_revision: string;
      living_profile_revision: string;
      provider: string;
      model: string;
      provider_request_id: string;
      cost_budget_micros: string;
      cost_micros: string;
    }>(
      `select count(*) over () count, job_match_id, job_revision,
        search_profile_revision, living_profile_revision, provider, model,
        provider_request_id, cost_budget_micros, cost_micros
       from app.semantic_analyses where tenant_id = $1`,
      [owner.session.tenantId],
    );
    assert.deepEqual(persisted.rows, [
      {
        count: '1',
        job_match_id: revised.matchId,
        job_revision: String(revised.jobRevision),
        search_profile_revision: String(revised.searchProfileRevision),
        living_profile_revision: String(revised.livingProfile?.revision),
        provider: 'openai-compatible-local',
        model: 'integration-semantic-model',
        provider_request_id: 'semantic-integration-request',
        cost_budget_micros: '0',
        cost_micros: '0',
      },
    ]);
    await assert.rejects(
      semanticPool.query(
        `update app.semantic_analyses set model = 'mutated' where id = $1`,
        [semantic.analysis.analysisId],
      ),
      /semantic_analyses rows are immutable/,
    );
  } finally {
    await semanticPool.end();
  }

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
  await expectStatus(
    await other.browser.request(matchPath, 'POST', {
      searchProfileId: searchProfile.searchProfileId,
    }),
    404,
    'cross-tenant hard match',
  );
  await expectStatus(
    await other.browser.request(semanticPath, 'GET', undefined, {
      origin: requestOrigin,
    }),
    404,
    'cross-tenant semantic analysis',
  );
  await expectStatus(
    await other.browser.request(applicationPath, 'POST'),
    404,
    'cross-tenant opportunity promotion',
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const counts = await pool.query<{
      jobs: string;
      sources: string;
      matches: string;
      applications: string;
      promotion_audits: string;
    }>(
      `select
        (select count(*) from app.discovered_jobs where tenant_id = $1) jobs,
        (select count(*) from app.job_source_records where tenant_id = $1) sources,
        (select count(*) from app.job_matches where tenant_id = $1) matches,
        (select count(*) from app.applications where tenant_id = $1) applications,
        (select count(*) from app.audit_events where tenant_id = $1
          and event_type = 'opportunity_promoted') promotion_audits`,
      [owner.session.tenantId],
    );
    assert.deepEqual(counts.rows[0], {
      jobs: '4',
      sources: '5',
      matches: '3',
      applications: '1',
      promotion_audits: '1',
    });
  } finally {
    await pool.end();
  }

  await expectStatus(
    await owner.browser.request(
      `/api/applications/${promotedApplications[0].applicationId}`,
      'DELETE',
      { expectedRevision: 1 },
    ),
    204,
    'delete promoted application',
  );
  const rePromotionResponse = await owner.browser.request(
    applicationPath,
    'POST',
  );
  await expectStatus(
    rePromotionResponse,
    201,
    'promote after application deletion',
  );
  const rePromoted = (await rePromotionResponse.json()) as {
    applicationId: string;
    discoveredJobId: string;
  };
  assert.notEqual(
    rePromoted.applicationId,
    promotedApplications[0].applicationId,
  );
  assert.equal(rePromoted.discoveredJobId, connected.opportunity.opportunityId);

  const deletionPool = new Pool({ connectionString: databaseUrl });
  try {
    await deletionPool.query('delete from app.discovered_jobs where id = $1', [
      connected.opportunity.opportunityId,
    ]);
  } finally {
    await deletionPool.end();
  }
  const preservedResponse = await owner.browser.request(
    `/api/applications/${rePromoted.applicationId}`,
  );
  await expectStatus(
    preservedResponse,
    200,
    'application after source opportunity deletion',
  );
  const preserved = (await preservedResponse.json()) as {
    discoveredJobId?: string;
    revision: number;
  };
  assert.equal(preserved.discoveredJobId, undefined);
  assert.equal(preserved.revision, 2);
}

main().then(
  () => console.log('opportunities integration ok'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
