import { expect, test, type Page } from '@playwright/test';
import { syntheticProfile } from '../../lib/fixture';

const applicationId = '988c0a00-0000-4000-8000-000000000008';
const application = {
  applicationId,
  discoveredJobId: '988c0a00-0000-4000-8000-000000000009',
  company: 'Signal Forge',
  role: 'Staff Platform Engineer',
  description: 'Own the deployment platform and its production reliability.',
  url: 'https://jobs.example.test/staff-platform',
  accent: '#5847e8',
  stage: 'draft',
  companySources: [
    { url: 'https://jobs.example.test/staff-platform', origin: 'api' },
  ],
  revision: 2,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T13:30:00.000Z',
};

async function mockApplication(page: Page, run?: unknown) {
  await page.route(`**/api/applications/${applicationId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(application),
    }),
  );
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ profile: syntheticProfile, revision: 3 }),
    }),
  );
  await page.route(`**/api/applications/${applicationId}/run`, (route) =>
    route.fulfill(
      run
        ? { contentType: 'application/json', body: JSON.stringify(run) }
        : { status: 204 },
    ),
  );
}

function savedRun() {
  return {
    runId: '988c0a00-0000-4000-8000-000000000010',
    status: 'running',
    stage: 'research',
    revision: 0,
    usedTokens: 0,
    usedCostMicros: 0,
    profile: syntheticProfile,
    steps: [
      { stage: 'company-researcher', status: 'completed', attempt: 1 },
      { stage: 'evidence-archivist', status: 'pending', attempt: 1 },
    ],
    reviews: [],
    reviewDecisions: [],
    publicationEligible: false,
    events: [
      {
        actor: 'company-researcher',
        type: 'research_completed',
        summary: 'Company signals were extracted from the approved sources.',
        costMicros: 0,
      },
    ],
  } as const;
}

function researchRun() {
  return {
    ...savedRun(),
    status: 'paused',
    stage: 'evidence_archive',
    research: {
      artifactId: '988c0a00-0000-4000-8000-000000000011',
      artifactHash: 'a'.repeat(64),
      company: application.company,
      role: application.role,
      source: {
        kind: 'job-posting',
        url: application.url,
        trust: 'untrusted-data',
      },
      signals: [
        {
          signalId: 'signal-1',
          statement: 'Own platform reliability end to end.',
          excerpt:
            'Own the deployment platform and its production reliability.',
          category: 'responsibility',
          priority: 'high',
        },
        {
          signalId: 'signal-2',
          statement: 'Keep the operating model lightweight.',
          excerpt: 'Systems that remain operable by a small team.',
          category: 'culture',
          priority: 'medium',
        },
      ],
    },
  } as const;
}

test('renders the persisted application instead of the Nimbus fixture', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockApplication(page);
  await page.goto(`/applications/${applicationId}`);

  await expect(
    page.getByRole('heading', { name: 'Staff Platform Engineer' }),
  ).toBeVisible();
  await expect(page.getByText('Signal Forge').first()).toBeVisible();
  await expect(page.getByText('Revision')).toBeVisible();
  await expect(page.getByText('Nimbus Robotics')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start agent workflow' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Staff Platform Engineer' }),
  ).toBeVisible();
});

test('starts and restores the persisted workflow for this application', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const run = savedRun();
  let created = false;
  let requestBody: unknown;
  await mockApplication(page);
  await page.route('**/api/runs', async (route) => {
    created = true;
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify(run),
    });
  });

  await page.goto(`/applications/${applicationId}`);
  await page.getByRole('button', { name: 'Start agent workflow' }).click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Company research', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Evidence matching', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Company signals were extracted from the approved sources.'),
  ).toBeVisible();
  expect(created).toBe(true);
  expect(requestBody).toEqual({
    applicationId,
    applicationRevision: 2,
    profileRevision: 3,
  });

  await page.unroute(`**/api/applications/${applicationId}/run`);
  await page.route(`**/api/applications/${applicationId}/run`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(run),
    }),
  );
  await page.reload();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start agent workflow' }),
  ).toHaveCount(0);
});

test('refreshes an active workflow until its persisted status changes', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const running = savedRun();
  const completed = {
    ...running,
    status: 'completed',
    stage: 'completed',
    steps: running.steps.map((step) => ({ ...step, status: 'completed' })),
  } as const;
  let reads = 0;
  await mockApplication(page, running);
  await page.unroute(`**/api/applications/${applicationId}/run`);
  await page.route(`**/api/applications/${applicationId}/run`, (route) => {
    reads += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(reads === 1 ? running : completed),
    });
  });

  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  expect(reads).toBeGreaterThanOrEqual(2);
});

test('requires a human selection before evidence matching continues', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const paused = researchRun();
  let request: { body: unknown; key?: string } | undefined;
  await mockApplication(page, paused);
  await page.route(
    `**/api/runs/${paused.runId}/evidence-selection`,
    async (route) => {
      request = {
        body: route.request().postDataJSON(),
        key: route.request().headers()['idempotency-key'],
      };
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          ...paused,
          status: 'running',
          steps: [
            ...paused.steps,
            { stage: 'evidence-archivist', status: 'pending', attempt: 1 },
          ],
        }),
      });
    },
  );

  await page.goto(`/applications/${applicationId}`);
  await expect(
    page.getByRole('heading', {
      name: 'Which signals should shape this application?',
    }),
  ).toBeVisible();
  const signals = page.getByRole('checkbox');
  await expect(signals).toHaveCount(2);
  await expect(signals.nth(0)).toBeChecked();
  await expect(signals.nth(1)).toBeChecked();
  await signals.nth(1).uncheck();
  await page.getByRole('button', { name: 'Confirm 1 signal' }).click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  expect(request?.body).toEqual({
    researchArtifactId: paused.research.artifactId,
    selectedSignalIds: ['signal-1'],
  });
  expect(request?.key).toMatch(/^[0-9a-f-]{36}$/);
});

test('keeps the persisted dossier readable on mobile', async ({ page }) => {
  await mockApplication(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/applications/${applicationId}`);

  await expect(
    page.getByRole('heading', { name: 'Staff Platform Engineer' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
