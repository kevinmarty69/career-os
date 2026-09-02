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
const ownerEmail = `owner-${suffix}@example.test`;
const inviteeEmail = `invitee-${suffix}@example.test`;

const opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
};

class BrowserSession {
  private readonly cookies = new Map<string, string>();

  async post(path: string, body: unknown, headers = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: path.startsWith('/api/auth/') ? authOrigin : requestOrigin,
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    });
    this.captureCookies(response);
    return response;
  }

  async get(path: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: this.cookieHeader() ? { cookie: this.cookieHeader() } : {},
    });
    this.captureCookies(response);
    return response;
  }

  async put(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        origin: requestOrigin,
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
      },
      body: JSON.stringify(body),
    });
    this.captureCookies(response);
    return response;
  }

  async delete(path: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        origin: requestOrigin,
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
      },
    });
    this.captureCookies(response);
    return response;
  }

  private cookieHeader() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private captureCookies(response: Response) {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const setCookies = headers.getSetCookie?.() ?? [headers.get('set-cookie')];
    for (const setCookie of setCookies) {
      if (!setCookie) continue;
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator < 1) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
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

async function main() {
  const anonymous = new BrowserSession();
  await expectStatus(
    await anonymous.post('/api/publications', { runId: randomUUID() }),
    401,
    'anonymous publication',
  );
  await expectStatus(
    await anonymous.get('/api/profile'),
    401,
    'anonymous profile read',
  );
  await expectStatus(
    await anonymous.put('/api/profile', {
      profile: syntheticProfile,
      expectedRevision: 0,
    }),
    401,
    'anonymous profile write',
  );

  const owner = new BrowserSession();
  await expectStatus(
    await owner.post(
      '/api/auth/sign-up/email',
      {
        name: 'Owner',
        email: ownerEmail,
        password: 'safe-local-password',
      },
      { origin: authOrigin },
    ),
    200,
    'owner sign-up',
  );
  await expectStatus(
    await owner.post('/api/publications', { runId: randomUUID() }),
    401,
    'session without active organization',
  );
  const organizationResponse = await owner.post(
    '/api/auth/organization/create',
    {
      name: 'HTTP Organization',
      slug: `http-organization-${suffix}`,
    },
    { origin: authOrigin },
  );
  await expectStatus(organizationResponse, 200, 'organization creation');
  const organization = (await organizationResponse.json()) as { id: string };

  const emptyProfile = await owner.get('/api/profile');
  await expectStatus(emptyProfile, 200, 'empty profile read');
  assert.deepEqual(await emptyProfile.json(), { profile: null, revision: 0 });
  const savedProfileResponse = await owner.put('/api/profile', {
    profile: syntheticProfile,
    expectedRevision: 0,
  });
  await expectStatus(savedProfileResponse, 200, 'profile creation');
  const savedProfile = (await savedProfileResponse.json()) as {
    profile: typeof syntheticProfile;
    revision: number;
  };
  assert.equal(savedProfile.revision, 1);
  assert.equal(
    savedProfile.profile.claims.length,
    syntheticProfile.claims.length,
  );
  assert.match(savedProfile.profile.claims[0].id, /^[0-9a-f-]{36}$/);
  const rereadProfile = await owner.get('/api/profile');
  await expectStatus(rereadProfile, 200, 'saved profile read');
  assert.deepEqual(await rereadProfile.json(), savedProfile);
  await expectStatus(
    await owner.put('/api/profile', {
      profile: { ...savedProfile.profile, headline: 'Stale write' },
      expectedRevision: 0,
    }),
    409,
    'stale profile write',
  );

  const applicationResponse = await owner.post(
    '/api/applications',
    opportunity,
    {
      'idempotency-key': randomUUID(),
    },
  );
  await expectStatus(applicationResponse, 201, 'application creation');
  const application = (await applicationResponse.json()) as {
    applicationId: string;
    revision: number;
  };
  const runResponse = await owner.post(
    '/api/runs',
    {
      applicationId: application.applicationId,
      applicationRevision: application.revision,
      profileRevision: savedProfile.revision,
    },
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(runResponse, 201, 'persisted run');
  const run = (await runResponse.json()) as { runId: string };
  const publishableBody = { runId: run.runId };

  const publicationResponse = await owner.post(
    '/api/publications',
    publishableBody,
  );
  await expectStatus(publicationResponse, 201, 'authenticated publication');
  const publication = (await publicationResponse.json()) as {
    publicationId: string;
    rawToken: string;
  };
  const retryResponse = await owner.post('/api/publications', publishableBody);
  await expectStatus(retryResponse, 201, 'publication retry');
  const retryPublication = (await retryResponse.json()) as {
    publicationId: string;
    rawToken: string;
  };
  assert.equal(retryPublication.publicationId, publication.publicationId);
  assert.notEqual(retryPublication.rawToken, publication.rawToken);

  const expiredReader = new BrowserSession();
  await expectStatus(
    await expiredReader.post(
      `/api/publications/${publication.publicationId}/exchange`,
      { token: publication.rawToken },
    ),
    404,
    'rotated capability rejected',
  );
  const capabilityReader = new BrowserSession();
  await expectStatus(
    await capabilityReader.post(
      `/api/publications/${retryPublication.publicationId}/exchange`,
      { token: retryPublication.rawToken },
    ),
    204,
    'rotated capability exchange',
  );
  const publishedSnapshot = await capabilityReader.get(
    `/api/publications/${publication.publicationId}`,
  );
  await expectStatus(publishedSnapshot, 200, 'anonymous capability read');
  const publishedPayload = await publishedSnapshot.json();

  const updatedProfile = await owner.put('/api/profile', {
    profile: { ...savedProfile.profile, headline: 'Updated after publication' },
    expectedRevision: savedProfile.revision,
  });
  await expectStatus(updatedProfile, 200, 'profile update after publication');
  const unchangedSnapshot = await capabilityReader.get(
    `/api/publications/${publication.publicationId}`,
  );
  await expectStatus(unchangedSnapshot, 200, 'snapshot after profile update');
  assert.deepEqual(await unchangedSnapshot.json(), publishedPayload);
  const invitee = new BrowserSession();
  await expectStatus(
    await invitee.post(
      '/api/auth/sign-up/email',
      {
        name: 'Invitee',
        email: inviteeEmail,
        password: 'safe-local-password',
      },
      { origin: authOrigin },
    ),
    200,
    'invitee sign-up',
  );
  const invitationResponse = await owner.post(
    '/api/auth/organization/invite-member',
    {
      organizationId: organization.id,
      email: inviteeEmail,
      role: 'member',
    },
  );
  await expectStatus(invitationResponse, 200, 'invitation creation');
  const invitation = (await invitationResponse.json()) as { id: string };
  await expectStatus(
    await invitee.post('/api/auth/organization/accept-invitation', {
      invitationId: invitation.id,
    }),
    403,
    'unverified invitation acceptance',
  );

  const otherTenantResponse = await invitee.post(
    '/api/auth/organization/create',
    { name: 'Other Tenant', slug: `other-tenant-${suffix}` },
    { origin: authOrigin },
  );
  await expectStatus(otherTenantResponse, 200, 'other organization creation');
  const isolatedProfile = await invitee.get('/api/profile');
  await expectStatus(isolatedProfile, 200, 'other tenant profile read');
  assert.deepEqual(await isolatedProfile.json(), {
    profile: null,
    revision: 0,
  });
  await expectStatus(
    await invitee.post('/api/publications', publishableBody),
    400,
    'other tenant publication',
  );
  await expectStatus(
    await invitee.delete(`/api/publications/${publication.publicationId}`),
    403,
    'other tenant revocation',
  );

  const database = new Pool({ connectionString: databaseUrl });
  try {
    await database.query(
      `delete from auth."session" where "userId" = (
       select id from auth."user" where email = $1
     )`,
      [ownerEmail],
    );
    await expectStatus(
      await owner.post('/api/publications', publishableBody),
      401,
      'revoked database session',
    );

    await expectStatus(
      await owner.post(
        '/api/auth/sign-in/email',
        {
          email: ownerEmail,
          password: 'safe-local-password',
        },
        { origin: authOrigin },
      ),
      200,
      'owner sign-in',
    );
    await expectStatus(
      await owner.post(
        '/api/auth/organization/set-active',
        { organizationId: organization.id },
        { origin: authOrigin },
      ),
      200,
      'restore active organization',
    );
    await database.query(
      `update auth."session" set "expiresAt" = now() - interval '1 minute'
     where "userId" = (select id from auth."user" where email = $1)`,
      [ownerEmail],
    );
    await expectStatus(
      await owner.post('/api/publications', publishableBody),
      401,
      'expired database session',
    );
    const persisted = await database.query<{
      publication_count: string;
      share_count: string;
      profile_count: string;
      opportunity_count: string;
      run_count: string;
    }>(
      `select
        (select count(*) from app.publications p join app.page_specs ps on ps.id = p.page_spec_id where ps.workflow_run_id = $1) publication_count,
        (select count(*) from app.share_links sl join app.publications p on p.id = sl.publication_id join app.page_specs ps on ps.id = p.page_spec_id where ps.workflow_run_id = $1) share_count,
        (select count(*) from app.profiles p join app.workflow_runs wr on wr.profile_id = p.id where wr.id = $1) profile_count,
        (select count(*) from app.opportunities o join app.workflow_runs wr on wr.opportunity_id = o.id where wr.id = $1) opportunity_count,
        (select count(*) from app.workflow_runs where id = $1) run_count`,
      [run.runId],
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(persisted.rows[0]).map(([key, value]) => [
          key,
          Number(value),
        ]),
      ),
      {
        publication_count: 1,
        share_count: 2,
        profile_count: 1,
        opportunity_count: 1,
        run_count: 1,
      },
    );
  } finally {
    await database.end();
  }

  await expectStatus(
    await capabilityReader.get(
      `/api/publications/${publication.publicationId}`,
    ),
    200,
    'capability after authenticated session expiry',
  );

  process.stdout.write('auth publication HTTP security ok\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
