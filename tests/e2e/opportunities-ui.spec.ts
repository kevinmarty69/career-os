import { expect, test, type Page } from '@playwright/test';

const now = '2026-09-04T12:00:00.000Z';

test('imports a sourced opportunity, keeps it after reload and separates applications', async ({
  page,
}) => {
  const opportunities: unknown[] = [];
  const importedUrls: string[] = [];
  await mockWorkspace(page, opportunities, importedUrls);

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
  const start = page.getByRole('button', { name: 'Démarrer la candidature' });
  await expect(start).toBeDisabled();
  await expect(page.getByText('Disponible prochainement')).toBeVisible();
  await page.getByText('Provenance · 1 source').click();
  await expect(page.getByText('jobs.example.test').first()).toBeVisible();
  expect(importedUrls).toEqual(['https://jobs.example.test/product-engineer']);

  await page.reload();
  await expect(page.getByText('Product Engineer')).toBeVisible();
  await expect(page.getByText('Existing Application Inc')).toBeVisible();
});

test('keeps the real opportunity workspace inside a mobile viewport', async ({
  page,
}) => {
  const opportunities = [opportunity()];
  await mockWorkspace(page, opportunities, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/applications');
  await expect(page.getByText('Product Engineer')).toBeVisible();
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

async function mockWorkspace(
  page: Page,
  opportunities: unknown[],
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
  return {
    opportunityId: 'b22c0a00-0000-4000-8000-000000000002',
    company: 'Example Labs',
    role: 'Product Engineer',
    description: 'Build reliable products.',
    sourceUrl,
    revision: 1,
    sources: [
      {
        sourceRecordId: 'c33c0a00-0000-4000-8000-000000000003',
        requestedUrl: sourceUrl,
        finalUrl: sourceUrl,
        fetchedAt: now,
        contentType: 'text/html',
        bytes: 2048,
        sha256: 'a'.repeat(64),
        trust: 'untrusted-data',
      },
    ],
    firstSeenAt: now,
    lastSeenAt: now,
  };
}
