import { expect, test } from '@playwright/test';
import {
  applicationId,
  mockPersistedWorkspace,
  pendingReviewRun,
} from './persisted-workspace';

test('new handoff surfaces retain the French locale', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'fr', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  for (const [path, heading] of [
    ['/settings/integrations', 'Intégrations'],
    ['/memory/interview', 'Entretien guidé'],
    ['/not-a-real-page', 'Cette page n’existe pas.'],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { level: 1, name: heading, exact: true }),
    ).toBeVisible();
  }
  await page.goto('/sign-in');
  await expect(
    page.getByRole('button', { name: 'Recevoir mon lien' }),
  ).toBeVisible();
});

test('notifications use real workspace activity and restore focus on close', async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  await page.route(`**/api/applications/${applicationId}/run`, (route) =>
    route.fulfill({ json: pendingReviewRun }),
  );
  await page.goto('/');
  const trigger = page.getByRole('button', {
    name: 'Notifications',
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog.getByText('Signal Forge', { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Open application' }),
  ).toHaveAttribute('href', /\/applications\//);
  await expect(
    dialog.getByRole('button', { name: 'Close', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('link', { name: 'All decisions' }),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('notifications-en.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('settings and unknown routes use the kit without offering fake connectors or payments', async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  for (const [path, heading] of [
    ['/settings/integrations', 'Integrations'],
    ['/settings/billing', 'Subscription'],
    ['/settings/models', 'Models & agents'],
    ['/not-a-real-page', 'This page does not exist.'],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${path.split('/').at(-1)}-en.png`),
      fullPage: true,
    });
  }
  await page.goto('/settings/billing');
  await expect(
    page.getByRole('button', { name: 'Billing unavailable' }),
  ).toBeDisabled();
  await page.goto('/memory');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event('offline'));
  });
  await expect(
    page.getByText('You are offline.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Reduced build p50 from 11 to 7 minutes.', { exact: true }),
  ).toBeVisible();
});
