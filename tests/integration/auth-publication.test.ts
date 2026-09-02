import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { syntheticProfile } from '../../lib/fixture';
import { buildPageSpec, buildStrategy } from '../../lib/workflow';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3019';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
};
const publicationBody = {
  profile: syntheticProfile,
  opportunity,
  spec: buildPageSpec(
    syntheticProfile,
    opportunity,
    buildStrategy(syntheticProfile, opportunity),
  ),
  approved: true,
};

class BrowserSession {
  private readonly cookies = new Map<string, string>();

  async post(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
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

  async delete(path: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        origin: baseUrl,
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
    await anonymous.post('/api/publications', publicationBody),
    401,
    'anonymous publication',
  );

  const owner = new BrowserSession();
  await expectStatus(
    await owner.post('/api/auth/sign-up/email', {
      name: 'Owner',
      email: 'owner-http@example.test',
      password: 'safe-local-password',
    }),
    200,
    'owner sign-up',
  );
  await expectStatus(
    await owner.post('/api/publications', publicationBody),
    401,
    'session without active organization',
  );
  const organizationResponse = await owner.post(
    '/api/auth/organization/create',
    {
      name: 'HTTP Organization',
      slug: 'http-organization',
    },
  );
  await expectStatus(organizationResponse, 200, 'organization creation');
  const organization = (await organizationResponse.json()) as { id: string };

  const publicationResponse = await owner.post(
    '/api/publications',
    publicationBody,
  );
  await expectStatus(publicationResponse, 201, 'authenticated publication');
  const publication = (await publicationResponse.json()) as {
    publicationId: string;
    rawToken: string;
  };

  const capabilityReader = new BrowserSession();
  await expectStatus(
    await capabilityReader.post(
      `/api/publications/${publication.publicationId}/exchange`,
      { token: publication.rawToken },
    ),
    204,
    'anonymous capability exchange',
  );
  await expectStatus(
    await capabilityReader.get(
      `/api/publications/${publication.publicationId}`,
    ),
    200,
    'anonymous capability read',
  );

  const invitee = new BrowserSession();
  await expectStatus(
    await invitee.post('/api/auth/sign-up/email', {
      name: 'Invitee',
      email: 'invitee-http@example.test',
      password: 'safe-local-password',
    }),
    200,
    'invitee sign-up',
  );
  const invitationResponse = await owner.post(
    '/api/auth/organization/invite-member',
    {
      organizationId: organization.id,
      email: 'invitee-http@example.test',
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
    { name: 'Other Tenant', slug: 'other-tenant' },
  );
  await expectStatus(otherTenantResponse, 200, 'other organization creation');
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
      ['owner-http@example.test'],
    );
    await expectStatus(
      await owner.post('/api/publications', publicationBody),
      401,
      'revoked database session',
    );

    await expectStatus(
      await owner.post('/api/auth/sign-in/email', {
        email: 'owner-http@example.test',
        password: 'safe-local-password',
      }),
      200,
      'owner sign-in',
    );
    await expectStatus(
      await owner.post('/api/auth/organization/set-active', {
        organizationId: organization.id,
      }),
      200,
      'restore active organization',
    );
    await database.query(
      `update auth."session" set "expiresAt" = now() - interval '1 minute'
     where "userId" = (select id from auth."user" where email = $1)`,
      ['owner-http@example.test'],
    );
    await expectStatus(
      await owner.post('/api/publications', publicationBody),
      401,
      'expired database session',
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
