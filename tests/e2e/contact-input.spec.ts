import { expect, test } from '@playwright/test';
import { applicationId, mockPersistedWorkspace } from './persisted-workspace';

const contact = {
  contactId: '988c0a00-0000-4000-8000-000000000099',
  applicationId,
  rank: 1,
  name: 'Morgan Lee',
  role: 'Engineering manager',
  profileUrl: 'https://example.test/team/morgan',
  relationship: 'hiring_manager',
  rationale: 'Owns hiring for the platform team.',
  sources: [
    {
      url: 'https://example.test/team/morgan',
      title: 'Team page',
      collectedAt: '2026-09-04T12:00:00.000Z',
      trust: 'authoritative',
      supports: ['identity', 'current_role', 'hiring_scope'],
    },
  ],
  confidence: 'verified',
  connectionNote: 'Privé',
  acceptedMessage: 'Messages',
  status: 'suggested',
  followUpAt: null,
  revision: 1,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
};

test('contact input limits and stored messages stay unchanged across locales', async ({
  page,
}) => {
  await mockPersistedWorkspace(page);
  for (const [resource, payload] of [
    ['contacts', { contacts: [contact] }],
    ['timeline', { events: [] }],
    ['tasks', { tasks: [] }],
  ] as const) {
    await page.route(
      `**/api/applications/${applicationId}/${resource}`,
      (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(payload),
        }),
    );
  }
  await page.goto(`/applications/${applicationId}/timeline`);
  for (const [locale, note, message] of [
    ['FR', 'Note de connexion', 'Message après acceptation'],
    ['EN', 'Connection note', 'Message after acceptance'],
  ] as const) {
    await page.getByRole('button', { name: locale, exact: true }).click();
    const noteInput = page.getByRole('textbox', { name: note, exact: true });
    const messageInput = page.getByRole('textbox', {
      name: message,
      exact: true,
    });
    await expect(noteInput).toHaveAttribute('maxlength', '500');
    await expect(messageInput).toHaveAttribute('maxlength', '2000');
    await expect(noteInput).toHaveValue(contact.connectionNote);
    await expect(messageInput).toHaveValue(contact.acceptedMessage);
  }
});
