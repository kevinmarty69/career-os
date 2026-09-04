import { expect, test, type Page } from '@playwright/test';

const applicationId = '988c0a00-0000-4000-8000-000000000008';
const application = {
  applicationId,
  discoveredJobId: '988c0a00-0000-4000-8000-000000000009',
  company: 'Signal Forge',
  role: 'Staff Platform Engineer',
  description: 'Own the deployment platform and its production reliability.',
  url: 'https://jobs.example.test/staff-platform',
  accent: '#5847e8',
  stage: 'draft',
  companySources: [
    { url: 'https://jobs.example.test/staff-platform', origin: 'api' },
  ],
  revision: 2,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T13:30:00.000Z',
};

async function mockApplication(page: Page) {
  await page.route(`**/api/applications/${applicationId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(application),
    }),
  );
}

test('renders the persisted application instead of the Nimbus fixture', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockApplication(page);
  await page.goto(`/applications/${applicationId}`);

  await expect(
    page.getByRole('heading', { name: 'Staff Platform Engineer' }),
  ).toBeVisible();
  await expect(page.getByText('Signal Forge').first()).toBeVisible();
  await expect(page.getByText('Revision')).toBeVisible();
  await expect(page.getByText('Nimbus Robotics')).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Staff Platform Engineer' }),
  ).toBeVisible();
});

test('keeps the persisted dossier readable on mobile', async ({ page }) => {
  await mockApplication(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/applications/${applicationId}`);

  await expect(
    page.getByRole('heading', { name: 'Staff Platform Engineer' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
