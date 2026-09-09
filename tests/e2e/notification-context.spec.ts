import { expect, test } from '@playwright/test';
import {
  applicationId,
  mockPersistedWorkspace,
  pendingReviewRun,
} from './persisted-workspace';

test('notification history paginates and preserves loaded events on failure', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  await page.route('**/api/notifications', (route) =>
    route.fulfill({ json: { conflict: null, tasks: [], moreTasks: false } }),
  );
  const cursor = { at: '2026-01-01T00:00:00.123456Z', kind: 'run', id: '2' };
  let fail = true;
  let receivedCursor: unknown;
  await page.route('**/api/notifications/history**', (route) => {
    const raw = new URL(route.request().url()).searchParams.get('cursor');
    receivedCursor = raw ? JSON.parse(raw) : undefined;
    if (raw && fail) return route.fulfill({ status: 503 });
    return route.fulfill({
      json: {
        events: [
          {
            id: raw ? 'run:1' : 'run:2',
            kind: 'run',
            at: cursor.at,
            company: 'Synthetic history',
            applicationId,
            summary: raw ? 'Earlier saved decision' : 'Latest saved decision',
          },
        ],
        nextCursor: raw ? null : cursor,
      },
    });
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Notifications', exact: true })
    .click();
  const drawer = page.getByRole('dialog', { name: 'Notifications' });
  await drawer.getByRole('button', { name: 'Show history' }).click();
  await expect(drawer.getByText('Latest saved decision')).toBeVisible();
  await drawer.getByRole('button', { name: 'Load older events' }).click();
  await expect(
    drawer.getByText('Could not load history.', { exact: false }),
  ).toBeVisible();
  await expect(drawer.getByText('Latest saved decision')).toBeVisible();
  expect(receivedCursor).toEqual(cursor);
  fail = false;
  await drawer.getByRole('button', { name: 'Retry history' }).click();
  await expect(drawer.getByText('Earlier saved decision')).toBeVisible();
  await expect(drawer.getByText('Latest saved decision')).toBeVisible();
  await expect(
    drawer.getByRole('button', { name: 'Load older events' }),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole('link', { name: /Earlier saved decision/ }),
  ).toHaveAttribute('href', `/applications/${applicationId}/versions`);
});

test('notifications expose sourced conflicts, due reminders, expiry and completed runs with recovery', async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  await page.route(`**/api/applications/${applicationId}/run`, (route) =>
    route.fulfill({
      json: {
        ...pendingReviewRun,
        status: 'completed',
        reviews: [],
        reviewDecisions: [],
      },
    }),
  );
  let failing = true;
  await page.route('**/api/notifications', (route) =>
    failing
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: {
            conflict: { id: 'conflict:synthetic', count: 1 },
            moreTasks: false,
            tasks: [
              {
                id: '988c0a00-0000-4000-8000-000000000002',
                applicationId,
                company: 'Synthetic reminder company',
                title: 'Review the reply draft',
                kind: 'follow_up',
                dueAt: '2020-01-01T00:00:00.000Z',
              },
            ],
          },
        }),
  );
  await page.route('**/api/publications', (route) =>
    route.fulfill({
      json: {
        publications: [
          {
            publicationId: '988c0a00-0000-4000-8000-000000000003',
            applicationId,
            company: 'Synthetic expiry company',
            role: 'Engineer',
            publishedAt: new Date().toISOString(),
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            status: 'active',
            version: 1,
            isCurrent: true,
            firstOpenedAt: null,
            lastOpenedAt: null,
            opens: 0,
            sections: 0,
            actions: 0,
            downloads: 0,
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Notifications', exact: true })
    .click();
  const drawer = page.getByRole('dialog', { name: 'Notifications' });
  await expect(
    drawer.getByText('Conflicts and reminders unavailable.', { exact: false }),
  ).toBeVisible();
  await expect(drawer.getByText('Signal Forge · Run completed')).toBeVisible();
  failing = false;
  await drawer.getByRole('button', { name: 'Retry reminders' }).click();
  await expect(drawer.getByText('1 source conflict(s)')).toBeVisible();
  await expect(
    drawer.getByRole('link', { name: 'View sources' }),
  ).toHaveAttribute('href', '/memory/conflicts');
  await expect(
    drawer.getByRole('link', { name: /Synthetic reminder company/ }),
  ).toHaveAttribute('href', `/applications/${applicationId}/timeline`);
  await expect(
    drawer.getByRole('link', { name: /Synthetic expiry company/ }),
  ).toHaveAttribute('href', '/links');
  await expect(
    drawer.getByText('Conflicts and reminders unavailable.', { exact: false }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('notifications-context-en.png'),
    animations: 'disabled',
  });
  await drawer
    .getByRole('link', { name: /Synthetic reminder company/ })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/applications/${applicationId}/timeline$`),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
