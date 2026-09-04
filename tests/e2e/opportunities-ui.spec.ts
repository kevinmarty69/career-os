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
  await expect(start).toBeDisabled();
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
