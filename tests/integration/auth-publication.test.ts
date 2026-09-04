import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Pool } from 'pg';
import { syntheticProfile } from '../../lib/fixture';
import { LocalOpenAIReviewClient } from '../../lib/server/local-openai-review-client';
import { processReviewerStep } from '../../lib/server/reviewer-worker';
import type { PersistedRun } from '../../lib/run-contract';

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
  logoUrl: 'https://assets.example.test/northstar.svg',
  accent: '#21504b',
};
const livingProfile = structuredClone(syntheticProfile);
for (const claim of livingProfile.claims) claim.level = 'declared';
livingProfile.publicLinks = {
  email: 'alex@example.test',
  github: 'https://github.com/alex',
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

async function makeRunPublishable(run: PersistedRun, tenantId: string) {
  const claim = run.profile.claims.find(
    ({ evidenceIds }) => evidenceIds.length,
  );
  assert.ok(claim);
  const claimIds = [claim.id];
  const spec = {
    version: 1 as const,
    company: {
      name: opportunity.company,
      role: opportunity.role,
      accent: opportunity.accent,
    },
    hero: {
      eyebrow: 'Private application',
      title: `${run.profile.name} × ${opportunity.company}`,
      thesis: claim.statement,
    },
    blocks: [
      {
        type: 'fit' as const,
        title: 'Relevant experience',
        claimIds,
      },
    ],
  };

  const suffix =
    process.env.CAREER_OS_HTTP_TEST_SUFFIX ??
    randomUUID().replaceAll('-', '').slice(0, 12);
  const database = new Pool({ connectionString: databaseUrl });
  const client = await database.connect();
  const credentials = {
    recruiter: workerCredential(`publication_recruiter_${suffix}`),
    hiringManager: workerCredential(`publication_hiring_${suffix}`),
    factuality: workerCredential(`publication_factuality_${suffix}`),
  };
  const fake = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: randomUUID(),
          choices: [
            {
              message: { content: JSON.stringify({ issues: [] }) },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 10,
            total_tokens: 40,
          },
        }),
      );
    });
  });
  try {
    for (const [credential, role] of [
      [credentials.recruiter, 'career_recruiter_reviewer'],
      [credentials.hiringManager, 'career_hiring_manager_reviewer'],
      [credentials.factuality, 'career_factuality_reviewer'],
    ] as const)
      await client.query(
        `create role ${credential.login} login noinherit password '${credential.password}' in role ${role}`,
      );
    await client.query('begin');
    const strategyArtifactId = randomUUID();
    const strategyApprovalId = randomUUID();
    const strategy = await client.query<{ artifact_hash: string }>(
      `insert into app.artifacts (
         id, tenant_id, workflow_run_id, kind, version, body, created_by
       ) values ($1, $2, $3, 'strategy', 1, '{}'::jsonb, 'recruiter')
       returning encode(digest(body::text, 'sha256'), 'hex') artifact_hash`,
      [strategyArtifactId, tenantId, run.runId],
    );
    await client.query(
      `insert into app.strategy_approvals (
         id, tenant_id, workflow_run_id, strategy_artifact_id,
         strategy_artifact_hash, idempotency_key, approved_by
       ) select $1, $2, $3, $4, $5, $6, owner_id
         from app.tenants where id = $2`,
      [
        strategyApprovalId,
        tenantId,
        run.runId,
        strategyArtifactId,
        strategy.rows[0].artifact_hash,
        randomUUID(),
      ],
    );
    const pageArtifactId = randomUUID();
    const pageSpecId = randomUUID();
    await client.query(
      `insert into app.artifacts (
         id, tenant_id, workflow_run_id, kind, version, body, created_by
       ) values ($1, $2, $3, 'page_spec', 1, $4, 'page_composer')`,
      [pageArtifactId, tenantId, run.runId, spec],
    );
    await client.query(
      `insert into app.page_specs (
         id, tenant_id, workflow_run_id, version, spec, input_hash,
         source_artifact_id
       ) values ($1, $2, $3, 1, $4, repeat('a', 64), $5)`,
      [pageSpecId, tenantId, run.runId, spec, pageArtifactId],
    );
    for (const claimId of claimIds)
      await client.query(
        `insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id)
         values ($1, $2, $3)`,
        [tenantId, pageSpecId, claimId],
      );
    await client.query(
      `insert into app.page_spec_evidence (
         tenant_id, page_spec_id, claim_id, evidence_id, position
       ) select link.tenant_id, $2, link.claim_id, link.evidence_id, link.position
         from app.claim_evidence link
         where link.tenant_id = $1 and link.claim_id = any($3::uuid[])`,
      [tenantId, pageSpecId, claimIds],
    );
    await client.query(
      `update app.workflow_steps set status = 'cancelled'
       where tenant_id = $1 and workflow_run_id = $2 and status = 'pending'`,
      [tenantId, run.runId],
    );
    await client.query(
      `insert into app.workflow_steps (
         tenant_id, workflow_run_id, stage, status, idempotency_key,
         input, input_hash, output_artifact_id, page_spec_id, completed_at
       ) values ($1, $2, 'page-composer', 'completed', 'publication-fixture',
         $3, encode(digest($3::jsonb::text, 'sha256'), 'hex'), $4, $5, now())`,
      [
        tenantId,
        run.runId,
        {
          schemaVersion: 1,
          strategyArtifactId,
          strategyArtifactHash: strategy.rows[0].artifact_hash,
          strategyApprovalId,
        },
        pageArtifactId,
        pageSpecId,
      ],
    );
    await client.query(
      `update app.workflow_runs set status = 'paused', state = 'page_spec_review'
       where tenant_id = $1 and id = $2`,
      [tenantId, run.runId],
    );
    const owner = await client.query<{ owner_id: string }>(
      'select owner_id from app.tenants where id = $1',
      [tenantId],
    );
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
        set_config('request.jwt.claim.tenant_id', $2, true)`,
      [owner.rows[0].owner_id, tenantId],
    );
    await client.query('set local role career_app');
    await client.query('select app.start_page_spec_reviews($1,$2,$3)', [
      tenantId,
      run.runId,
      randomUUID(),
    ]);
    await client.query('commit');

    await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const address = fake.address();
    assert(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    assert.equal(
      (
        await processReviewerStep({
          reviewer: 'recruiter',
          databaseUrl: credentials.recruiter.url,
          client: new LocalOpenAIReviewClient({
            reviewer: 'recruiter',
            baseUrl,
            apiKey: 'local-test',
            model: 'fake-reviewer',
          }),
        })
      ).status,
      'completed',
    );
    assert.equal(
      (
        await processReviewerStep({
          reviewer: 'hiring-manager',
          databaseUrl: credentials.hiringManager.url,
          client: new LocalOpenAIReviewClient({
            reviewer: 'hiring-manager',
            baseUrl,
            apiKey: 'local-test',
            model: 'fake-reviewer',
          }),
        })
      ).status,
      'completed',
    );
    assert.equal(
      (
        await processReviewerStep({
          reviewer: 'factuality',
          databaseUrl: credentials.factuality.url,
        })
      ).status,
      'completed',
    );
    const reviewState = await client.query<{
      status: string;
      state: string;
      review_count: number;
    }>(
      `select run.status, run.state,
        (select count(*)::integer from app.reviews review
          where review.workflow_run_id = run.id) review_count
       from app.workflow_runs run where run.id = $1`,
      [run.runId],
    );
    assert.deepEqual(reviewState.rows[0], {
      status: 'awaiting_approval',
      state: 'human_approval',
      review_count: 3,
    });
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await new Promise<void>((resolve) => fake.close(() => resolve())).catch(
      () => undefined,
    );
    client.release();
    for (const credential of Object.values(credentials))
      await database
        .query(`drop role if exists ${credential.login}`)
        .catch(() => undefined);
    await database.end();
  }
}

function workerCredential(login: string) {
  const password = `worker-${randomUUID()}`;
  const url = new URL(databaseUrl!);
  url.username = login;
  url.password = password;
  return { login, password, url: url.toString() };
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
  await expectStatus(
    await anonymous.post('/api/applications/import-url', {
      url: 'https://example.com/jobs/role',
    }),
    401,
    'anonymous URL import',
  );
  await expectStatus(
    await fetch(`${baseUrl}/api/applications/import-url`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example',
      },
      body: JSON.stringify({ url: 'https://example.com/jobs/role' }),
    }),
    403,
    'cross-origin URL import',
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

  const privateImport = await owner.post('/api/applications/import-url', {
    url: 'http://127.0.0.1/admin',
  });
  await expectStatus(privateImport, 400, 'private-network URL import');
  assert.equal(privateImport.headers.get('cache-control'), 'private, no-store');

  const emptyProfile = await owner.get('/api/profile');
  await expectStatus(emptyProfile, 200, 'empty profile read');
  assert.deepEqual(await emptyProfile.json(), { profile: null, revision: 0 });
  await expectStatus(
    await owner.put('/api/profile', {
      profile: syntheticProfile,
      expectedRevision: 0,
    }),
    400,
    'self-verified profile rejection',
  );
  const savedProfileResponse = await owner.put('/api/profile', {
    profile: livingProfile,
    expectedRevision: 0,
  });
  await expectStatus(savedProfileResponse, 200, 'profile creation');
  const savedProfile = (await savedProfileResponse.json()) as {
    profile: typeof syntheticProfile;
    revision: number;
  };
  assert.equal(savedProfile.revision, 1);
  assert.equal(savedProfile.profile.claims.length, livingProfile.claims.length);
  assert.deepEqual(savedProfile.profile.publicLinks, livingProfile.publicLinks);
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
  const heartbeat = new Pool({ connectionString: databaseUrl });
  try {
    await heartbeat.query('begin');
    await heartbeat.query('set local role career_company_researcher');
    await heartbeat.query(
      "select app.record_worker_heartbeat('company-researcher')",
    );
    await heartbeat.query('commit');
  } finally {
    await heartbeat.end();
  }
  const runResponse = await owner.post(
    '/api/runs',
    {
      applicationId: application.applicationId,
      applicationRevision: application.revision,
      profileRevision: savedProfile.revision,
    },
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(runResponse, 202, 'persisted run');
  const run = (await runResponse.json()) as PersistedRun;
  await makeRunPublishable(run, organization.id);
  const publishableBody = {
    runId: run.runId,
    rawToken: `${randomUUID()}${randomUUID()}`,
  };

  const publicationResponse = await owner.post(
    '/api/publications',
    publishableBody,
  );
  await expectStatus(publicationResponse, 201, 'authenticated publication');
  const publication = (await publicationResponse.json()) as {
    publicationId: string;
    rawToken: string;
    version: number;
  };
  assert.equal(publication.version, 1);
  const retryResponse = await owner.post('/api/publications', publishableBody);
  await expectStatus(retryResponse, 201, 'publication retry');
  const retryPublication = (await retryResponse.json()) as {
    publicationId: string;
    rawToken: string;
    version: number;
  };
  assert.equal(retryPublication.publicationId, publication.publicationId);
  assert.equal(retryPublication.rawToken, publication.rawToken);
  assert.equal(retryPublication.version, 1);

  const expiredReader = new BrowserSession();
  await expectStatus(
    await expiredReader.post(
      `/api/publications/${publication.publicationId}/exchange`,
      { token: publication.rawToken },
    ),
    204,
    'retried capability exchange',
  );
  const capabilityReader = new BrowserSession();
  await expectStatus(
    await capabilityReader.post(
      `/api/publications/${retryPublication.publicationId}/exchange`,
      { token: retryPublication.rawToken },
    ),
    204,
    'same capability exchange',
  );
  const publishedSnapshot = await capabilityReader.get(
    `/api/publications/${publication.publicationId}`,
  );
  await expectStatus(publishedSnapshot, 200, 'anonymous capability read');
  const publishedPayload = await publishedSnapshot.json();
  assert.deepEqual(publishedPayload.brand, { logoUrl: opportunity.logoUrl });
  assert.deepEqual(
    publishedPayload.profile.publicLinks,
    livingProfile.publicLinks,
  );

  const updatedProfile = await owner.put('/api/profile', {
    profile: { ...savedProfile.profile, headline: 'Updated after publication' },
    expectedRevision: savedProfile.revision,
  });
  await expectStatus(updatedProfile, 200, 'profile update after publication');
  const updatedProfileBody = (await updatedProfile.json()) as {
    revision: number;
  };
  const unchangedSnapshot = await capabilityReader.get(
    `/api/publications/${publication.publicationId}`,
  );
  await expectStatus(unchangedSnapshot, 200, 'snapshot after profile update');
  assert.deepEqual(await unchangedSnapshot.json(), publishedPayload);

  const replacementRunResponse = await owner.post(
    '/api/runs',
    {
      applicationId: application.applicationId,
      applicationRevision: application.revision,
      profileRevision: updatedProfileBody.revision,
    },
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(replacementRunResponse, 202, 'replacement run');
  const replacementRun = (await replacementRunResponse.json()) as PersistedRun;
  await makeRunPublishable(replacementRun, organization.id);
  const replacementResponse = await owner.post('/api/publications', {
    runId: replacementRun.runId,
    rawToken: `${randomUUID()}${randomUUID()}`,
  });
  await expectStatus(replacementResponse, 201, 'replacement publication');
  const replacementPublication = (await replacementResponse.json()) as {
    publicationId: string;
    rawToken: string;
    version: number;
  };
  assert.equal(replacementPublication.version, 2);
  await expectStatus(
    await capabilityReader.get(
      `/api/publications/${publication.publicationId}`,
    ),
    404,
    'replaced capability',
  );
  const replacementReader = new BrowserSession();
  await expectStatus(
    await replacementReader.post(
      `/api/publications/${replacementPublication.publicationId}/exchange`,
      { token: replacementPublication.rawToken },
    ),
    204,
    'replacement capability exchange',
  );
  for (const event of [
    { type: 'open' },
    { type: 'section', key: 'evidence:0:0' },
    { type: 'action', key: 'linkedin' },
    { type: 'download', key: 'resume' },
  ])
    await expectStatus(
      await replacementReader.post(
        `/api/publications/${replacementPublication.publicationId}/events`,
        event,
      ),
      204,
      `publication ${event.type} event`,
    );
  const inventoryResponse = await owner.get('/api/publications');
  await expectStatus(inventoryResponse, 200, 'publication history');
  const inventory = (await inventoryResponse.json()) as {
    publications: Array<{
      publicationId: string;
      status: string;
      version: number;
      isCurrent: boolean;
      firstOpenedAt: string | null;
      lastOpenedAt: string | null;
      opens: number;
      sections: number;
      actions: number;
      downloads: number;
    }>;
  };
  assert.deepEqual(
    inventory.publications.slice(0, 2).map((item) => ({
      publicationId: item.publicationId,
      status: item.status,
      version: item.version,
      isCurrent: item.isCurrent,
      opens: item.opens,
      sections: item.sections,
      actions: item.actions,
      downloads: item.downloads,
    })),
    [
      {
        publicationId: replacementPublication.publicationId,
        status: 'active',
        version: 2,
        isCurrent: true,
        opens: 1,
        sections: 1,
        actions: 1,
        downloads: 1,
      },
      {
        publicationId: publication.publicationId,
        status: 'revoked',
        version: 1,
        isCurrent: false,
        opens: 0,
        sections: 0,
        actions: 0,
        downloads: 0,
      },
    ],
  );
  assert.ok(inventory.publications[0].firstOpenedAt);
  assert.ok(inventory.publications[0].lastOpenedAt);
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
        share_count: 1,
        profile_count: 1,
        opportunity_count: 1,
        run_count: 1,
      },
    );
  } finally {
    await database.end();
  }

  await expectStatus(
    await replacementReader.get(
      `/api/publications/${replacementPublication.publicationId}`,
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
