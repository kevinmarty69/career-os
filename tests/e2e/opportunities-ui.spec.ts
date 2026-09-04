import { expect, test, type Page } from '@playwright/test';

const now = '2026-09-04T12:00:00.000Z';

test('imports a sourced opportunity, keeps it after reload and separates applications', async ({
  page,
}) => {
  const opportunities: unknown[] = [];
  const decisions: OpportunityDecisionMock[] = [];
  const importedUrls: string[] = [];
  await mockWorkspace(page, opportunities, decisions, importedUrls);

  await page.goto('/applications');
  await expect(
    page.getByRole('heading', { name: 'Opportunités découvertes' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Aucune opportunité enregistrée' }),
  ).toBeVisible();
  await expect(page.getByText('Existing Application Inc')).toBeVisible();

  await page.getByRole('button', { name: 'Coller une offre' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Coller une offre' });
  await dialog
    .getByLabel('URL de l’annonce')
    .fill('https://jobs.example.test/product-engineer');
  await dialog.getByRole('button', { name: 'Importer l’offre' }).click();

  await expect(page.getByText('Product Engineer')).toBeVisible();
  await expect(page.getByText('Example Labs')).toBeVisible();
  await expect(page.getByText('Paris, France')).toBeVisible();
  await expect(page.getByText('Hybride')).toBeVisible();
  await expect(page.getByText('Temps plein')).toBeVisible();
  await expect(
    page.getByText(/80[\s\u202f]000.*100[\s\u202f]000/),
  ).toBeVisible();
  await expect(page.getByText('Greenhouse').first()).toBeVisible();
  await expect(page.getByText('Republiée', { exact: true })).toBeVisible();
  const start = page.getByRole('button', { name: 'Démarrer la candidature' });
  await expect(start).toBeEnabled();
  await page.getByText('Provenance et historique · 4 observations').click();
  await expect(page.getByText('jobs.example.test').first()).toBeVisible();
  await expect(page.getByText('Contenu de l’offre modifié')).toBeVisible();
  await expect(page.getByText('Offre signalée comme fermée')).toBeVisible();
  await expect(page.getByText('Offre republiée')).toBeVisible();
  expect(importedUrls).toEqual(['https://jobs.example.test/product-engineer']);

  const opportunityCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Product Engineer' }),
  });
  await opportunityCard.getByRole('button', { name: 'Ignorer' }).click();
  await opportunityCard
    .getByLabel('Qualification corrigée')
    .selectOption('exploratory');
  await opportunityCard.getByLabel('Raison').selectOption('location');
  await opportunityCard
    .getByLabel('Profil de recherche')
    .selectOption(searchProfile.searchProfileId);
  await opportunityCard
    .getByLabel(/Note facultative/)
    .fill('Outside the current commute boundary.');
  await opportunityCard
    .getByRole('button', { name: 'Enregistrer la décision' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Product Engineer' }),
  ).toHaveCount(0);
  await expect(page.getByText('Opportunités traitées')).toBeVisible();
  await expect(page.getByText('Ignorée', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Ignorée', { exact: true })).toBeVisible();
  await expect(page.getByText('Existing Application Inc')).toBeVisible();

  const processed = page
    .locator('article')
    .filter({ hasText: 'Product Engineer' });
  await processed.getByRole('button', { name: 'Corriger' }).click();
  await processed.getByLabel('État').selectOption('saved');
  await processed.getByLabel('Qualification corrigée').selectOption('priority');
  await processed.getByLabel('Raison').selectOption('strong_fit');
  await processed
    .getByRole('button', { name: 'Enregistrer la décision' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Product Engineer' }),
  ).toBeVisible();

  const restored = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Product Engineer' }),
  });
  await restored.getByRole('button', { name: 'Archiver' }).click();
  await restored.getByLabel('Raison').selectOption('career_direction');
  await restored
    .getByRole('button', { name: 'Enregistrer la décision' })
    .click();
  await expect(page.getByText('Archivée', { exact: true })).toBeVisible();
});

test('keeps the real opportunity workspace inside a mobile viewport', async ({
  page,
}) => {
  const opportunities = [unknownOpportunity()];
  await mockWorkspace(page, opportunities, [], []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/applications');
  await expect(page.getByText('Product Engineer')).toBeVisible();
  await expect(page.getByText('À vérifier').first()).toBeVisible();
  await page.getByRole('button', { name: 'Coller une offre' }).first().click();
  await expect(
    page.getByRole('dialog', { name: 'Coller une offre' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('defaults to English and keeps decision controls translated', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await mockWorkspace(page, [opportunity()], [], []);
  await page.goto('/applications');
  await expect(
    page.getByRole('heading', { name: 'Discovered opportunities' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ignore' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start application' }),
  ).toBeVisible();
});

test('promotes an opportunity explicitly and opens the idempotent application', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await mockWorkspace(page, [opportunity()], [], []);
  const applicationId = '988c0a00-0000-4000-8000-000000000008';
  const requests: Array<{ method: string; body: string | null }> = [];
  let attempt = 0;
  let releasePromotion!: () => void;
  const promotionPending = new Promise<void>((resolve) => {
    releasePromotion = resolve;
  });
  await page.route('**/api/opportunities/*/application', async (route) => {
    requests.push({
      method: route.request().method(),
      body: route.request().postData(),
    });
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({ status: 409, body: 'Opportunity is closed.' });
      return;
    }
    await promotionPending;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        applicationId,
        discoveredJobId: opportunity().opportunityId,
        company: 'Example Labs',
        role: 'Product Engineer',
        description: 'Build reliable products.',
        url: 'https://jobs.example.test/product-engineer',
        accent: '#5647e0',
        stage: 'draft',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }),
    });
  });

  await page.goto('/applications');
  await page.getByRole('button', { name: 'Start application' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'An application cannot be started for this opportunity.',
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Start application' }).click();
  await expect(
    page.getByRole('button', { name: 'Starting application…' }),
  ).toBeDisabled();
  releasePromotion();

  await expect(page).toHaveURL(`/applications/${applicationId}`);
  expect(requests).toEqual([
    { method: 'POST', body: null },
    { method: 'POST', body: null },
  ]);
});

test('runs semantic analysis only on request, retries the local model and reads the saved result', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  const semantic: SemanticMock = {
    postCalls: 0,
    postResponses: [
      { status: 503, body: 'Local semantic model is not configured.' },
      { status: 200, body: completedSemanticAnalysis() },
    ],
  };
  await mockWorkspace(page, [opportunity()], [], [], semantic);
  await page.goto('/applications');

  await page.getByRole('button', { name: 'Analyze fit' }).click();
  await page
    .getByLabel('Search profile')
    .selectOption(searchProfile.searchProfileId);
  expect(semantic.postCalls).toBe(0);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await expect(page.getByText('Local model unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();

  await expect(page.getByText('Interesting', { exact: true })).toBeVisible();
  await expect(page.getByText('53/100')).toBeVisible();
  await expect(page.getByText('80% · 4/5')).toBeVisible();
  await expect(page.getByText('High', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Production agent systems', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Transfers', { exact: true })).toBeVisible();
  await expect(page.getByText('Real gaps', { exact: true })).toBeVisible();
  await expect(page.getByText('Unknowns', { exact: true })).toBeVisible();
  await expect(page.getByText('Risks', { exact: true })).toBeVisible();
  await page.getByText('Evidence references · 1').first().click();
  await expect(
    page.getByText('Built production agent systems.').first(),
  ).toBeVisible();
  await expect(
    page
      .getByText('MCP production telemetry · Career evidence dossier')
      .first(),
  ).toBeVisible();
  expect(semantic.postCalls).toBe(2);

  await page.reload();
  await page.getByRole('button', { name: 'Analyze fit' }).click();
  await page
    .getByLabel('Search profile')
    .selectOption(searchProfile.searchProfileId);
  await page.getByRole('button', { name: 'View latest analysis' }).click();
  await expect(page.getByText('53/100')).toBeVisible();
  expect(semantic.postCalls).toBe(2);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('shows blocked hard constraints without presenting a model result', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  const semantic: SemanticMock = {
    postCalls: 0,
    postResponses: [{ status: 200, body: blockedSemanticAnalysis() }],
  };
  await mockWorkspace(page, [opportunity()], [], [], semantic);
  await page.goto('/applications');
  await page.getByRole('button', { name: 'Analyze fit' }).click();
  await page
    .getByLabel('Search profile')
    .selectOption(searchProfile.searchProfileId);
  expect(semantic.postCalls).toBe(0);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await expect(
    page.getByText('Analysis stopped before the model'),
  ).toBeVisible();
  await expect(page.getByText('No model was called.')).toBeVisible();
  const panel = page.getByRole('region', { name: 'Semantic job analysis' });
  await expect(
    panel.locator('strong').filter({ hasText: 'Work mode' }),
  ).toBeVisible();
  await expect(panel.getByText('Remote', { exact: true })).toBeVisible();
  await expect(panel.getByText('Hybrid', { exact: true })).toBeVisible();
  expect(semantic.postCalls).toBe(1);
});

type OpportunityDecisionMock = {
  decisionId: string;
  opportunityId: string;
  searchProfileId: string | null;
  disposition: 'saved' | 'ignored' | 'archived';
  qualification: 'priority' | 'interesting' | 'exploratory' | 'ignore';
  reason:
    | 'strong_fit'
    | 'career_direction'
    | 'hard_constraint'
    | 'weak_evidence'
    | 'compensation'
    | 'location'
    | 'company'
    | 'duplicate'
    | 'closed'
    | 'other';
  note: string | null;
  revision: number;
  actor: 'human';
  actorId: string;
  createdAt: string;
  updatedAt: string;
  history: unknown[];
};

type SemanticMock = {
  postCalls: number;
  postResponses: Array<{ status: number; body: unknown }>;
  saved?: unknown;
};

const searchProfile = {
  searchProfileId: 'e55c0a00-0000-4000-8000-000000000005',
  name: 'Product engineering',
  hardConstraints: {
    roles: [],
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
  active: true,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

async function mockWorkspace(
  page: Page,
  opportunities: unknown[],
  decisions: OpportunityDecisionMock[],
  importedUrls: string[],
  semantic?: SemanticMock,
) {
  await page.route('**/api/opportunities/import-url', async (route) => {
    const body = route.request().postDataJSON() as { url: string };
    importedUrls.push(body.url);
    const imported = opportunity(body.url);
    opportunities.unshift(imported);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ created: true, opportunity: imported }),
    });
  });
  await page.route('**/api/opportunities', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ opportunities }),
    });
  });
  await page.route('**/api/opportunities/decisions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ decisions, feedback: [] }),
    });
  });
  await page.route('**/api/opportunities/*/decision', async (route) => {
    const opportunityId = route.request().url().split('/').at(-2)!;
    const input = route.request().postDataJSON() as {
      searchProfileId: string | null;
      disposition: OpportunityDecisionMock['disposition'];
      qualification: OpportunityDecisionMock['qualification'];
      reason: OpportunityDecisionMock['reason'];
      note: string | null;
      expectedRevision: number;
    };
    const index = decisions.findIndex(
      (decision) => decision.opportunityId === opportunityId,
    );
    const current = decisions[index];
    if ((current?.revision ?? 0) !== input.expectedRevision) {
      await route.fulfill({ status: 409, body: 'Conflict' });
      return;
    }
    const revision = (current?.revision ?? 0) + 1;
    const saved: OpportunityDecisionMock = {
      decisionId: current?.decisionId ?? 'f66c0a00-0000-4000-8000-000000000006',
      opportunityId,
      searchProfileId: input.searchProfileId,
      disposition: input.disposition,
      qualification: input.qualification,
      reason: input.reason,
      note: input.note,
      revision,
      actor: 'human',
      actorId: 'a77c0a00-0000-4000-8000-000000000007',
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      history: [
        {
          eventId: crypto.randomUUID(),
          searchProfileId: input.searchProfileId,
          disposition: input.disposition,
          qualification: input.qualification,
          reason: input.reason,
          note: input.note,
          revision,
          actor: 'human',
          actorId: 'a77c0a00-0000-4000-8000-000000000007',
          createdAt: now,
        },
        ...(current?.history ?? []),
      ],
    };
    if (index === -1) decisions.unshift(saved);
    else decisions[index] = saved;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ decision: saved }),
    });
  });
  await page.route('**/api/search-profiles', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ searchProfiles: [searchProfile] }),
    });
  });
  await page.route(
    '**/api/opportunities/*/semantic-analysis?*',
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill(
          semantic?.saved
            ? {
                contentType: 'application/json',
                body: JSON.stringify(semantic.saved),
              }
            : { status: 404, body: 'Not found' },
        );
        return;
      }
      if (!semantic) {
        await route.fulfill({
          status: 500,
          body: 'Unexpected semantic request',
        });
        return;
      }
      semantic.postCalls += 1;
      const response = semantic.postResponses.shift() ?? {
        status: 500,
        body: 'No mocked semantic response',
      };
      if (response.status === 200) semantic.saved = response.body;
      await route.fulfill({
        status: response.status,
        ...(typeof response.body === 'string'
          ? { body: response.body }
          : {
              contentType: 'application/json',
              body: JSON.stringify(response.body),
            }),
      });
    },
  );
  await page.route('**/api/applications', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        applications: [
          {
            applicationId: 'a11c0a00-0000-4000-8000-000000000001',
            company: 'Existing Application Inc',
            role: 'Staff Engineer',
            description: 'A persisted application.',
            accent: '#5647e0',
            stage: 'draft',
            revision: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    });
  });
}

function completedSemanticAnalysis() {
  const proofReference = {
    claimId: 'claim-agent-systems',
    evidenceIds: ['evidence-mcp-telemetry'],
  };
  const factor = (
    statement: string,
    kind: 'strong' | 'partial' | 'gap' | 'unknown',
    references = kind === 'strong' || kind === 'partial'
      ? [proofReference]
      : [],
  ) => ({
    statement,
    factor: kind,
    jobExcerpt: 'Build reliable products with agentic workflows.',
    profileReferences: references,
  });
  return {
    status: 'completed',
    analysis: {
      analysisId: '11111111-1111-4111-8111-111111111111',
      version: 1,
      jobMatchId: '22222222-2222-4222-8222-222222222222',
      opportunityId: 'b22c0a00-0000-4000-8000-000000000002',
      jobRevision: 1,
      searchProfileId: searchProfile.searchProfileId,
      searchProfileRevision: 1,
      livingProfile: {
        profileId: '33333333-3333-4333-8333-333333333333',
        revision: 4,
      },
      inputHash: 'f'.repeat(64),
      artifact: {
        schemaVersion: 1,
        purpose: 'application',
        opportunityId: 'b22c0a00-0000-4000-8000-000000000002',
        jobRevision: 1,
        profileSnapshotId: '33333333-3333-4333-8333-333333333333',
        profileRevision: 4,
        analysis: {
          skills: [factor('Production agent systems', 'strong')],
          responsibilities: [factor('End-to-end ownership', 'partial')],
          transfers: [factor('Product judgment transfers directly', 'partial')],
          gaps: [factor('No domain-specific proof yet', 'gap')],
          unknowns: [factor('Team topology is not explicit', 'unknown')],
          risks: [factor('Domain ramp-up needs validation', 'partial')],
        },
        decomposition: {
          factors: { strong: 1, partial: 2, gap: 1, unknown: 1 },
          weights: { strong: 100, partial: 55, gap: 0, unknown: null },
          knownFactorCount: 4,
          requirementCount: 5,
          coveragePercent: 80,
          confidence: 'high',
          explanatoryRiskCount: 1,
          score: 53,
          recommendation: 'interesting',
          method: 'bounded-factor-decomposition-v1',
        },
      },
      proofIndex: [
        {
          claimId: proofReference.claimId,
          statement: 'Built production agent systems.',
          evidence: [
            {
              evidenceId: proofReference.evidenceIds[0],
              label: 'MCP production telemetry',
              sourceTitle: 'Career evidence dossier',
              sourceLocator: 'mcp-evidence.md#production-usage',
            },
          ],
        },
      ],
      usage: {
        provider: 'openai-compatible-local',
        model: 'local-semantic-model',
        providerRequestId: 'request-1',
        reservedTokens: 800,
        inputTokens: 420,
        outputTokens: 180,
        costBudgetMicros: 0,
        costMicros: 0,
        latencyMs: 740,
      },
      createdAt: now,
    },
  };
}

function blockedSemanticAnalysis() {
  const criteria = [
    'availability',
    'role',
    'seniority',
    'location',
    'remoteMode',
    'timezone',
    'language',
    'contractType',
    'salary',
    'company',
    'network',
  ] as const;
  return {
    status: 'blocked',
    reason: 'hard_constraints',
    match: {
      matchId: '44444444-4444-4444-8444-444444444444',
      opportunityId: 'b22c0a00-0000-4000-8000-000000000002',
      jobRevision: 1,
      searchProfileId: searchProfile.searchProfileId,
      searchProfileRevision: 1,
      livingProfile: null,
      evaluation: {
        decision: 'ineligible',
        eligibleForPriority: false,
        criteria: criteria.map((criterion) => ({
          criterion,
          state: criterion === 'remoteMode' ? 'blocked' : 'compatible',
          blocks: criterion === 'remoteMode',
          expected: criterion === 'remoteMode' ? ['remote'] : ['compatible'],
          observed: criterion === 'remoteMode' ? 'hybrid' : 'compatible',
          explanation:
            criterion === 'remoteMode'
              ? 'Le mode de travail ne respecte pas les contraintes dures.'
              : 'Ce critère est compatible.',
          references: [
            { entity: 'discovered_job', field: criterion },
            { entity: 'search_profile', field: `hardConstraints.${criterion}` },
          ],
        })),
        blockedCriteria: ['remoteMode'],
      },
      createdAt: now,
      updatedAt: now,
    },
  };
}

function opportunity(sourceUrl = 'https://jobs.example.test/product-engineer') {
  const sourceRecordId = 'c33c0a00-0000-4000-8000-000000000003';
  const normalized = {
    location: 'Paris, France',
    remoteMode: 'hybrid',
    contractType: 'full_time',
    salaryMin: 80000,
    salaryMax: 100000,
    salaryCurrency: 'EUR',
    salaryPeriod: 'unknown',
    publishedAt: '2026-09-01T08:00:00.000Z',
    externalId: 'job-123',
    sourceKind: 'greenhouse',
    lifecycleSignal: 'open',
  };
  return {
    opportunityId: 'b22c0a00-0000-4000-8000-000000000002',
    company: 'Example Labs',
    role: 'Product Engineer',
    description: 'Build reliable products.',
    sourceUrl,
    location: normalized.location,
    remoteMode: normalized.remoteMode,
    contractType: normalized.contractType,
    salaryMin: normalized.salaryMin,
    salaryMax: normalized.salaryMax,
    salaryCurrency: normalized.salaryCurrency,
    salaryPeriod: normalized.salaryPeriod,
    publishedAt: normalized.publishedAt,
    externalId: normalized.externalId,
    sourceKind: normalized.sourceKind,
    lifecycle: 'reposted',
    fingerprint: null,
    revision: 1,
    sources: [
      {
        sourceRecordId,
        requestedUrl: sourceUrl,
        finalUrl: sourceUrl,
        fetchedUrl: sourceUrl,
        sourceKind: 'greenhouse',
        externalId: 'job-123',
        matchedBy: 'exact_source',
        fetchedAt: now,
        contentType: 'text/html',
        bytes: 2048,
        sha256: 'a'.repeat(64),
        trust: 'untrusted-data',
      },
    ],
    observations: [
      {
        observationId: 'd44c0a00-0000-4000-8000-000000000007',
        sourceRecordId,
        observedAt: '2026-09-04T12:00:00.000Z',
        sha256: 'd'.repeat(64),
        change: 'reposted',
        lifecycleSignal: 'open',
        matchedBy: 'exact_source',
        normalized,
      },
      {
        observationId: 'd44c0a00-0000-4000-8000-000000000006',
        sourceRecordId,
        observedAt: '2026-09-03T12:00:00.000Z',
        sha256: 'c'.repeat(64),
        change: 'closed',
        lifecycleSignal: 'closed',
        matchedBy: 'exact_source',
        normalized: { ...normalized, lifecycleSignal: 'closed' },
      },
      {
        observationId: 'd44c0a00-0000-4000-8000-000000000005',
        sourceRecordId,
        observedAt: '2026-09-02T12:00:00.000Z',
        sha256: 'b'.repeat(64),
        change: 'changed',
        lifecycleSignal: 'open',
        matchedBy: 'canonical_url',
        normalized,
      },
      {
        observationId: 'd44c0a00-0000-4000-8000-000000000004',
        sourceRecordId,
        observedAt: now,
        sha256: 'a'.repeat(64),
        change: 'first_seen',
        lifecycleSignal: 'open',
        matchedBy: 'new',
        normalized,
      },
    ],
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

function unknownOpportunity() {
  const base = opportunity();
  const unknown = {
    location: null,
    remoteMode: 'unknown',
    contractType: 'unknown',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: 'unknown',
    publishedAt: null,
    externalId: null,
    sourceKind: 'generic_html',
    lifecycleSignal: 'unknown',
  } as const;
  return {
    ...base,
    location: unknown.location,
    remoteMode: unknown.remoteMode,
    contractType: unknown.contractType,
    salaryMin: unknown.salaryMin,
    salaryMax: unknown.salaryMax,
    salaryCurrency: unknown.salaryCurrency,
    salaryPeriod: unknown.salaryPeriod,
    publishedAt: unknown.publishedAt,
    externalId: unknown.externalId,
    sourceKind: unknown.sourceKind,
    lifecycle: 'open',
    sources: base.sources.map((source) => ({
      ...source,
      sourceKind: 'generic_html',
      externalId: null,
    })),
    observations: [
      {
        ...base.observations.at(-1),
        normalized: unknown,
        lifecycleSignal: 'unknown',
      },
    ],
  };
}
