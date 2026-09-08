import { expect, test, type Page } from '@playwright/test';
import { applicationId, mockPersistedWorkspace } from './persisted-workspace';
import type { ApplicationContact } from '../../lib/application-contact';

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

const draft = {
  rank: 1,
  name: 'Jamie Sample',
  role: 'CTO',
  profileUrl: 'https://example.test/team/jamie',
  relationship: 'founder_or_technical_leader',
  rationale:
    'Public technical leader; involvement in this vacancy remains unconfirmed.',
  confidence: 'uncertain',
  connectionNote: 'Hello Jamie, are you the right person to contact?',
  acceptedMessage: 'Thank you for connecting.',
  sources: [
    {
      url: 'https://example.test/team',
      title: 'Example team',
      collectedAt: '2026-09-08T12:00:00.000Z',
      trust: 'weak',
      supports: ['identity', 'current_role'],
      excerpt: 'Jamie Sample is CTO at Example.',
    },
  ],
};
const completed = {
  researchId: '988c0a00-0000-4000-8000-000000000098',
  status: 'completed',
  sourcesRead: 2,
  drafts: [draft],
};

async function mockContacts(page: Page, initial: ApplicationContact[] = []) {
  await mockPersistedWorkspace(page);
  let contacts = initial;
  const writes: string[] = [];
  await page.route(
    `**/api/applications/${applicationId}/contacts`,
    async (route) => {
      if (route.request().method() === 'POST') {
        writes.push(route.request().url());
        const contact = {
          ...route.request().postDataJSON(),
          contactId: '988c0a00-0000-4000-8000-000000000099',
          applicationId,
          status: 'suggested',
          revision: 1,
          followUpAt: null,
          createdAt: '2026-09-08T12:00:00.000Z',
          updatedAt: '2026-09-08T12:00:00.000Z',
        };
        contacts = [...contacts, contact];
        return route.fulfill({ json: contact, status: 201 });
      }
      return route.fulfill({ json: { contacts } });
    },
  );
  await page.route(`**/api/applications/${applicationId}/timeline`, (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route(`**/api/applications/${applicationId}/tasks`, (route) =>
    route.fulfill({ json: { tasks: [] } }),
  );
  return writes;
}

test('public research stays pending then exposes quotes and requires explicit acceptance before contact creation', async ({
  page,
}) => {
  const writes = await mockContacts(page);
  let persisted: typeof completed | null = null;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/applications/${applicationId}/contacts/research`,
    async (route) => {
      if (route.request().method() === 'POST') {
        await wait;
        persisted = completed;
      }
      return route.fulfill({ json: { research: persisted } });
    },
  );
  await page.goto(`/applications/${applicationId}/timeline?contacts=1`);
  await page
    .getByRole('button', { name: 'Research public sources', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Researching…', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Stop waiting', exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  release();
  await expect(
    page.getByText('Jamie Sample is CTO at Example.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Example team', exact: true }),
  ).toHaveAttribute('href', 'https://example.test/team');
  expect(writes).toEqual([]);
  await page.reload();
  await expect(
    page.getByText('Jamie Sample is CTO at Example.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'I reviewed the source — add contact',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Connection note', exact: true }),
  ).toHaveValue(draft.connectionNote);
  await expect(
    page.getByRole('button', {
      name: 'I reviewed the source — add contact',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(writes).toHaveLength(1);
  // The only mutation creates an internal suggestion; no messaging integration is called.
  expect(writes[0]).toMatch(/\/contacts$/);
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Connection note', exact: true }),
  ).toHaveValue(draft.connectionNote);
});

test('research failures are actionable and never create a contact', async ({
  page,
}) => {
  const writes = await mockContacts(page);
  await page.route(
    `**/api/applications/${applicationId}/contacts/research`,
    (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 429, body: 'Daily limit' })
        : route.fulfill({
            json: {
              research: {
                ...completed,
                status: 'outcome_unknown',
                drafts: [],
                sourcesRead: 0,
              },
            },
          }),
  );
  await page.goto(`/applications/${applicationId}/timeline?contacts=1`);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'will not automatically retry' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Research public sources', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Public contact research' })
      .getByRole('alert'),
  ).toHaveText('Daily limit reached: three searches per workspace.');
  expect(writes).toEqual([]);
});

test('three accepted contacts cap further research and acceptance', async ({
  page,
}) => {
  const contacts = [1, 2, 3].map((rank) => ({
    ...draft,
    rank,
    profileUrl: `${draft.profileUrl}${rank}`,
    contactId: `988c0a00-0000-4000-8000-00000000000${rank}`,
    applicationId,
    status: 'suggested',
    revision: 1,
    followUpAt: null,
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
  })) as ApplicationContact[];
  const writes = await mockContacts(page, contacts);
  await page.route(
    `**/api/applications/${applicationId}/contacts/research`,
    (route) => route.fulfill({ json: { research: completed } }),
  );
  await page.goto(`/applications/${applicationId}/timeline?contacts=1`);
  await expect(
    page.getByRole('button', { name: 'Research public sources', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'I reviewed the source — add contact',
      exact: true,
    }),
  ).toBeDisabled();
  expect(writes).toEqual([]);
});
