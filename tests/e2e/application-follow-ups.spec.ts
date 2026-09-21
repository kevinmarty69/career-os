import { expect, test } from '@playwright/test';
import {
  applicationId,
  mockPersistedWorkspace,
  pendingReviewRun,
} from './persisted-workspace';
import { summarizeApplicationInsights } from '../../lib/application-insights';
import { applicationTaskSchema } from '../../lib/application-task';
import {
  applicationSchema,
  updateApplicationInputSchema,
  type Application,
} from '../../lib/application-contract';

const now = '2026-09-21T12:00:00.000Z';
const olderId = '988c0a00-0000-4000-8000-000000000099';
const application: Application = {
  applicationId: olderId,
  company: 'Older Company',
  role: 'Product Engineer',
  description: 'Build reliable products.',
  stage: 'applied',
  accent: '#5847e8',
  revision: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: now,
};
const task = {
  taskId: '988c0a00-0000-4000-8000-000000000098',
  applicationId: olderId,
  company: application.company,
  role: application.role,
  kind: 'follow_up',
  title: 'Ask Morgan about the interview',
  dueAt: '2026-09-20T10:00:00.000Z',
  completedAt: null as string | null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

for (const locale of ['en', 'fr']) {
  test(`older follow-up is visible on Home, opens tasks, and completion survives reload (${locale})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'career-os-locale',
        value: locale,
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.clock.setFixedTime(new Date(now));
    await mockPersistedWorkspace(page);
    let current = { ...task };
    // The older application is outside the old eight-item window.
    const applications = Array.from({ length: 9 }, (_, index) => ({
      ...application,
      applicationId:
        index === 8
          ? olderId
          : applicationId.replace(/041$/, String(50 + index).padStart(3, '0')),
      company: index === 8 ? application.company : `Recent ${index}`,
      stage: 'draft',
    }));
    await page.route('**/api/applications', (route) =>
      route.fulfill({ json: { applications } }),
    );
    await page.route('**/api/applications/*/run', (route) =>
      route.request().url().includes(olderId)
        ? route.fulfill({ json: pendingReviewRun })
        : route.fulfill({ status: 204 }),
    );
    await page.route('**/api/tasks', (route) =>
      route.fulfill({
        json: { tasks: current.completedAt ? [] : [current], hasMore: false },
      }),
    );
    await page.route(`**/api/applications/${olderId}`, (route) =>
      route.fulfill({ json: application }),
    );
    await page.route(`**/api/applications/${olderId}/timeline`, (route) =>
      route.fulfill({ json: { events: [] } }),
    );
    await page.route(`**/api/applications/${olderId}/contacts`, (route) =>
      route.fulfill({ json: { contacts: [] } }),
    );
    await page.route(`**/api/applications/${olderId}/tasks`, (route) =>
      route.fulfill({
        json: { tasks: [applicationTaskSchema.strip().parse(current)] },
      }),
    );
    await page.route(
      `**/api/applications/${olderId}/tasks/${task.taskId}`,
      (route) => {
        expect(route.request().postDataJSON()).toEqual({
          completed: true,
          expectedRevision: 1,
        });
        current = { ...current, completedAt: now, revision: 2 };
        return route.fulfill({
          json: applicationTaskSchema.strip().parse(current),
        });
      },
    );
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: task.title,
      }),
    ).toBeVisible();
    await expect(page.locator('.co-home-calendar')).toContainText(
      locale === 'en'
        ? '1 unresolved human decision.'
        : '1 décision humaine non résolue.',
    );
    await expect(page.locator('.co-home-signal a').first()).toHaveAttribute(
      'href',
      `/applications/${olderId}/timeline#tasks`,
    );
    const followUp = page
      .locator('.co-home-calendar a')
      .filter({ hasText: task.title });
    await expect(followUp).toContainText(
      locale === 'en' ? 'Overdue' : 'En retard',
    );
    await followUp.click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${olderId}/timeline#tasks$`),
    );
    await page
      .getByRole('button', {
        name: `${locale === 'en' ? 'Complete:' : 'Terminer :'} ${task.title}`,
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: `${locale === 'en' ? 'Reopen:' : 'Rouvrir :'} ${task.title}`,
      }),
    ).toBeVisible();
    await page.goto('/');
    await expect(page.locator('.co-home-calendar')).not.toContainText(
      task.title,
    );
  });

  test(`submission date saves, reloads and drives age cohorts without inventing a response (${locale})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'career-os-locale',
        value: locale,
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.clock.setFixedTime(new Date(now));
    await mockPersistedWorkspace(page);
    let stored = { ...application };
    await page.route(`**/api/applications/${olderId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const { expectedRevision, ...input } =
          updateApplicationInputSchema.parse(route.request().postDataJSON());
        expect(expectedRevision).toBe(stored.revision);
        stored = applicationSchema.parse({
          ...stored,
          ...input,
          revision: stored.revision + 1,
        });
      }
      await route.fulfill({ json: stored });
    });
    await page.route(`**/api/applications/${olderId}/timeline`, (route) =>
      route.fulfill({ json: { events: [] } }),
    );
    await page.route(`**/api/applications/${olderId}/contacts`, (route) =>
      route.fulfill({ json: { contacts: [] } }),
    );
    await page.route(`**/api/applications/${olderId}/tasks`, (route) =>
      route.fulfill({ json: { tasks: [] } }),
    );
    await page.route('**/api/insights', (route) =>
      route.fulfill({
        json: summarizeApplicationInsights([stored], [], new Date(now)),
      }),
    );
    await page.goto(`/applications/${olderId}/timeline`);
    const date = page.getByLabel(
      locale === 'en' ? 'Submission date' : 'Date d’envoi',
    );
    await expect(date).toHaveValue('');
    await date.fill('2026-09-10');
    await page
      .getByRole('combobox', {
        name: locale === 'en' ? 'Stage' : 'Étape',
        exact: true,
      })
      .selectOption('interview');
    await page
      .getByRole('button', {
        name: locale === 'en' ? 'Save tracking' : 'Enregistrer le suivi',
      })
      .click();
    await expect(page.getByRole('status')).toContainText(
      locale === 'en' ? 'Tracking saved.' : 'Suivi enregistré.',
    );
    await page.reload();
    await expect(date).toHaveValue('2026-09-10');
    await expect(
      page.getByRole('combobox', {
        name: locale === 'en' ? 'Stage' : 'Étape',
        exact: true,
      }),
    ).toHaveValue('interview');
    await page.goto('/insights');
    const cohort = page
      .locator('.co-cohorts > div')
      .filter({ has: page.locator('dt', { hasText: '7-13' }) });
    await expect(cohort).toContainText('0/1');
    await expect(cohort).toContainText(
      locale === 'en'
        ? '1 without a recorded response'
        : '1 sans réponse enregistrée',
    );
    expect(stored.stage).toBe('interview');
    await page.goto(`/applications/${olderId}/timeline`);
    await date.fill('');
    await page
      .getByRole('button', {
        name: locale === 'en' ? 'Save tracking' : 'Enregistrer le suivi',
      })
      .click();
    await expect(page.getByRole('status')).toContainText(
      locale === 'en' ? 'Tracking saved.' : 'Suivi enregistré.',
    );
    await page.goto('/insights');
    await expect(
      page.locator('.co-cohorts > div').filter({
        has: page.locator('dt', {
          hasText: locale === 'en' ? 'Unknown date' : 'Date inconnue',
        }),
      }),
    ).toContainText('0/1');
  });
}

test('task API failure is not presented as no tasks, and tracking save failure preserves input', async ({
  page,
}) => {
  await mockPersistedWorkspace(page);
  await page.route('**/api/tasks', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await expect(page.locator('.co-home-calendar [role="alert"]')).toBeVisible();
  await page.route(`**/api/applications/${applicationId}/timeline`, (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.goto(`/applications/${applicationId}/timeline`);
  const input = page.locator('input[name="submittedOn"]');
  await input.fill('2026-09-10');
  await page.route(`**/api/applications/${applicationId}`, (route) =>
    route.fulfill({ status: 409 }),
  );
  const form = page.getByRole('region', {
    name: /Application tracking|Suivi de candidature/,
  });
  await form.getByRole('button').click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('2026-09-10');
});
