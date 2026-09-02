import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { syntheticProfile } from '../../lib/fixture';
import type { PageSpec, Profile } from '../../lib/schemas';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3019';
const authOrigin = process.env.TEST_AUTH_ORIGIN ?? baseUrl;
const requestOrigin = process.env.TEST_REQUEST_ORIGIN ?? baseUrl;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const suffix = randomUUID();
const opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
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
  return {
    browser,
    organization: (await organization.json()) as { id: string },
  };
}

type ReviewTarget = {
  reviewId: string;
  issueIndex: number;
};

async function injectReviewDisagreement(
  pool: Pool,
  runId: string,
  reviewer: 'recruiter' | 'hiring_manager' | 'factuality',
  message: string,
): Promise<ReviewTarget> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const source = await client.query<{
      id: string;
      tenant_id: string;
      version: number;
      spec: unknown;
      input_hash: string;
    }>(
      `select id, tenant_id, version, spec, input_hash
       from app.page_specs
       where workflow_run_id = $1 and invalidated_at is null
       order by version desc limit 1
       for update`,
      [runId],
    );
    assert.equal(source.rowCount, 1);
    const sourceSpec = source.rows[0];
    const nextPageSpecId = randomUUID();
    const inserted = await client.query<{ spec_hash: string }>(
      `insert into app.page_specs (
         id, tenant_id, workflow_run_id, version, spec, input_hash
       ) values ($1, $2, $3, $4, $5, $6)
       returning spec_hash`,
      [
        nextPageSpecId,
        sourceSpec.tenant_id,
        runId,
        sourceSpec.version + 1,
        sourceSpec.spec,
        sourceSpec.input_hash,
      ],
    );
    await client.query(
      `insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id)
       select tenant_id, $1, claim_id from app.page_spec_claims
       where tenant_id = $2 and page_spec_id = $3`,
      [nextPageSpecId, sourceSpec.tenant_id, sourceSpec.id],
    );
    const issue = {
      section: reviewer === 'factuality' ? 'blocks.evidence' : 'hero.thesis',
      message,
      blocking: reviewer === 'factuality',
    };
    const reviews = [
      {
        id: randomUUID(),
        reviewer: 'recruiter',
        issues: reviewer === 'recruiter' ? [issue] : [],
      },
      {
        id: randomUUID(),
        reviewer: 'hiring_manager',
        issues: reviewer === 'hiring_manager' ? [issue] : [],
      },
      {
        id: randomUUID(),
        reviewer: 'factuality',
        issues: reviewer === 'factuality' ? [issue] : [],
      },
    ] as const;
    for (const review of reviews)
      await client.query(
        `insert into app.reviews (
           id, tenant_id, page_spec_id, reviewer, verdict, issues,
           page_spec_hash
         ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          review.id,
          sourceSpec.tenant_id,
          nextPageSpecId,
          review.reviewer,
          review.issues.length === 0 ? 'pass' : 'changes_required',
          JSON.stringify(review.issues),
          inserted.rows[0].spec_hash,
        ],
      );
    await client.query(
      `update app.workflow_runs set status = 'blocked', state = 'review'
       where tenant_id = $1 and id = $2`,
      [sourceSpec.tenant_id, runId],
    );
    await client.query('commit');
    return {
      reviewId: reviews.find((item) => item.reviewer === reviewer)!.id,
      issueIndex: 0,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const anonymous = new BrowserSession();
  await expectStatus(
    await anonymous.request('/api/runs', 'POST', {
      applicationId: randomUUID(),
      applicationRevision: 1,
      profileRevision: 1,
    }),
    401,
    'anonymous run',
  );

  const owner = await createWorkspace('RunOwner');
  const saved = await owner.browser.request('/api/profile', 'PUT', {
    profile: syntheticProfile,
    expectedRevision: 0,
  });
  await expectStatus(saved, 200, 'saved Career Memory');
  const savedProfile = (await saved.json()) as { revision: number };
  const applicationResponse = await owner.browser.request(
    '/api/applications',
    'POST',
    opportunity,
    { 'idempotency-key': randomUUID() },
  );
  await expectStatus(applicationResponse, 201, 'persisted application');
  const application = (await applicationResponse.json()) as {
    applicationId: string;
    revision: number;
  };
  const runInput = {
    applicationId: application.applicationId,
    applicationRevision: application.revision,
    profileRevision: savedProfile.revision,
  };
  const idempotencyKey = randomUUID();
  const create = await owner.browser.request('/api/runs', 'POST', runInput, {
    'idempotency-key': idempotencyKey,
  });
  await expectStatus(create, 201, 'persisted run');
  const run = (await create.json()) as {
    runId: string;
    status: string;
    revision: number;
    usedCostMicros: number;
    profile: Profile;
    spec: PageSpec;
    reviews: Array<{ reviewId: string; passed: boolean }>;
    events: unknown[];
  };
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(run.revision, 1);
  assert.equal(run.usedCostMicros, 0);
  const claimIds = new Set(run.profile.claims.map((claim) => claim.id));
  assert.ok(
    run.spec.blocks
      .flatMap((block) => ('claimIds' in block ? block.claimIds : []))
      .every((claimId) => claimIds.has(claimId)),
  );
  assert.ok(run.spec);
  assert.equal(run.reviews.length, 3);
  assert.ok(
    run.reviews.every((review) => /^[0-9a-f-]{36}$/.test(review.reviewId)),
  );
  assert.ok(run.reviews.every((review) => review.passed));
  assert.ok(run.events.length > 0);

  const replay = await owner.browser.request('/api/runs', 'POST', runInput, {
    'idempotency-key': idempotencyKey,
  });
  await expectStatus(replay, 200, 'idempotent replay');
  assert.deepEqual(await replay.json(), run);
  await expectStatus(
    await owner.browser.request(
      '/api/runs',
      'POST',
      {
        ...runInput,
        applicationRevision: application.revision + 1,
      },
      { 'idempotency-key': idempotencyKey },
    ),
    409,
    'idempotency key reused with a different input',
  );
  const read = await owner.browser.request(`/api/runs/${run.runId}`);
  await expectStatus(read, 200, 'run read');
  assert.deepEqual(await read.json(), run);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const stored = await pool.query<{
      profile_kind: string;
      source_profile_revision: string;
      event_count: string;
      artifact_count: string;
      page_spec_count: string;
      review_count: string;
      usage_count: string;
    }>(
      `select p.profile_kind, wr.source_profile_revision,
        (select count(*) from app.workflow_events where workflow_run_id = wr.id) event_count,
        (select count(*) from app.artifacts where workflow_run_id = wr.id) artifact_count,
        (select count(*) from app.page_specs where workflow_run_id = wr.id) page_spec_count,
        (select count(*) from app.reviews r join app.page_specs ps on ps.id = r.page_spec_id where ps.workflow_run_id = wr.id) review_count,
        (select count(*) from app.model_usage where workflow_run_id = wr.id) usage_count
      from app.workflow_runs wr join app.profiles p on p.id = wr.profile_id
      where wr.id = $1`,
      [run.runId],
    );
    assert.equal(stored.rows[0].profile_kind, 'snapshot');
    assert.equal(Number(stored.rows[0].source_profile_revision), 1);
    assert.ok(Number(stored.rows[0].event_count) > 0);
    assert.equal(Number(stored.rows[0].artifact_count), 7);
    assert.equal(Number(stored.rows[0].page_spec_count), 2);
    assert.equal(Number(stored.rows[0].review_count), 6);
    assert.equal(Number(stored.rows[0].usage_count), 0);

    const keepTarget = await injectReviewDisagreement(
      pool,
      run.runId,
      'recruiter',
      'The framing is too generic.',
    );
    const keepKeys = [randomUUID(), randomUUID()];
    const keepResponses = await Promise.all(
      keepKeys.map((key) =>
        owner.browser.request(
          `/api/runs/${run.runId}/review-decisions`,
          'POST',
          { ...keepTarget, decision: 'keep' },
          { 'idempotency-key': key },
        ),
      ),
    );
    assert.deepEqual(
      keepResponses.map((response) => response.status).sort(),
      [200, 201],
    );
    const keepResults = await Promise.all(
      keepResponses.map(
        (response) =>
          response.json() as Promise<{
            decisionId: string;
            publicationEligible: boolean;
          }>,
      ),
    );
    assert.equal(keepResults[0].decisionId, keepResults[1].decisionId);
    assert.ok(keepResults.every((result) => result.publicationEligible));
    const keepReplay = await owner.browser.request(
      `/api/runs/${run.runId}/review-decisions`,
      'POST',
      { ...keepTarget, decision: 'keep' },
      { 'idempotency-key': keepKeys[0] },
    );
    await expectStatus(keepReplay, 200, 'review decision replay');
    assert.deepEqual(await keepReplay.json(), keepResults[0]);
    await expectStatus(
      await owner.browser.request(
        `/api/runs/${run.runId}/review-decisions`,
        'POST',
        { ...keepTarget, decision: 'correct' },
        { 'idempotency-key': keepKeys[0] },
      ),
      409,
      'review decision key reused with another payload',
    );
    await expectStatus(
      await owner.browser.request('/api/publications', 'POST', {
        runId: run.runId,
      }),
      201,
      'publication after explicit non-factual keep',
    );

    const correctionCreate = await owner.browser.request(
      '/api/runs',
      'POST',
      runInput,
      { 'idempotency-key': randomUUID() },
    );
    await expectStatus(correctionCreate, 201, 'correction source run');
    const correctionSource = (await correctionCreate.json()) as {
      runId: string;
    };
    const correctionTarget = await injectReviewDisagreement(
      pool,
      correctionSource.runId,
      'recruiter',
      'State the role-specific operating outcome.',
    );
    const correctionResponse = await owner.browser.request(
      `/api/runs/${correctionSource.runId}/review-decisions`,
      'POST',
      { ...correctionTarget, decision: 'correct' },
      { 'idempotency-key': randomUUID() },
    );
    await expectStatus(correctionResponse, 201, 'targeted correction');
    const correction = (await correctionResponse.json()) as {
      publicationEligible: boolean;
      correctedRun: {
        runId: string;
        status: string;
        usedCostMicros: number;
        spec: PageSpec;
        reviews: Array<{
          reviewId: string;
          passed: boolean;
          issues: Array<{
            section: string;
            message: string;
            blocking: boolean;
          }>;
        }>;
      };
    };
    assert.equal(correction.publicationEligible, false);
    assert.notEqual(correction.correctedRun.runId, correctionSource.runId);
    assert.equal(correction.correctedRun.status, 'awaiting_approval');
    assert.equal(correction.correctedRun.usedCostMicros, 0);
    assert.match(
      correction.correctedRun.spec.hero.thesis,
      /role-specific thesis foregrounds the operating outcome/i,
    );
    assert.doesNotMatch(correction.correctedRun.spec.hero.thesis, /State the/);
    assert.equal(correction.correctedRun.reviews.length, 3);
    assert.ok(
      correction.correctedRun.reviews.every(
        (review) => review.passed && review.issues.length === 0,
      ),
    );
    const immutableCounts = await pool.query<{
      decisions: string;
      source_reviews: string;
      corrected_reviews: string;
    }>(
      `select
        (select count(*) from app.review_issue_decisions
          where workflow_run_id = $1) decisions,
        (select count(*) from app.reviews r join app.page_specs ps
          on ps.id = r.page_spec_id where ps.workflow_run_id = $1) source_reviews,
        (select count(*) from app.reviews r join app.page_specs ps
          on ps.id = r.page_spec_id where ps.workflow_run_id = $2) corrected_reviews`,
      [correctionSource.runId, correction.correctedRun.runId],
    );
    assert.equal(Number(immutableCounts.rows[0].decisions), 1);
    assert.equal(Number(immutableCounts.rows[0].source_reviews), 9);
    assert.equal(Number(immutableCounts.rows[0].corrected_reviews), 6);

    const factualCreate = await owner.browser.request(
      '/api/runs',
      'POST',
      runInput,
      { 'idempotency-key': randomUUID() },
    );
    await expectStatus(factualCreate, 201, 'factuality source run');
    const factualSource = (await factualCreate.json()) as { runId: string };
    const factualTarget = await injectReviewDisagreement(
      pool,
      factualSource.runId,
      'factuality',
      'Evidence does not support this claim.',
    );
    await expectStatus(
      await owner.browser.request(
        `/api/runs/${factualSource.runId}/review-decisions`,
        'POST',
        { ...factualTarget, decision: 'keep' },
        { 'idempotency-key': randomUUID() },
      ),
      400,
      'factuality keep',
    );

    const other = await createWorkspace('RunOther');
    await expectStatus(
      await other.browser.request(`/api/runs/${run.runId}`),
      404,
      'cross-tenant run read',
    );
    await expectStatus(
      await other.browser.request(
        `/api/runs/${correctionSource.runId}/review-decisions`,
        'POST',
        { ...correctionTarget, decision: 'correct' },
        { 'idempotency-key': randomUUID() },
      ),
      400,
      'cross-tenant review decision',
    );
  } finally {
    await pool.end();
  }
}

main().then(
  () => console.log('agent runs integration ok'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
