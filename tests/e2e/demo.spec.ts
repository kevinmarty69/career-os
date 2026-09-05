import { expect, test } from '@playwright/test';

test('offers a public, synthetic, read-only demo in English by default', async ({
  context,
  page,
}, testInfo) => {
  await context.clearCookies();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(`${request.method()} ${request.url()}`);
  });

  await page.goto('/demo');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'See how evidence becomes an application.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Synthetic demo · Read-only')).toBeVisible();
  await expect(page.getByText('No real-world action')).toBeVisible();
  expect(writes).toEqual([]);

  if (
    process.env.CAREER_OS_DEMO_SCREENSHOT &&
    testInfo.project.name === 'chromium'
  )
    await page.screenshot({
      path: process.env.CAREER_OS_DEMO_SCREENSHOT,
      fullPage: true,
    });
});

test('switches the demo to French without horizontal overflow', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await page.goto('/demo');
  await page
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: 'FR' })
    .click();

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Voir comment les preuves deviennent une candidature.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Démo fictive · Lecture seule')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
