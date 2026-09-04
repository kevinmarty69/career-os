import { expect, test } from '@playwright/test';
import {
  applicationId,
  journalRun,
  mockPersistedWorkspace,
  mockPositioningAuditWorkspace,
  pendingReviewRun,
} from './persisted-workspace';

const englishScreens = [
  ['/', 'Start the evidence workflow for Signal Forge.'],
  ['/memory', 'Career memory'],
  ['/memory/audit', 'Align your evidence before editing your profile.'],
  ['/applications', 'Applications'],
  ['/applications/nimbus/review', '3 suggested changes'],
  ['/memory/import', 'Add your background'],
  [
    '/applications/nimbus/page',
    'Keep a fleet of 12,000 robots running on a platform three people can operate.',
  ],
  ['/links', 'Private links'],
  ['/insights', 'Insights'],
  [
    '/memory/interview',
    'On the monorepo migration, what did not go as planned?',
  ],
  ['/interviews/demo', 'Technical interview · Vantage Labs'],
  ['/assets', 'Assets'],
  ['/settings/models', 'Models & agents'],
  ['/applications/nimbus?state=running', 'Platform Engineer'],
  ['/memory/conflicts', 'Source conflicts'],
  ['/settings/privacy', 'Evidence privacy'],
  [
    '/applications/nimbus/published',
    'Your private page for Nimbus Robotics is live.',
  ],
  ['/interviews/demo/debrief', 'Interview debrief'],
  [`/applications/${applicationId}/versions`, 'Version and decision history'],
  ['/runs', 'Agent run journal'],
  ['/applications/nimbus/company', 'Company brief'],
  ['/messages', 'Messages'],
  ['/memory/skills', 'Skills'],
  ['/onboarding/hosting', 'Choose your hosting mode'],
  ['/inbox', 'Needs review'],
  ['/settings/billing', 'Subscription'],
  ['/settings/integrations', 'Integrations & API'],
  ['/settings/data', 'Export & deletion'],
] as const;

test('renders every active route in English without a locale cookie', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);

  for (const [route, heading] of englishScreens) {
    await test.step(route, async () => {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(
        page.getByRole('heading', { level: 1, name: heading, exact: true }),
      ).toBeVisible();
    });
  }
});

test('switches from English to French and persists after reload', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', {
      name: 'Start the evidence workflow for Signal Forge.',
    }),
  ).toBeVisible();

  const switcher = page.getByRole('group', { name: 'Language' });
  await switcher.getByRole('button', { name: 'FR' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      name: 'Lancez le workflow de preuves pour Signal Forge.',
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      name: 'Lancez le workflow de preuves pour Signal Forge.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'FR', pressed: true }),
  ).toBeVisible();

  await page.goto('/applications');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Candidatures',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder('Rechercher une entreprise, un rôle ou un lieu…'),
  ).toBeVisible();
  await page.keyboard.press('Control+K');
  await expect(
    page.getByRole('searchbox', { name: 'Recherche globale' }),
  ).toBeFocused();
});

test('separates persisted opportunities from started applications', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  await page.goto('/applications');

  await expect(
    page.getByRole('heading', { name: 'Discovered opportunities' }),
  ).toBeVisible();
  await expect(page.getByText('Northstar Labs', { exact: true })).toBeVisible();
  const applications = page.getByRole('region', {
    name: 'Started applications',
  });
  await expect(
    applications.getByRole('heading', { name: 'Applications' }),
  ).toBeVisible();
  await expect(
    applications.getByText('Signal Forge', { exact: true }),
  ).toBeVisible();
  await expect(applications.getByText('Draft', { exact: true })).toBeVisible();
});

test('searches the persisted workspace and filters the application pipeline', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  await page.goto('/');

  await page.keyboard.press('Control+K');
  const search = page.getByRole('searchbox', { name: 'Global search' });
  await expect(search).toBeFocused();
  await search.fill('11 minutes');
  await expect(
    page.getByRole('link', {
      name: /Reduced build p50 from 11 to 7 minutes/,
    }),
  ).toBeVisible();
  if (process.env.CAREER_OS_SEARCH_SCREENSHOT)
    await page.screenshot({
      path: process.env.CAREER_OS_SEARCH_SCREENSHOT,
      fullPage: true,
    });
  await page.keyboard.press('Escape');

  await page.goto('/applications');
  const pipeline = page.getByRole('search');
  await pipeline
    .getByPlaceholder('Search a company, role, or location…')
    .fill('Signal Forge');
  await expect(page.getByText('Signal Forge', { exact: true })).toBeVisible();
  await expect(page.getByText('Northstar Labs', { exact: true })).toHaveCount(
    0,
  );
  await pipeline.getByLabel('Type').selectOption('opportunities');
  await expect(page.getByText('Signal Forge', { exact: true })).toHaveCount(0);
  await pipeline
    .getByPlaceholder('Search a company, role, or location…')
    .fill('Northstar');
  await expect(page.getByText('Northstar Labs', { exact: true })).toBeVisible();
});

test('shows persisted publication versions and human decisions', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  await page.goto(`/applications/${applicationId}/versions`);

  await expect(
    page.getByRole('heading', { name: 'Version and decision history' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /v1 active current/ }),
  ).toBeVisible();
  await expect(
    page.getByText('Strong platform ownership match.'),
  ).toBeVisible();
  await expect(page.getByText('Application record')).toBeVisible();
  await expect(
    page.getByText('No human decision has been recorded.'),
  ).toHaveCount(0);
  if (process.env.CAREER_OS_HISTORY_SCREENSHOT)
    await page.screenshot({
      path: process.env.CAREER_OS_HISTORY_SCREENSHOT,
      fullPage: true,
    });
});

test('shows descriptive response trends without claiming causality', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  await page.goto('/insights');

  await expect(
    page.getByRole('heading', { name: 'Activity over 8 weeks' }),
  ).toBeVisible();
  await expect(page.getByText('50%')).toBeVisible();
  await expect(
    page.getByText(/They do not attribute any response/),
  ).toBeVisible();
  await expect(page.getByText(/When evidence is inspected/)).toHaveCount(0);
  if (process.env.CAREER_OS_INSIGHTS_SCREENSHOT)
    await page.screenshot({
      path: process.env.CAREER_OS_INSIGHTS_SCREENSHOT,
      fullPage: true,
    });
});

test('shows a persisted agent run as a readable journal', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page, journalRun);
  await page.goto('/runs');

  await expect(
    page.getByRole('heading', { name: 'Agent run journal' }),
  ).toBeVisible();
  await expect(page.getByText('€0.18')).toBeVisible();
  await expect(page.getByText('2,400')).toBeVisible();
  await expect(page.getByText('source_mismatch')).toBeVisible();
  await expect(
    page.getByText('jobs.example.test', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('1 human decision')).toBeVisible();
  await expect(page.getByText('Fathom')).toHaveCount(0);
  if (process.env.CAREER_OS_RUNS_SCREENSHOT)
    await page.screenshot({
      path: process.env.CAREER_OS_RUNS_SCREENSHOT,
      fullPage: true,
    });
});

test('audits positioning from persisted sources, goals and application claims', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPositioningAuditWorkspace(page);
  await page.goto('/memory/audit');

  await expect(page.getByText('Staff Platform Engineer')).toBeVisible();
  await expect(
    page.locator('.co-audit-targets > div > span', {
      hasText: 'Kubernetes',
    }),
  ).toBeVisible();
  await expect(page.getByText('1 supported claim').first()).toBeVisible();
  await expect(page.getByText('Owned Kubernetes operations.')).toBeVisible();
  await expect(page.getByText(/\[measured outcome\]/)).toBeVisible();
  await expect(
    page.getByText(/does not infer recruiter intent or response causality/),
  ).toBeVisible();
  if (process.env.CAREER_OS_POSITIONING_SCREENSHOT)
    await page.screenshot({
      path: process.env.CAREER_OS_POSITIONING_SCREENSHOT,
      fullPage: true,
    });
  await page
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: 'FR' })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Alignez vos preuves avant de modifier votre profil.',
    }),
  ).toBeVisible();
});

test('shows only persisted human decisions in the review queue', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const run = {
    ...pendingReviewRun,
    reviews: [
      ...pendingReviewRun.reviews,
      {
        reviewId: '988c0a00-0000-4000-8000-000000000047',
        reviewer: 'recruiter',
        passed: false,
        findings: ['Remove the weaker supporting claim.'],
        issues: [
          {
            section: 'relevant_experience',
            message: 'This supporting claim is not useful for the role.',
            blocking: false,
            claimId: '988c0a00-0000-4000-8000-000000000048',
          },
        ],
      },
    ],
  } as const;
  await mockPersistedWorkspace(page, run);
  await page.goto('/inbox');

  await expect(
    page.getByRole('heading', { name: 'Needs review', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Signal Forge · factuality/)).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Use the measured value from the source.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Correct section' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Source in memory' }),
  ).toHaveCount(2);
  await expect(
    page.getByRole('link', { name: 'Source in memory' }).nth(1),
  ).toHaveAttribute(
    'href',
    '/memory#claim-988c0a00-0000-4000-8000-000000000048',
  );
  await expect(
    page.getByRole('button', { name: 'Remove claim' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Keep as written' }),
  ).toBeVisible();
  await expect(
    page
      .locator('.co-inbox-list > article', {
        hasText: 'Use the measured value from the source.',
      })
      .getByRole('button', { name: 'Keep as written' }),
  ).toHaveCount(0);
  await expect(page.getByText('Nimbus Robotics')).toHaveCount(0);
  if (process.env.CAREER_OS_INBOX_SCREENSHOT)
    await page.screenshot({
      path: process.env.CAREER_OS_INBOX_SCREENSHOT,
      fullPage: true,
    });
});

test('localizes authentication and private recipient surfaces', async ({
  context,
  page,
}) => {
  await context.clearCookies();

  await page.goto('/sign-in');
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: 'FR' })
    .click();
  await expect(page.getByRole('heading', { name: 'Bon retour' })).toBeVisible();

  await page.goto('/p/not-a-real-link');
  await expect(
    page.getByRole('heading', { name: 'Ce lien n’est plus actif.' }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'Langue' })
    .getByRole('button', { name: 'EN' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'This link is no longer active.' }),
  ).toBeVisible();
});
