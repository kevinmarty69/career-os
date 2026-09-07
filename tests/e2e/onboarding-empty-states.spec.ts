import { expect, test, type Page } from '@playwright/test';
import { mockPersistedWorkspace } from './persisted-workspace';

async function emptyWorkspace(page: Page) {
  await mockPersistedWorkspace(page);
  const responses: Record<string, unknown> = {
    '/api/profile': { profile: null, revision: 0 },
    '/api/profile/history': [],
    '/api/applications': { applications: [] },
    '/api/publications': { publications: [], nextCursor: null },
    '/api/opportunities': { opportunities: [] },
    '/api/opportunities/decisions': { decisions: [], feedback: [] },
    '/api/search-profiles': { searchProfiles: [] },
  };
  for (const [path, json] of Object.entries(responses)) {
    await page.route(`**${path}`, (route) => route.fulfill({ json }));
  }
}

for (const locale of ['en', 'fr'] as const) {
  test(`${locale}: empty pages teach the flow without creating example data`, async ({
    page,
    context,
  }, testInfo) => {
    await context.addCookies([
      {
        name: 'career-os-locale',
        value: locale,
        domain: 'localhost',
        path: '/',
      },
    ]);
    await emptyWorkspace(page);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/api/') &&
        !['GET', 'HEAD'].includes(request.method())
      )
        writes.push(request.url());
    });
    const example =
      locale === 'fr'
        ? 'Aperçu · exemple fictif'
        : 'Preview · illustrative example';
    for (const [path, kind] of [
      ['/', 'memory'],
      ['/memory', 'memory'],
      ['/applications', 'applications'],
      ['/inbox', 'review'],
      ['/links', 'links'],
      ['/runs', 'runs'],
    ]) {
      await page.goto(path);
      const state = page.locator(`[data-onboarding="${kind}"]`);
      await expect(state).toBeVisible();
      await expect(state.locator('figcaption')).toContainText(example);
      await expect(state.locator('ol').first().locator('li')).toHaveCount(3);
      expect(
        await state
          .locator('h2 + p')
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          ),
      ).toBeGreaterThanOrEqual(14.5);
      await expect(
        page.getByText('Career memory fully sourced', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText('Mémoire entièrement sourcée', { exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (locale === 'en') {
        await page.screenshot({
          path: testInfo.outputPath(
            `${kind}-${path === '/' ? 'home' : 'page'}-en.png`,
          ),
          fullPage: true,
        });
      }
    }
    await page.goto('/');
    await page
      .locator('[data-onboarding="memory"]')
      .getByRole('link', {
        name: locale === 'fr' ? 'Importer mon CV' : 'Import my CV',
      })
      .click();
    await expect(page).toHaveURL(/\/memory\/import$/);
    await page.goto('/memory');
    await page
      .locator('[data-onboarding="memory"]')
      .getByRole('link', {
        name:
          locale === 'fr'
            ? 'Pas de CV sous la main ? Collez vos notes'
            : 'No CV handy? Paste your career notes',
      })
      .click();
    await expect(page.locator('#profile-text')).toBeVisible();
    await page.goto('/applications');
    await page
      .getByRole('button', {
        name:
          locale === 'fr' ? 'Ajouter ma première offre' : 'Add my first job',
      })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('input[type="url"]'),
    ).toBeEmpty();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test('onboarding advances after a CV and does not replace populated pages', async ({
  page,
}) => {
  await emptyWorkspace(page);
  await page.unroute('**/api/profile');
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      json: {
        revision: 1,
        profile: {
          name: 'Alex Morgan',
          headline: 'Customer support specialist',
          sources: [],
          evidence: [],
          claims: [
            {
              id: 'experience-1',
              kind: 'experience',
              statement: 'Created the team onboarding guide.',
              level: 'declared',
              evidenceIds: [],
              sensitivity: 'private',
              allowedUses: ['application'],
            },
          ],
        },
      },
    }),
  );
  await page.goto('/');
  await expect(page.locator('[data-onboarding="applications"]')).toBeVisible();
  await mockPersistedWorkspace(page);
  for (const path of ['/', '/applications', '/memory']) {
    await page.goto(path);
    if (path === '/')
      await expect(
        page.getByRole('heading', { name: 'Bonjour Alex' }),
      ).toBeVisible();
    if (path === '/applications')
      await expect(
        page.locator('#main-content').getByText('Signal Forge').first(),
      ).toBeVisible();
    if (path === '/memory')
      await expect(
        page
          .locator('#main-content')
          .getByText('Reduced build p50 from 11 to 7 minutes.'),
      ).toBeVisible();
    await expect(page.locator('[data-onboarding]')).toHaveCount(0);
  }
});

test('failed and pending requests never appear as a new workspace', async ({
  page,
}) => {
  await emptyWorkspace(page);
  for (const [path, api] of [
    ['/', '/api/applications'],
    ['/memory', '/api/profile'],
    ['/applications', '/api/opportunities'],
    ['/links', '/api/publications'],
  ]) {
    await page.route(`**${api}`, (route) =>
      route.fulfill({ status: 503, json: { error: 'unavailable' } }),
    );
    await page.goto(path);
    await expect(
      page.locator('#main-content').getByRole('alert'),
    ).toBeVisible();
    await expect(page.locator('[data-onboarding]')).toHaveCount(0);
  }
  await emptyWorkspace(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/profile', async (route) => {
    await pending;
    await route.fulfill({ json: { profile: null, revision: 0 } });
  });
  await page.goto('/memory');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.locator('[data-onboarding]')).toHaveCount(0);
  release();
  await expect(page.locator('[data-onboarding="memory"]')).toBeVisible();
  await page.route('**/api/applications', (route) =>
    route.fulfill({ json: {} }),
  );
  await page.goto('/');
  await expect(page.locator('#main-content').getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-onboarding]')).toHaveCount(0);
});
