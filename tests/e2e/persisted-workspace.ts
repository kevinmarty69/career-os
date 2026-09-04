import type { Page } from '@playwright/test';

export const applicationId = '988c0a00-0000-4000-8000-000000000041';

export async function mockPersistedWorkspace(page: Page) {
  const now = '2026-09-04T12:00:00.000Z';
  const sourceId = '988c0a00-0000-4000-8000-000000000042';
  const sourceUrl = 'https://jobs.example.test/platform-engineer';
  const normalized = {
    location: 'Paris, France',
    remoteMode: 'hybrid',
    contractType: 'full_time',
    salaryMin: 80_000,
    salaryMax: 100_000,
    salaryCurrency: 'EUR',
    salaryPeriod: 'year',
    publishedAt: null,
    externalId: 'northstar-42',
    sourceKind: 'generic_html',
    lifecycleSignal: 'open',
  };
  await page.route(`**/api/applications/${applicationId}/run`, (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route('**/api/applications', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        applications: [
          {
            applicationId,
            company: 'Signal Forge',
            role: 'Staff Platform Engineer',
            description: 'Build a reliable platform for a small team.',
            accent: '#5847e8',
            stage: 'draft',
            revision: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    }),
  );
  await page.route('**/api/publications', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ publications: [] }),
    }),
  );
  await page.route('**/api/opportunities/decisions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ decisions: [], feedback: [] }),
    }),
  );
  await page.route('**/api/opportunities', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        opportunities: [
          {
            opportunityId: '988c0a00-0000-4000-8000-000000000043',
            company: 'Northstar Labs',
            role: 'Platform Engineer',
            description: 'Operate reliable developer infrastructure.',
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
            lifecycle: 'open',
            fingerprint: 'a'.repeat(64),
            revision: 1,
            sources: [
              {
                sourceRecordId: sourceId,
                requestedUrl: sourceUrl,
                finalUrl: sourceUrl,
                fetchedUrl: sourceUrl,
                sourceKind: 'generic_html',
                externalId: 'northstar-42',
                matchedBy: 'new',
                fetchedAt: now,
                contentType: 'text/html',
                bytes: 2_048,
                sha256: 'a'.repeat(64),
                trust: 'untrusted-data',
              },
            ],
            observations: [
              {
                observationId: '988c0a00-0000-4000-8000-000000000044',
                sourceRecordId: sourceId,
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
          },
        ],
      }),
    }),
  );
  await page.route('**/api/search-profiles', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ searchProfiles: [] }),
    }),
  );
}
