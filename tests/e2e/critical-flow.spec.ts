import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (location.pathname === '/') localStorage.removeItem('career-os-demo');
  });
  await page.goto('/');
});

test('builds, reviews, approves and issues one private capability', async ({
  page,
}) => {
  await expect(
    page.getByText('All visible candidate content is synthetic.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Build strategy & PageSpec' }).click();
  await expect(page.getByText('Alex Morgan × Northstar Labs')).toBeVisible();
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
  await page.getByRole('link', { name: 'Open private demo' }).click();
  await expect(
    page.getByRole('heading', { name: 'Alex Morgan × Northstar Labs' }),
  ).toBeVisible();
  await expect(page.locator('nav')).toHaveCount(0);
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
