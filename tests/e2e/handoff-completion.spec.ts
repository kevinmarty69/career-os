import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { syntheticProfile } from '../../lib/fixture';
import { profileSchema } from '../../lib/schemas';
import { applicationId, mockPersistedWorkspace } from './persisted-workspace';
import { type ApplicationTimelineEvent } from '../../lib/application-timeline';
import {
  defaultNotificationPreferences,
  notificationPreferenceKey,
} from '../../lib/notification-preferences';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

test('GitHub import HTTP boundary rejects anonymous and cross-origin requests', async ({
  request,
}) => {
  const input = { repository: 'synthetic/project' };
  const anonymous = await request.post('/api/profile/import-github', {
    data: input,
    headers: { origin: 'http://localhost:3117' },
  });
  expect(anonymous.status()).toBe(401);
  const foreign = await request.post('/api/profile/import-github', {
    data: input,
    headers: { origin: 'https://foreign.example.test' },
  });
  expect(foreign.status()).toBe(403);
});

test('public README is reviewed with no automatic attribution or workspace write', async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/profile') && request.method() === 'PUT')
      writes++;
  });
  let failed = true;
  await page.route('**/api/profile/import-github', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      repository: 'https://github.com/synthetic/project',
    });
    if (failed)
      return route.fulfill({
        status: 503,
        json: { error: 'Synthetic rate limit' },
      });
    await route.fulfill({
      json: {
        repository: 'synthetic/project',
        url: 'https://github.com/synthetic/project',
        readme:
          'Projects\nBuilt a bounded source parser for public career documents.\nAdded explicit human review before publishing any application.',
        sha: 'a'.repeat(40),
        stars: 2,
        languages: ['TypeScript'],
        updatedAt: '2026-09-09T10:00:00.000Z',
        fetchedAt: '2026-09-09T10:00:00.000Z',
      },
    });
  });
  await page.goto('/memory/import');
  await page
    .getByLabel('Public repository', { exact: true })
    .fill('https://github.com/synthetic/project');
  await page.getByRole('button', { name: 'Read public README' }).click();
  await expect(
    page.getByText('Public README unavailable.', { exact: false }),
  ).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Read public README' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review what was extracted' }),
  ).toBeVisible();
  const selections = page.locator('article > header input[type="checkbox"]');
  await expect(selections.first()).not.toBeChecked();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(
    'Alex Morgan',
  );
  expect(writes).toBe(0);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Review what was extracted' }),
  ).toBeVisible();
  await expect(selections.first()).not.toBeChecked();
  await page.screenshot({
    path: info.outputPath('github-review-en.png'),
    fullPage: true,
  });
});

test('debrief retains failed input and persists in the application timeline', async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  const events: ApplicationTimelineEvent[] = [];
  let fail = true;
  await page.route(
    `**/api/applications/${applicationId}/timeline`,
    async (route) => {
      if (route.request().method() === 'POST') {
        if (fail)
          return route.fulfill({
            status: 503,
            json: { error: 'Synthetic outage' },
          });
        const event = {
          ...route.request().postDataJSON(),
          applicationId,
          eventId: '988c0a00-0000-4000-8000-000000000099',
          actor: 'human',
          createdAt: new Date().toISOString(),
        };
        events.unshift(event);
        return route.fulfill({ json: event });
      }
      await route.fulfill({ json: { events } });
    },
  );
  await page.goto(`/applications/${applicationId}/debrief`);
  await page
    .getByLabel('Question 1', { exact: true })
    .fill('How did you reduce build times?');
  await page
    .getByLabel('Your answer', { exact: true })
    .fill('I described the measured change from 11 to 7 minutes.');
  await page.getByRole('button', { name: 'Save debrief', exact: true }).click();
  await expect(page.locator('#main-content').getByRole('alert')).toContainText(
    'Could not load or save',
  );
  await expect(page.getByLabel('Question 1', { exact: true })).toHaveValue(
    'How did you reduce build times?',
  );
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Open guided interview' }).click();
  await expect(page).toHaveURL(new RegExp(`${applicationId}/debrief$`));
  fail = false;
  await page.getByRole('button', { name: 'Save debrief', exact: true }).click();
  await expect(
    page.getByText('Debrief saved in the private timeline'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Question 1', { exact: true })).toHaveValue(
    'How did you reduce build times?',
  );
  expect(events).toHaveLength(1);
  await page.screenshot({
    path: info.outputPath('interview-debrief-en.png'),
    fullPage: true,
  });
});

test('unknown routes return an actual 404', async ({ page }) => {
  await mockPersistedWorkspace(page);
  const response = await page.goto('/not-a-career-os-route');
  expect(response?.status()).toBe(404);
});

test('source arbitration persists without deleting the conflicting version', async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  const base = syntheticProfile.claims[0];
  let profile = {
    ...syntheticProfile,
    evidence: syntheticProfile.evidence.map((item) => ({
      ...item,
      excerpt:
        'Synthetic CV: led a team of 6 engineers. Synthetic profile: led a team of 9 engineers.',
    })),
    claims: [
      {
        ...base,
        id: 'first',
        level: 'unsupported' as const,
        statement: 'I led a team of 6 engineers.',
      },
      {
        ...base,
        id: 'second',
        level: 'unsupported' as const,
        statement: 'I led a team of 9 engineers.',
      },
    ],
  };
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'PUT')
      profile = profileSchema.parse(
        route.request().postDataJSON().profile,
      ) as typeof profile;
    await route.fulfill({ json: { profile, revision: 1 } });
  });
  await page.goto('/memory/conflicts');
  await expect(
    page.getByRole('heading', { name: 'Which version is accurate?' }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('source-conflict-en.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Use this version' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'No numeric conflicts detected' }),
  ).toBeVisible();
  expect(profile.claims).toHaveLength(2);
  expect(profile.claims[0].level).toBe('declared');
  expect(profile.claims[1].level).toBe('unsupported');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'No numeric conflicts detected' }),
  ).toBeVisible();
});

test('notification preferences persist across reload and do not mask failed writes', async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  const id = '988c0a00-0000-4000-8000-000000000001';
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token =
    [
      { alg: 'HS256', typ: 'JWT' },
      { sub: id, exp: expiry, session_id: id },
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
      .join('.') + '.synthetic-signature';
  const project = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1',
  ).hostname.split('.')[0];
  let preferences = { ...defaultNotificationPreferences };
  const user = () => ({
    id,
    aud: 'authenticated',
    email: 'synthetic@example.test',
    user_metadata: { [notificationPreferenceKey]: preferences },
  });
  await context.addCookies([
    {
      name: `sb-${project}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: expiry, token_type: 'bearer', user: user() })).toString('base64url')}`,
      url: 'http://localhost:3117',
    },
  ]);
  let fail = false;
  await page.route('**/auth/v1/**', async (route) => {
    expect(new URL(route.request().url()).pathname).toBe('/auth/v1/user');
    if (route.request().method() === 'PUT') {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { message: 'Synthetic outage' },
        });
      preferences = route.request().postDataJSON().data[
        notificationPreferenceKey
      ];
    }
    await route.fulfill({ json: user() });
  });
  await page.goto('/settings/notifications');
  const review = page.getByRole('checkbox', {
    name: 'A review is ready for your decision',
  });
  await expect(review).not.toBeChecked();
  await review.click();
  await expect(review).toBeChecked();
  await expect(review).toBeEnabled();
  await page.reload();
  await expect(review).toBeChecked();
  await page.screenshot({
    path: info.outputPath('notification-preferences-en.png'),
    fullPage: true,
  });
  fail = true;
  await review.click();
  await expect(page.locator('#main-content').getByRole('alert')).toContainText(
    'Could not load or save',
  );
  await expect(review).toBeChecked();
  expect(preferences.reviewReady).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
