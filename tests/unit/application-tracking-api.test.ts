import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readUpcomingTasks,
  saveApplicationTracking,
} from '../../lib/career-api';
import {
  applicationSchema,
  updateApplicationInputSchema,
} from '../../lib/application-contract';

test('tracking adapter sends only versioned application fields and preserves branding/sources', async (t) => {
  const application = applicationSchema.parse({
    applicationId: '988c0a00-0000-4000-8000-000000000041',
    company: 'Example',
    role: 'Engineer',
    description: 'Build reliable products.',
    stage: 'applied',
    accent: '#21504b',
    logoUrl: 'https://example.test/logo.png',
    companySources: [{ url: 'https://example.test/about', origin: 'api' }],
    revision: 3,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  });
  const mock = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('Conflict', { status: 409 }),
  );
  const response = await saveApplicationTracking(
    application,
    'interview',
    '2026-09-02',
  );
  assert.equal(response.status, 409); // Errors remain visible to the caller, never treated as saved.
  const [url, request] = mock.mock.calls[0].arguments as unknown as [
    string,
    RequestInit,
  ];
  assert.equal(url, `/api/applications/${application.applicationId}`);
  assert.equal(request.method, 'PATCH');
  const body = updateApplicationInputSchema.parse(
    JSON.parse(String(request.body)),
  );
  assert.equal(body.expectedRevision, 3);
  assert.equal(body.submittedOn, '2026-09-02');
  assert.equal(body.stage, 'interview');
  assert.equal(body.logoUrl, application.logoUrl);
  assert.deepEqual(body.companySources, application.companySources);
  const controller = new AbortController();
  await readUpcomingTasks(controller.signal);
  const [tasksUrl, options] = mock.mock.calls[1].arguments as unknown as [
    string,
    RequestInit,
  ];
  assert.equal(tasksUrl, '/api/tasks');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.signal, controller.signal);
});
