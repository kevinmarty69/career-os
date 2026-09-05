import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { syntheticProfile } from '../../lib/fixture';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3019';
const authOrigin = process.env.TEST_AUTH_ORIGIN ?? baseUrl;
const requestOrigin = process.env.TEST_REQUEST_ORIGIN ?? baseUrl;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const suffix = randomUUID();

const applicationInput = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  companySources: [
    { url: 'https://northstar.example/about', origin: 'job-jsonld' },
  ],
  accent: '#21504b',
  stage: 'draft',
};
const livingProfile = {
  ...syntheticProfile,
  claims: syntheticProfile.claims.map((claim) => ({
    ...claim,
    level: 'declared' as const,
  })),
};

class BrowserSession {
  private readonly cookies = new Map<string, string>();

  async request(path: string, method = 'GET', body?: unknown, headers = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'GET' ? {} : { origin: requestOrigin }),
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseHeaders = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    for (const setCookie of responseHeaders.getSetCookie?.() ?? [
      response.headers.get('set-cookie'),
    ]) {
      if (!setCookie) continue;
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator > 0)
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }

  private cookieHeader() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

async function expectStatus(
  response: Response,
  expected: number,
  context: string,
) {
  if (response.status !== expected)
    assert.fail(
      `${context}: expected ${expected}, received ${response.status}: ${await response.text()}`,
    );
}

async function createWorkspace(label: string) {
  const browser = new BrowserSession();
  await expectStatus(
    await browser.request(
      '/api/auth/sign-up/email',
      'POST',
      {
        name: label,
        email: `${label.toLowerCase()}-${suffix}@example.test`,
        password: 'safe-local-password',
      },
      { origin: authOrigin },
    ),
    200,
    `${label} sign-up`,
  );
  const organization = await browser.request(
    '/api/auth/organization/create',
    'POST',
    { name: label, slug: `${label.toLowerCase()}-${suffix}` },
    { origin: authOrigin },
  );
  await expectStatus(organization, 200, `${label} organization`);
  return browser;
}

async function main() {
  const anonymous = new BrowserSession();
  await expectStatus(
    await anonymous.request('/api/applications'),
    401,
    'anonymous application list',
  );
  await expectStatus(
    await anonymous.request('/api/insights'),
    401,
    'anonymous application insights',
  );

  const owner = await createWorkspace('ApplicationOwner');
  const key = randomUUID();
  const create = await owner.request(
    '/api/applications',
    'POST',
    applicationInput,
    { 'idempotency-key': key },
  );
  await expectStatus(create, 201, 'application create');
  const application = (await create.json()) as {
    applicationId: string;
    revision: number;
    company: string;
    companySources: typeof applicationInput.companySources;
  };
  assert.equal(application.revision, 1);
  assert.deepEqual(application.companySources, applicationInput.companySources);

  const replay = await owner.request(
    '/api/applications',
    'POST',
    applicationInput,
    { 'idempotency-key': key },
  );
  await expectStatus(replay, 200, 'application create replay');
  assert.deepEqual(await replay.json(), application);
  await expectStatus(
    await owner.request(
      '/api/applications',
      'POST',
      { ...applicationInput, company: 'Different Company' },
      { 'idempotency-key': key },
    ),
    409,
    'application idempotency mismatch',
  );

  const second = await owner.request(
    '/api/applications',
    'POST',
    { ...applicationInput, company: 'Second Company' },
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(second, 201, 'second application create');
  const list = await owner.request('/api/applications');
  await expectStatus(list, 200, 'application list');
  assert.equal(
    ((await list.json()) as { applications: unknown[] }).applications.length,
    2,
  );

  await expectStatus(
    await owner.request(
      `/api/applications/${application.applicationId}`,
      'PATCH',
      { ...applicationInput, company: 'Stale', expectedRevision: 2 },
    ),
    409,
    'stale application update',
  );
  const update = await owner.request(
    `/api/applications/${application.applicationId}`,
    'PATCH',
    { ...applicationInput, company: 'Updated Company', expectedRevision: 1 },
  );
  await expectStatus(update, 200, 'application update');
  const updated = (await update.json()) as {
    applicationId: string;
    revision: number;
  };
  assert.equal(updated.revision, 2);
  const updateReplay = await owner.request(
    `/api/applications/${application.applicationId}`,
    'PATCH',
    { ...applicationInput, company: 'Updated Company', expectedRevision: 1 },
  );
  await expectStatus(updateReplay, 200, 'application update replay');
  assert.deepEqual(await updateReplay.json(), updated);
  const unchanged = await owner.request(
    `/api/applications/${application.applicationId}`,
    'PATCH',
    {
      ...applicationInput,
      company: 'Updated Company',
      expectedRevision: 2,
    },
  );
  await expectStatus(unchanged, 200, 'unchanged application update');
  assert.equal(((await unchanged.json()) as { revision: number }).revision, 2);

  await expectStatus(
    await anonymous.request(
      `/api/applications/${application.applicationId}/timeline`,
    ),
    401,
    'anonymous application timeline',
  );
  const timelineEvent = {
    kind: 'interview',
    title: 'Technical interview',
    note: 'Discussed product ownership and reliability.',
    occurredAt: '2026-09-04T14:30:00.000Z',
  };
  const timelineCreate = await owner.request(
    `/api/applications/${application.applicationId}/timeline`,
    'POST',
    timelineEvent,
  );
  await expectStatus(timelineCreate, 201, 'application timeline create');
  const createdTimelineEvent = (await timelineCreate.json()) as {
    applicationId: string;
    kind: string;
    title: string;
  };
  assert.equal(createdTimelineEvent.applicationId, application.applicationId);
  assert.equal(createdTimelineEvent.kind, timelineEvent.kind);
  assert.equal(createdTimelineEvent.title, timelineEvent.title);
  const timeline = await owner.request(
    `/api/applications/${application.applicationId}/timeline`,
  );
  await expectStatus(timeline, 200, 'application timeline list');
  assert.equal(
    ((await timeline.json()) as { events: unknown[] }).events.length,
    1,
  );
  const insights = await owner.request('/api/insights');
  await expectStatus(insights, 200, 'application insights');
  const insightSummary = (await insights.json()) as {
    totalApplications: number;
    interviews: number;
    weekly: unknown[];
  };
  assert.equal(insightSummary.totalApplications, 2);
  assert.equal(insightSummary.interviews, 1);
  assert.equal(insightSummary.weekly.length, 8);

  const taskInput = {
    kind: 'follow_up',
    title: 'Follow up after the technical interview',
    dueAt: '2026-09-08T08:00:00.000Z',
  };
  const taskCreate = await owner.request(
    `/api/applications/${application.applicationId}/tasks`,
    'POST',
    taskInput,
  );
  await expectStatus(taskCreate, 201, 'application task create');
  const task = (await taskCreate.json()) as {
    taskId: string;
    revision: number;
    completedAt: string | null;
  };
  assert.equal(task.revision, 1);
  assert.equal(task.completedAt, null);
  const taskComplete = await owner.request(
    `/api/applications/${application.applicationId}/tasks/${task.taskId}`,
    'PATCH',
    { completed: true, expectedRevision: 1 },
  );
  await expectStatus(taskComplete, 200, 'application task completion');
  const completedTask = (await taskComplete.json()) as {
    revision: number;
    completedAt: string | null;
  };
  assert.equal(completedTask.revision, 2);
  assert.ok(completedTask.completedAt);
  const taskReplay = await owner.request(
    `/api/applications/${application.applicationId}/tasks/${task.taskId}`,
    'PATCH',
    { completed: true, expectedRevision: 1 },
  );
  await expectStatus(taskReplay, 200, 'application task completion replay');
  assert.deepEqual(await taskReplay.json(), completedTask);
  const tasks = await owner.request(
    `/api/applications/${application.applicationId}/tasks`,
  );
  await expectStatus(tasks, 200, 'application task list');
  assert.equal(((await tasks.json()) as { tasks: unknown[] }).tasks.length, 1);

  await expectStatus(
    await anonymous.request(
      `/api/applications/${application.applicationId}/contacts`,
    ),
    401,
    'anonymous application contacts',
  );
  const contactSource = {
    url: 'https://northstar.example/team',
    title: 'Northstar leadership team',
    collectedAt: '2026-09-05T08:00:00.000Z',
    trust: 'authoritative',
    supports: ['identity', 'current_role', 'hiring_scope'],
  };
  const contactInput = {
    rank: 1,
    name: 'Morgan Lee',
    role: 'VP Engineering',
    profileUrl: 'https://www.linkedin.com/in/morgan-lee',
    relationship: 'hiring_manager',
    rationale: 'Owns the team hiring for this role.',
    sources: [contactSource],
    confidence: 'verified',
    connectionNote: 'Hello Morgan, I am applying to the product role.',
    acceptedMessage: 'Thanks for connecting. Here is why I applied.',
  };
  const contactCreate = await owner.request(
    `/api/applications/${application.applicationId}/contacts`,
    'POST',
    contactInput,
  );
  await expectStatus(contactCreate, 201, 'application contact create');
  const contact = (await contactCreate.json()) as {
    contactId: string;
    revision: number;
    status: string;
  };
  assert.equal(contact.revision, 1);
  assert.equal(contact.status, 'suggested');
  await expectStatus(
    await owner.request(
      `/api/applications/${application.applicationId}/contacts`,
      'POST',
      {
        ...contactInput,
        rank: 2,
        name: 'Weak match',
        profileUrl: 'https://www.linkedin.com/in/weak-match',
        sources: [{ ...contactSource, trust: 'weak' }],
        confidence: 'uncertain',
      },
    ),
    400,
    'weak hiring manager rejected',
  );
  await expectStatus(
    await owner.request(
      `/api/applications/${application.applicationId}/contacts`,
      'POST',
      { ...contactInput, name: 'Duplicate rank' },
    ),
    409,
    'duplicate contact rank rejected',
  );
  const contactUpdate = await owner.request(
    `/api/applications/${application.applicationId}/contacts/${contact.contactId}`,
    'PATCH',
    {
      connectionNote: contactInput.connectionNote,
      acceptedMessage: contactInput.acceptedMessage,
      followUpMessage: 'Following up manually next week.',
      status: 'follow_up',
      followUpAt: '2026-09-12T08:00:00.000Z',
      expectedRevision: 1,
    },
  );
  await expectStatus(contactUpdate, 200, 'application contact update');
  const updatedContact = (await contactUpdate.json()) as {
    revision: number;
    status: string;
  };
  assert.equal(updatedContact.revision, 2);
  assert.equal(updatedContact.status, 'follow_up');
  const contacts = await owner.request(
    `/api/applications/${application.applicationId}/contacts`,
  );
  await expectStatus(contacts, 200, 'application contact list');
  assert.equal(
    ((await contacts.json()) as { contacts: unknown[] }).contacts.length,
    1,
  );

  const saved = await owner.request('/api/profile', 'PUT', {
    profile: livingProfile,
    expectedRevision: 0,
  });
  await expectStatus(saved, 200, 'profile creation');
  const profile = (await saved.json()) as { revision: number };
  await expectStatus(
    await owner.request(`/api/applications/${updated.applicationId}/run`),
    204,
    'application without run',
  );
  const heartbeatPool = new Pool({ connectionString: databaseUrl });
  try {
    await heartbeatPool.query('begin');
    await heartbeatPool.query('set local role career_company_researcher');
    await heartbeatPool.query(
      "select app.record_worker_heartbeat('company-researcher')",
    );
    await heartbeatPool.query('commit');
  } finally {
    await heartbeatPool.end();
  }
  const run = await owner.request(
    '/api/runs',
    'POST',
    {
      applicationId: updated.applicationId,
      applicationRevision: updated.revision,
      profileRevision: profile.revision,
    },
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(run, 202, 'run from application');
  const persistedRun = (await run.json()) as { runId: string };
  const latestRun = await owner.request(
    `/api/applications/${updated.applicationId}/run`,
  );
  await expectStatus(latestRun, 200, 'latest application run');
  assert.equal(
    ((await latestRun.json()) as { runId: string }).runId,
    persistedRun.runId,
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const snapshot = await pool.query<{
      company: string;
      application_revision: string;
      company_sources: typeof applicationInput.companySources;
      research_sources: typeof applicationInput.companySources;
    }>(
      `select o.company, o.application_revision, o.company_sources,
         step.input -> 'companySources' as research_sources
       from app.opportunities o join app.workflow_runs wr
         on wr.opportunity_id = o.id
       join app.workflow_steps step on step.workflow_run_id = wr.id
         and step.stage = 'company-researcher'
       where wr.id = $1`,
      [persistedRun.runId],
    );
    assert.deepEqual(snapshot.rows[0], {
      company: 'Updated Company',
      application_revision: '2',
      company_sources: applicationInput.companySources,
      research_sources: applicationInput.companySources,
    });
  } finally {
    await pool.end();
  }

  const postRunUpdate = await owner.request(
    `/api/applications/${application.applicationId}`,
    'PATCH',
    {
      ...applicationInput,
      company: 'Current Application Company',
      expectedRevision: 2,
    },
  );
  await expectStatus(postRunUpdate, 200, 'application update after run');
  assert.equal(
    ((await postRunUpdate.json()) as { revision: number }).revision,
    3,
  );
  const snapshotPool = new Pool({ connectionString: databaseUrl });
  try {
    const snapshot = await snapshotPool.query<{
      company: string;
      application_revision: string;
    }>(
      `select o.company, o.application_revision
       from app.opportunities o join app.workflow_runs wr
         on wr.opportunity_id = o.id
       where wr.id = $1`,
      [persistedRun.runId],
    );
    assert.deepEqual(snapshot.rows[0], {
      company: 'Updated Company',
      application_revision: '2',
    });
  } finally {
    await snapshotPool.end();
  }

  const other = await createWorkspace('ApplicationOther');
  await expectStatus(
    await other.request(`/api/applications/${application.applicationId}`),
    404,
    'cross-tenant application read',
  );
  await expectStatus(
    await other.request(`/api/applications/${application.applicationId}/run`),
    204,
    'cross-tenant application run',
  );
  await expectStatus(
    await other.request(
      `/api/applications/${application.applicationId}/timeline`,
    ),
    404,
    'cross-tenant application timeline',
  );
  await expectStatus(
    await other.request(`/api/applications/${application.applicationId}/tasks`),
    404,
    'cross-tenant application tasks',
  );
  await expectStatus(
    await other.request(
      `/api/applications/${application.applicationId}/contacts`,
    ),
    404,
    'cross-tenant application contacts',
  );

  await expectStatus(
    await owner.request(
      `/api/applications/${application.applicationId}`,
      'DELETE',
      { expectedRevision: 3 },
    ),
    204,
    'application delete',
  );
  await expectStatus(
    await owner.request(
      `/api/applications/${application.applicationId}`,
      'DELETE',
      { expectedRevision: 3 },
    ),
    204,
    'application delete replay',
  );
  await expectStatus(
    await owner.request(
      '/api/runs',
      'POST',
      {
        applicationId: application.applicationId,
        applicationRevision: 3,
        profileRevision: profile.revision,
      },
      { 'idempotency-key': randomUUID() },
    ),
    400,
    'run after application deletion',
  );
}

main().then(
  () => console.log('applications integration ok'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
