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
    page.getByRole('heading', { name: 'Northstar Labs' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate Draft' }).click();
  await expect(page.getByText('Alex Morgan × Northstar Labs')).toBeVisible();
  await page
    .getByRole('button', {
      name: /Reduced a fictional deployment workflow.*View evidence/,
    })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Why these statements?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close evidence inspector' }).click();
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
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Run Review' }).click();
  const approval = page.getByLabel(
    'I reviewed the evidence and approve this application.',
  );
  await expect(approval).toBeEnabled();
  await approval.check();
  await page.getByRole('button', { name: 'Continue to Share' }).click();
  await page.getByRole('button', { name: 'Create Private Link' }).click();
  await expect(page.getByRole('status')).toContainText('/p/');
  await expect(page.getByRole('status')).toContainText('Active');
  const href = await page
    .getByRole('link', { name: 'Open Private Page' })
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
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revoke Private Link' }).click();
  await expect(
    page.getByRole('button', { name: 'Create Private Link' }),
  ).toBeVisible();
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
  await page.getByRole('button', { name: 'Career Memory' }).click();
  await page.getByText('Add Statement & Source').click();
  await page.getByLabel('Source Title').fill('Synthetic interview notes');
  await page
    .getByLabel('Statement', { exact: true })
    .fill('Built a fictional customer feedback loop.');
  await page.getByRole('button', { name: 'Save to Career Memory' }).click();
  await expect(page.getByText('3 statements')).toBeVisible();
  await expect(
    page.getByText('Built a fictional customer feedback loop.'),
  ).toBeVisible();
  await expect(page.getByText('No supporting evidence').last()).toBeVisible();
});

test('fits 375, 768, and 1440 widths without horizontal overflow', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Generate Draft' }).click();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow, `${width}px viewport`).toBe(false);
  }
});

test('preserves the opportunity and offers retry when evidence does not match', async ({
  page,
}) => {
  await page.getByLabel('Role').fill('Astrophysicist');
  await page
    .getByLabel('Job description')
    .fill('Calibrate telescope optics and model stellar spectra.');
  await page.getByRole('button', { name: 'Generate Draft' }).click();
  await expect(page.locator('.inline-error')).toContainText(
    'No evidence matches this role.',
  );
  await expect(page.getByLabel('Role')).toHaveValue('Astrophysicist');
  await expect(page.getByRole('button', { name: 'Retry Draft' })).toBeVisible();
});

test('keeps run mechanics in Activity details', async ({ page }) => {
  await page.getByRole('button', { name: 'Generate Draft' }).click();
  await page.getByRole('button', { name: 'Activity' }).click();
  await expect(
    page.getByRole('heading', { name: 'Run history' }),
  ).toBeVisible();
  await expect(page.getByText('Draft completed').first()).toBeVisible();
  await expect(page.getByText('company-researcher').first()).toBeHidden();
  await page.getByText('Run details').first().click();
  await expect(page.getByText('company-researcher').first()).toBeVisible();
});
