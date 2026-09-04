import { expect, test } from '@playwright/test';

const englishScreens = [
  ['/', 'Three claims need your decision before you send your private page.'],
  ['/memory', 'Career memory'],
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
  ['/applications/nimbus/versions', '3 changes · 1 section added'],
  ['/runs', 'Agent runs'],
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
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', {
      name: 'Three claims need your decision before you send your private page.',
    }),
  ).toBeVisible();

  const switcher = page.getByRole('group', { name: 'Language' });
  await switcher.getByRole('button', { name: 'FR' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      name: 'Trois affirmations à trancher avant d’envoyer votre page privée.',
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      name: 'Trois affirmations à trancher avant d’envoyer votre page privée.',
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
