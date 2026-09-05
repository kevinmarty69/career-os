import { expect, test, type Page } from '@playwright/test';

const currentToken = 'current-session-token';
const otherToken = 'other-session-token';

test('lists devices and revokes one session without exposing its token', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  let revokedToken: string | undefined;
  await mockSessions(page, (token) => {
    revokedToken = token;
  });

  await page.goto('/settings/privacy');

  const manager = page.locator('.co-session-manager');
  await expect(manager.getByText('2 active')).toBeVisible();
  await expect(manager.getByText('This device')).toBeVisible();
  await expect(manager.getByText('Other device')).toBeVisible();
  await expect(page.getByText(currentToken)).toHaveCount(0);
  await expect(page.getByText(otherToken)).toHaveCount(0);

  if (process.env.CAREER_OS_SESSION_SCREENSHOT)
    await page.screenshot({
      path: process.env.CAREER_OS_SESSION_SCREENSHOT,
      fullPage: true,
    });

  await manager.getByRole('button', { name: 'Revoke' }).click();
  await expect(manager.getByText('1 active')).toBeVisible();
  await expect(manager.getByText('Other device')).toHaveCount(0);
  expect(revokedToken).toBe(otherToken);
});

async function mockSessions(page: Page, onRevoke: (token: string) => void) {
  const date = '2026-09-05T10:00:00.000Z';
  await page.route('**/api/auth/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/list-sessions')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'current-session',
            token: currentToken,
            userId: 'user-demo',
            createdAt: date,
            updatedAt: date,
            expiresAt: '2026-10-05T10:00:00.000Z',
            userAgent: 'Mozilla/5.0 Safari/605.1.15',
          },
          {
            id: 'other-session',
            token: otherToken,
            userId: 'user-demo',
            createdAt: date,
            updatedAt: date,
            expiresAt: '2026-10-05T10:00:00.000Z',
            userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
          },
        ]),
      });
      return;
    }
    if (pathname.endsWith('/get-session')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            id: 'current-session',
            token: currentToken,
            userId: 'user-demo',
            createdAt: date,
            updatedAt: date,
            expiresAt: '2026-10-05T10:00:00.000Z',
          },
          user: {
            id: 'user-demo',
            name: 'Alex Morgan',
            email: 'alex@example.test',
            emailVerified: true,
            createdAt: date,
            updatedAt: date,
          },
        }),
      });
      return;
    }
    if (pathname.endsWith('/revoke-session')) {
      const body = route.request().postDataJSON() as { token: string };
      onRevoke(body.token);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: true }),
      });
      return;
    }
    await route.fulfill({ status: 404 });
  });
}
