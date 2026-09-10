import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  applicationId,
  mockPersistedWorkspace,
  pendingReviewRun,
} from '../../../tests/e2e/persisted-workspace';
import { applicationSchema } from '../../../lib/application-contract';
import { persistedRunSchema } from '../../../lib/run-contract';

const baseURL = 'http://127.0.0.1:3117';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'en-US',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const fallback: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Never send API requests or non-local resources to real services.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      fallback.push(url.pathname);
      return route.fulfill({ status: 204 });
    }
    return route.continue();
  });
  const run = persistedRunSchema.parse(structuredClone(pendingReviewRun));
  const evidenceId = '988c0a00-0000-4000-8000-000000000082';
  run.profile.sources = [
    {
      id: 'source-1',
      kind: 'document',
      title: 'Build pipeline postmortem',
      sensitivity: 'private',
      allowedUses: ['application'],
      trust: 'untrusted-data',
    },
  ];
  run.profile.evidence = [
    {
      id: evidenceId,
      sourceId: 'source-1',
      label: 'Build time measurements',
      excerpt:
        'Median build time decreased from 11 to 7 minutes across the release pipeline.',
    },
  ];
  run.profile.claims = [
    {
      id: '988c0a00-0000-4000-8000-000000000081',
      statement: 'Reduced median build time from 11 to 7 minutes.',
      kind: 'result',
      level: 'verified',
      evidenceIds: [evidenceId],
      sensitivity: 'private',
      allowedUses: ['application'],
    },
  ];
  Object.assign(run.reviews[0].issues[0], {
    section: 'hero',
    claimId: '988c0a00-0000-4000-8000-000000000081',
    evidenceIds: [evidenceId],
    message: 'Use 11 → 7 minutes. The source does not support a 42% reduction.',
  });
  const uuid = (value: number) =>
    `988c0a00-0000-4000-8000-${String(value).padStart(12, '0')}`;
  for (const [index, [title, statement]] of [
    ['Release report', 'Reduced deployment lead time from 40 to 12 minutes.'],
    [
      'Platform ownership review',
      'Operated a platform serving 12 production services.',
    ],
    [
      'Incident follow-up',
      'Introduced actionable alerts and on-call runbooks.',
    ],
    [
      'Mentoring retrospective',
      'Mentored three engineers through their first production releases.',
    ],
    [
      'Frontend migration notes',
      'Migrated the customer dashboard to React and TypeScript.',
    ],
    [
      'Data export design',
      'Shipped tenant-isolated exports with restore verification.',
    ],
    [
      'Team operating guide',
      'Documented release ownership and incident handovers.',
    ],
  ].entries()) {
    const sourceId = uuid(100 + index);
    const proofId = uuid(200 + index);
    run.profile.sources.push({
      id: sourceId,
      kind: 'document',
      title,
      sensitivity: 'private',
      allowedUses: ['application', 'resume', 'interview'],
      trust: 'untrusted-data',
    });
    run.profile.evidence.push({
      id: proofId,
      sourceId,
      label: title,
      excerpt: statement,
    });
    run.profile.claims.push({
      id: uuid(300 + index),
      statement,
      kind: 'experience',
      level: 'verified',
      evidenceIds: [proofId],
      sensitivity: 'private',
      allowedUses: ['application', 'resume', 'interview'],
    });
  }
  for (const [index, statement] of [
    'Cloud cost savings',
    'Rust systems programming',
    'Cross-team technical leadership',
  ].entries()) {
    run.profile.claims.push({
      id: uuid(400 + index),
      statement,
      kind: index === 1 ? 'skill' : 'experience',
      level: index === 0 ? 'unsupported' : 'declared',
      evidenceIds: [],
      sensitivity: 'private',
      allowedUses: ['application', 'interview'],
    });
  }
  run.reviews.push({
    reviewId: uuid(500),
    reviewer: 'recruiter',
    passed: false,
    findings: ['Lead with the most relevant experience.'],
    issues: [
      {
        section: 'hero',
        message: 'Lead with your platform ownership.',
        blocking: false,
        claimId: uuid(301),
        evidenceIds: [uuid(201)],
      },
    ],
  });
  await mockPersistedWorkspace(page, run);
  await page.route('**/api/profile', (route) =>
    route.fulfill({ json: { profile: run.profile, revision: 1 } }),
  );
  const companies = [
    ['Signal Forge', 'Staff Platform Engineer', 'draft'],
    ['Atlas Health', 'Product Engineer', 'applied'],
    ['Vantage Labs', 'Platform Lead', 'interview'],
    ['Keel', 'Founding Engineer', 'draft'],
    ['Fathom', 'Backend Engineer', 'draft'],
    ['Orbital', 'Senior Engineer', 'applied'],
    ['Lumen', 'Staff Engineer', 'offer'],
    ['Helix', 'Infra Lead', 'closed'],
  ];
  const applications = companies.map(([company, role, stage], index) => ({
    applicationId:
      index === 0
        ? applicationId
        : `988c0a00-0000-4000-8000-${String(60 + index).padStart(12, '0')}`,
    company,
    role,
    stage,
    description: 'Build reliable software for a small product team.',
    url: 'https://jobs.example.test/platform',
    accent: '#5847e8',
    revision: 1,
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
  }));
  applicationSchema.array().parse(applications);
  persistedRunSchema.parse(run);
  await page.route('**/api/applications', (route) =>
    route.fulfill({ json: { applications } }),
  );
  await page.route('**/api/applications/*/run', (route) => {
    const url = route.request().url();
    if (url.includes(applicationId)) return route.fulfill({ json: run });
    const working = applications.findIndex(
      (item, index) =>
        (index === 3 || index === 4) && url.includes(item.applicationId),
    );
    return working >= 0
      ? route.fulfill({
          json: persistedRunSchema.parse({
            ...run,
            runId: uuid(600 + working),
            reviews: [],
            status: 'running',
            stage: 'research',
            steps: [
              { stage: 'company-researcher', status: 'in_flight', attempt: 1 },
            ],
          }),
        })
      : route.fulfill({ status: 204 });
  });
  await page.route('**/api/publications', (route) =>
    route.fulfill({ json: { publications: [] } }),
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: 'synthetic-alex',
          name: 'Alex Morgan',
          email: 'alex@example.test',
          emailVerified: true,
        },
        session: null,
      },
    }),
  );
  for (const [name, route, heading] of [
    ['01-home', '/', 'Hello Alex'],
    ['02-applications', '/applications', 'Applications'],
    [
      '03-evidence-review',
      `/applications/${applicationId}/review`,
      'Use 11 → 7 minutes. The source does not support a 42% reduction.',
    ],
  ]) {
    await page.goto(baseURL + route);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    const footer = page.locator('.co-sidebar-footer');
    if (await footer.count()) {
      await expect(footer).toBeVisible();
      const bounds = (await footer.boundingBox())!;
      console.log(name, 'sidebar footer', bounds);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000);
    }
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}.png`, import.meta.url)),
      animations: 'disabled',
    });
    console.log(name, await page.locator('h1').allTextContents());
  }
  console.log(
    JSON.stringify({
      errors,
      interceptedUnconfiguredEndpoints: [...new Set(fallback)],
    }),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
