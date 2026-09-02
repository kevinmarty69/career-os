import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.pathname === '/') localStorage.removeItem('career-os-demo');
  });
  await page.goto('/');
});

test('builds, reviews, approves and issues one private capability', async ({
  browser,
  page,
}) => {
  await expect(
    page.getByText('All visible candidate content is synthetic.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Build strategy & PageSpec' }).click();
  await expect(page.getByText('Alex Morgan × Northstar Labs')).toBeVisible();
  const forgedStatus = await page.evaluate(async () => {
    const saved = JSON.parse(localStorage.getItem('career-os-demo')!);
    const response = await fetch('/api/publications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile: saved.profile,
        spec: saved.spec,
        approved: true,
        opportunity: {
          company: 'Cosmos Institute',
          role: 'Astrophysicist',
          description: 'Calibrate telescope optics and model stellar spectra.',
          accent: '#21504b',
        },
      }),
    });
    return response.status;
  });
  expect(forgedStatus).toBe(400);
  await expect(
    page.getByRole('button', { name: 'Publish private capability' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Run 3 observable reviews' }).click();
  const approval = page.getByLabel(
    'I reviewed the claims and approve this private publication.',
  );
  await expect(approval).toBeEnabled();
  await approval.check();
  await page
    .getByRole('button', { name: 'Publish private capability' })
    .click();
  await expect(page.getByRole('status')).toContainText('/p/');
  await expect(page.getByRole('status')).toContainText('No cross-navigation');
  const href = await page
    .getByRole('link', { name: 'Open private demo' })
    .getAttribute('href');
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto(new URL(href!, page.url()).href);
  await expect(
    freshPage.getByRole('heading', { name: 'Alex Morgan × Northstar Labs' }),
  ).toBeVisible();
  await freshPage.locator('details').first().locator('summary').click();
  await expect(
    freshPage.getByText('Synthetic launch postmortem').first(),
  ).toBeVisible();
  await expect(
    freshPage.getByText(/Enjoys turning ambiguous requirements/),
  ).toHaveCount(0);
  expect(freshPage.url()).not.toContain('#');
  await expect(freshPage.locator('nav')).toHaveCount(0);
  await page.getByRole('button', { name: 'Revoke private capability' }).click();
  await freshPage.reload();
  await expect(
    freshPage.getByRole('heading', {
      name: 'Private application unavailable.',
    }),
  ).toBeVisible();
  await freshContext.close();
});

test('records a declared claim and exposes provenance progressively', async ({
  page,
}) => {
  await page.getByText('Add source, claim & proof').click();
  await page.getByLabel('Source title').fill('Synthetic interview notes');
  await page
    .getByRole('textbox', { name: 'Claim', exact: true })
    .fill('Built a fictional customer feedback loop.');
  await page.getByRole('button', { name: 'Save to Career Memory' }).click();
  await expect(page.getByText('3 claims')).toBeVisible();
  await page.getByText('Inspect provenance').click();
  await expect(
    page.getByText('Built a fictional customer feedback loop.'),
  ).toBeVisible();
  await expect(page.getByText('Explicitly unverified').last()).toBeVisible();
});

test('fits a narrow viewport without horizontal overflow', async ({ page }) => {
  await page.getByRole('button', { name: 'Build strategy & PageSpec' }).click();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
