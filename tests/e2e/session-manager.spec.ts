import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';

// Match Next's local build environment when constructing the synthetic auth cookie.
// CI-provided variables keep precedence; no real authentication request is sent.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

test('lists device IDs and revokes other Supabase sessions without displaying bearer tokens', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const currentId = '988c0a00-0000-4000-8000-000000000001';
  const otherId = '988c0a00-0000-4000-8000-000000000002';
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token =
    [
      { alg: 'HS256', typ: 'JWT' },
      { sub: currentId, exp: expiry, session_id: currentId },
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
      .join('.') + '.synthetic-signature';
  // CI's isolated GoTrue URL is loopback; local checks use the configured host.
  const project = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1',
  ).hostname.split('.')[0];
  await context.addCookies([
    {
      name: `sb-${project}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: expiry, token_type: 'bearer', user: { id: currentId } })).toString('base64url')}`,
      url: 'http://localhost:3117',
    },
  ]);
  let attempts = 0;
  await page.route('**/auth/v1/**', async (route) => {
    expect(new URL(route.request().url()).pathname).toBe('/auth/v1/logout');
    expect(new URL(route.request().url()).searchParams.get('scope')).toBe(
      'others',
    );
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    attempts += 1;
    await route.fulfill(
      attempts === 1
        ? { status: 500, json: { message: 'Synthetic outage' } }
        : { status: 204 },
    );
  });
  const date = '2026-09-05T10:00:00.000Z';
  await page.route('**/api/auth/sessions', (route) =>
    route.fulfill({
      json: {
        currentSessionId: currentId,
        sessions: [currentId, otherId].map((id) => ({
          token: id,
          createdAt: date,
          updatedAt: date,
          userAgent: 'Mozilla/5.0 Safari/605.1.15',
        })),
      },
    }),
  );
  await page.goto('/settings/privacy');
  const manager = page.locator('.co-session-manager');
  await expect(manager.getByText('2 active')).toBeVisible();
  await expect(manager.getByText('This device')).toBeVisible();
  await expect(
    manager.getByText('Other device', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(token)).toHaveCount(0);
  const revoke = manager.getByRole('button', {
    name: 'Sign out other devices',
  });
  await revoke.click();
  await expect(manager.getByRole('alert')).toBeVisible();
  expect(attempts).toBe(1);
  await expect(manager.getByText('2 active')).toBeVisible();
  await revoke.click();
  await expect(manager.getByText('1 active')).toBeVisible();
  await expect(manager.getByText('Other device', { exact: true })).toHaveCount(
    0,
  );
  expect(attempts).toBe(2);
});

test('does not report revoked devices when the local auth session is missing', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.route('**/api/auth/sessions', (route) =>
    route.fulfill({
      json: {
        currentSessionId: 'current',
        sessions: ['current', 'other'].map((token) => ({
          token,
          createdAt: '2026-09-05T10:00:00.000Z',
          updatedAt: '2026-09-05T10:00:00.000Z',
        })),
      },
    }),
  );
  let authRequests = 0;
  await page.route('**/auth/v1/**', (route) => {
    authRequests += 1;
    return route.abort();
  });
  await page.goto('/settings/privacy');
  const manager = page.locator('.co-session-manager');
  await manager.getByRole('button', { name: 'Sign out other devices' }).click();
  await expect(manager.getByRole('alert')).toBeVisible();
  await expect(manager.getByText('2 active')).toBeVisible();
  expect(authRequests).toBe(0);
});
