import { expect, test, type Page } from '@playwright/test';
import { mockPersistedWorkspace } from './persisted-workspace';

async function account(page: Page) {
  await mockPersistedWorkspace(page);
  await page.route('**/api/auth/get-session**', (route) =>
    route.fulfill({
      json: {
        session: {
          id: 'test-session',
          token: 'test-only-token',
          userId: 'account-kevin',
          expiresAt: '2099-01-01T00:00:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        user: {
          id: 'account-kevin',
          name: 'Kevin Marty',
          email: 'kevin@example.test',
          emailVerified: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      },
    }),
  );
}

test('account disclosure, language persistence and separate instance settings', async ({
  page,
}, testInfo) => {
  await account(page);
  await page.goto('/');
  const trigger = page.locator('summary:visible');
  await expect(trigger).toHaveAttribute('aria-label', 'Mon compte · Kevin');
  await trigger.focus();
  await trigger.press('Enter');
  await expect(
    page.getByRole('link', { name: 'Paramètres du profil', exact: true }),
  ).toBeVisible();
  await trigger.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'Paramètres du profil', exact: true }),
  ).not.toBeVisible();
  await trigger.click();
  await page.mouse.click(4, 4);
  await expect(
    page.getByRole('link', { name: 'Paramètres du profil', exact: true }),
  ).not.toBeVisible();
  await trigger.click();
  await page
    .getByRole('link', { name: 'Paramètres du profil', exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(
    page.getByRole('heading', { name: 'Kevin Marty' }),
  ).toBeVisible();
  await page.getByLabel('Langue de l’interface').selectOption('en');
  await expect(
    page.getByRole('heading', { name: 'Profile settings' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Preference saved.');
  await page.reload();
  await expect(page.getByLabel('Interface language')).toHaveValue('en');
  await page.locator('summary:visible').click();
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('profile-settings-en.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto('/memory');
  await expect(
    page.getByText('Reduced build p50 from 11 to 7 minutes.'),
  ).toBeVisible();
  await page.goto('/settings/models');
  await expect(
    page.locator('.co-settings-nav a[href="/settings/profile"]'),
  ).toHaveCount(0);
  await page.goto('/settings/profile');
  await page.getByLabel('Interface language').selectOption('fr');
  await expect(
    page.getByRole('heading', { name: 'Paramètres du profil' }),
  ).toBeVisible();
});

test('sign out handles failure and redirects only after successful server revocation', async ({
  page,
}) => {
  await account(page);
  let attempts = 0;
  await page.route('**/api/auth/sign-out', (route) => {
    expect(route.request().method()).toBe('POST');
    attempts += 1;
    return route.fulfill(
      attempts === 1
        ? {
            status: 500,
            json: { code: 'INTERNAL_SERVER_ERROR', message: 'Test failure' },
          }
        : { json: { success: true } },
    );
  });
  await page.goto('/');
  await page.evaluate(() =>
    sessionStorage.setItem('career-os-memory-import:v1', 'unsaved test CV'),
  );
  await page.locator('summary:visible').click();
  await page
    .getByRole('button', { name: 'Se déconnecter', exact: true })
    .click();
  await expect(page.locator('details[open]').getByRole('alert')).toHaveText(
    'La déconnexion a échoué. Réessayez.',
  );
  await expect(page).toHaveURL(/\/$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('career-os-memory-import:v1'),
    ),
  ).toBe('unsaved test CV');
  await page
    .getByRole('button', { name: 'Se déconnecter', exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('career-os-memory-import:v1'),
    ),
  ).toBeNull();
  expect(attempts).toBe(2);
});
