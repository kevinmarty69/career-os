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

function evidenceRun() {
  const claimId = '988c0a00-0000-4000-8000-000000000012';
  const evidenceId = '988c0a00-0000-4000-8000-000000000013';
  const paused = researchRun();
  return {
    ...paused,
    stage: 'strategy',
    profile: {
      ...syntheticProfile,
      sources: [
        {
          id: 'source-release-record',
          kind: 'document',
          title: 'Release record',
          sensitivity: 'private',
          allowedUses: ['application'],
          trust: 'untrusted-data',
        },
      ],
      evidence: [
        {
          id: evidenceId,
          sourceId: 'source-release-record',
          label: 'Deployment reliability postmortem',
          excerpt: 'Owned the deployment platform and production reliability.',
        },
      ],
      claims: [
        {
          id: claimId,
          statement: 'Owned a production deployment platform end to end.',
          kind: 'experience',
          level: 'verified',
          evidenceIds: [evidenceId],
          sensitivity: 'private',
          allowedUses: ['application'],
        },
      ],
    },
    evidenceArchive: {
      artifactId: '988c0a00-0000-4000-8000-000000000014',
      artifactHash: 'b'.repeat(64),
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: '988c0a00-0000-4000-8000-000000000015',
      researchArtifactId: paused.research.artifactId,
      researchArtifactHash: paused.research.artifactHash,
      signals: [
        {
          signalId: 'signal-1',
          coverage: 'verified_candidate',
          matches: [
            {
              claimId,
              evidenceIds: [evidenceId],
              provenance: 'verified',
              relevanceScore: 92,
            },
          ],
        },
        { signalId: 'signal-2', coverage: 'unmatched', matches: [] },
      ],
    },
  } as const;
}

function strategyRun() {
  const paused = evidenceRun();
  const lead = paused.evidenceArchive.signals[0].matches[0];
  return {
    ...paused,
    stage: 'strategy_review',
    strategy: {
      artifactId: '988c0a00-0000-4000-8000-000000000016',
      artifactHash: 'c'.repeat(64),
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: paused.evidenceArchive.profileSnapshotId,
      researchArtifactId: paused.research.artifactId,
      researchArtifactHash: paused.research.artifactHash,
      evidenceArchiveArtifactId: paused.evidenceArchive.artifactId,
      evidenceArchiveArtifactHash: paused.evidenceArchive.artifactHash,
      copyPolicy: 'internal-editorial-direction',
      positioning: {
        message:
          'Lead with end-to-end ownership of a reliable production platform.',
        sourceSignalIds: ['signal-1'],
      },
      lead: {
        signalId: 'signal-1',
        claimId: lead.claimId,
        evidenceIds: lead.evidenceIds,
        rationale: 'Direct evidence of platform ownership and operation.',
      },
      supports: [],
      gaps: [
        {
          signalId: 'signal-2',
          treatment: 'interview_topic',
          rationale: 'Clarify small-team operating practices in interview.',
        },
      ],
      omittedSignalIds: [],
    },
  } as const;
}

function pageDraftRun() {
  const paused = strategyRun();
  const claimId = paused.strategy.lead.claimId;
  return {
    ...paused,
    stage: 'page_spec_review',
    pageSpecId: '988c0a00-0000-4000-8000-000000000017',
    pageSpecHash: 'd'.repeat(64),
    pageSpecArtifactId: '988c0a00-0000-4000-8000-000000000018',
    pageSpecArtifactHash: 'e'.repeat(64),
    spec: {
      version: 1,
      company: {
        name: application.company,
        role: application.role,
        accent: application.accent,
      },
      hero: {
        eyebrow: 'Private application',
        title: 'Alex Morgan × Signal Forge',
        thesis:
          'End-to-end ownership of a reliable production platform, grounded in verified delivery evidence.',
      },
      blocks: [
        {
          type: 'fit',
          title: 'Why this experience transfers',
          claimIds: [claimId],
        },
        {
          type: 'gap',
          title: 'What to explore together',
          text: 'Small-team operating practices remain an interview topic.',
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

test('shows eligible evidence and requires confirmation before strategy', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const paused = evidenceRun();
  let request: { body: unknown; key?: string } | undefined;
  await mockApplication(page, paused);
  await page.route(`**/api/runs/${paused.runId}/strategy`, async (route) => {
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
          { stage: 'recruiter-strategist', status: 'pending', attempt: 1 },
        ],
      }),
    });
  });

  await page.goto(`/applications/${applicationId}`);
  await expect(
    page.getByRole('heading', {
      name: 'What your experience demonstrates for this role',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Owned a production deployment platform end to end.'),
  ).toBeVisible();
  await expect(page.getByText('Gap', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Start application strategy' })
    .click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  expect(request?.body).toEqual({
    evidenceArtifactId: paused.evidenceArchive.artifactId,
    evidenceArtifactHash: paused.evidenceArchive.artifactHash,
  });
  expect(request?.key).toMatch(/^[0-9a-f-]{36}$/);
});

test('shows the grounded strategy and requires human approval before drafting', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const paused = strategyRun();
  let request: { body: unknown; key?: string } | undefined;
  await mockApplication(page, paused);
  await page.route(
    `**/api/runs/${paused.runId}/strategy/approval`,
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
          stage: 'page_spec',
          steps: [
            ...paused.steps,
            { stage: 'page-composer', status: 'pending', attempt: 1 },
          ],
        }),
      });
    },
  );

  await page.goto(`/applications/${applicationId}`);
  await expect(
    page.getByRole('heading', { name: 'Approve the angle before drafting' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Lead with end-to-end ownership of a reliable production platform.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Topics to address honestly')).toBeVisible();
  await page
    .getByRole('button', { name: 'Approve application strategy' })
    .click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  expect(request?.body).toEqual({
    strategyArtifactId: paused.strategy.artifactId,
    strategyArtifactHash: paused.strategy.artifactHash,
  });
  expect(request?.key).toMatch(/^[0-9a-f-]{36}$/);
});

test('shows the structured draft and starts all reviews only after confirmation', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const paused = pageDraftRun();
  let request: { body: unknown; key?: string } | undefined;
  await mockApplication(page, paused);
  await page.route(`**/api/runs/${paused.runId}/reviews`, async (route) => {
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
        stage: 'review_recruiter',
        steps: [
          ...paused.steps,
          { stage: 'recruiter-reviewer', status: 'pending', attempt: 1 },
        ],
      }),
    });
  });

  await page.goto(`/applications/${applicationId}`);
  await expect(
    page.getByRole('heading', { name: 'Review the draft before the checks' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Alex Morgan × Signal Forge' }),
  ).toBeVisible();
  await expect(page.getByText('What to explore together')).toBeVisible();
  await page.getByRole('button', { name: 'Start the three reviews' }).click();
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  expect(request?.body).toEqual({});
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
