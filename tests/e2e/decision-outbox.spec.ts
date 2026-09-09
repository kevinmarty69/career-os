import { expect, test } from '@playwright/test';
import {
  applicationId,
  mockPersistedWorkspace,
  pendingReviewRun,
} from './persisted-workspace';

test('offline arbitration persists and retries with the same identity and idempotency key', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  const scope = {
    userId: '988c0a00-0000-4000-8000-000000000070',
    tenantId: '988c0a00-0000-4000-8000-000000000071',
  };
  const run = {
    ...pendingReviewRun,
    reviews: [
      {
        ...pendingReviewRun.reviews[0],
        reviewer: 'recruiter',
        issues: [{ ...pendingReviewRun.reviews[0].issues[0], blocking: false }],
      },
    ],
  };
  await mockPersistedWorkspace(page, run);
  await page.route('**/api/auth/workspace-session', (route) =>
    route.fulfill({ json: scope }),
  );
  let fail = true;
  const keys: string[] = [];
  await page.route('**/api/runs/*/review-decisions', (route) => {
    expect(route.request().headers()['x-career-user']).toBe(scope.userId);
    expect(route.request().headers()['x-career-workspace']).toBe(
      scope.tenantId,
    );
    keys.push(route.request().headers()['idempotency-key']);
    return fail
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: {
            ...route.request().postDataJSON(),
            runId: run.runId,
            decisionId: '988c0a00-0000-4000-8000-000000000072',
            publicationEligible: false,
          },
        });
  });
  const ready = page.waitForResponse('**/api/auth/workspace-session');
  await page.goto(`/applications/${applicationId}/review`);
  await ready;
  await expect(
    page.getByRole('button', { name: 'Keep as written', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole('button', { name: 'Keep as written', exact: true })
    .click();
  await expect(
    page.getByText('Decision saved locally', { exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => keys.length).toBeGreaterThan(0);
  await page.reload();
  await expect(
    page.getByText('Decision saved locally', { exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await expect(
    page.getByText('Decision saved locally', { exact: true }),
  ).toHaveCount(0);
  expect(new Set(keys).size).toBe(1);
});
