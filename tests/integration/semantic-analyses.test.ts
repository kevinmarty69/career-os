import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import postgres from 'postgres';
import { syntheticProfile } from '../../lib/fixture';
import { emptySearchProfile } from '../../lib/search-profile';
import {
  buildSemanticAnalysis,
  type SemanticAnalysisInput,
} from '../../lib/semantic-match';
import {
  authorize,
  closeApplicationDatabases,
  database,
} from '../../lib/server/database';
import { storeDiscoveredJob } from '../../lib/server/discovered-jobs';
import { createJobMatch } from '../../lib/server/job-matches';
import { LocalModelClientError } from '../../lib/server/local-openai-client';
import { saveLivingProfile } from '../../lib/server/profile';
import { createSearchProfile } from '../../lib/server/search-profiles';
import {
  runSemanticAnalysis,
  SemanticAnalysisInputUnavailableError,
  SemanticAnalysisModelNotConfiguredError,
  SemanticAnalysisOutcomeUnknownError,
} from '../../lib/server/semantic-analyses';
import { deleteWorkspace } from '../../lib/server/workspace';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const admin = postgres(databaseUrl, { max: 1 });
const session = {
  userId: randomUUID(),
  tenantId: randomUUID(),
  tenantName: 'Semantic regression',
  sessionCreatedAt: new Date(),
};
let searchProfileId: string;

before(async () => {
  await admin.begin(async (tx) => {
    await tx`insert into career_identity."user" (id, name, email, "emailVerified")
      values (${session.userId}, 'Test owner', ${`${session.userId}@example.test`}, true)`;
    await tx`insert into career_identity.organization (id, name, slug, "createdAt")
      values (${session.tenantId}, ${session.tenantName}, ${session.tenantId}, now())`;
    await tx`insert into career_identity.member (id, "organizationId", "userId", role, "createdAt")
      values (${randomUUID()}, ${session.tenantId}, ${session.userId}, 'owner', now())`;
  });
  await saveLivingProfile(
    session,
    {
      ...syntheticProfile,
      claims: syntheticProfile.claims.map((claim) => ({
        ...claim,
        level: 'declared',
      })),
    },
    0,
  );
  searchProfileId = (
    await createSearchProfile(session, {
      ...emptySearchProfile,
      name: 'All roles',
    })
  ).searchProfileId;
});

after(async () => {
  await deleteWorkspace(session, { confirmation: 'DELETE' });
  await admin`delete from career_identity."user" where id = ${session.userId}`;
  await closeApplicationDatabases();
  await admin.end();
});

async function job() {
  const id = randomUUID();
  const url = `https://jobs.example.test/${id}`;
  const stored = await storeDiscoveredJob(session, {
    extraction: {
      company: id,
      role: 'Engineer',
      description: 'Build dependable systems.',
      sourceUrl: url,
    },
    normalized: {
      location: 'Paris',
      remoteMode: 'hybrid',
      contractType: 'full_time',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: 'unknown',
      publishedAt: null,
      externalId: null,
      sourceKind: 'generic_html',
      lifecycleSignal: 'open',
    },
    provenance: {
      requestedUrl: url,
      finalUrl: url,
      fetchedUrl: url,
      fetchedAt: new Date().toISOString(),
      contentType: 'text/html',
      bytes: 200,
      sha256: 'a'.repeat(64),
      trust: 'untrusted-data',
    },
  });
  return stored.opportunity.opportunityId;
}

function generated(input: SemanticAnalysisInput) {
  return {
    output: buildSemanticAnalysis(input, {
      skills: [
        {
          statement: 'Relevant experience.',
          factor: 'strong',
          jobExcerpt: input.job.description,
          profileReferences: [
            {
              claimId: input.profile.claims[0].claimId,
              evidenceIds: [input.profile.claims[0].evidence[0].evidenceId],
            },
          ],
        },
      ],
      responsibilities: [],
      transfers: [],
      gaps: [],
      unknowns: [],
      risks: [],
    }),
    usage: {
      inputTokens: 12,
      outputTokens: 4,
      reservedTokens: 200,
      costMicros: 0 as const,
      reservedCostMicros: 0 as const,
      latencyMs: 1,
    },
    provider: 'openai-compatible-local' as const,
    model: 'integration-model',
  };
}

test('concurrent requests share one inference without keeping SQL transactions or job locks', async () => {
  const jobId = await job();
  let calls = 0;
  const client = {
    async generate(input: SemanticAnalysisInput) {
      calls += 1;
      const started = new Date();
      await admin.begin(async (tx) => {
        await tx`set local lock_timeout = '300ms'`;
        await tx`update app.discovered_jobs set last_seen_at = clock_timestamp() where id = ${jobId}`;
      });
      await delay(100);
      const [{ idle }] = await admin<
        { idle: number }[]
      >`select count(*)::integer idle
      from pg_stat_activity where datname = current_database() and state = 'idle in transaction' and xact_start < ${started}`;
      assert.equal(idle, 0);
      return generated(input);
    },
  };
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      runSemanticAnalysis(session, jobId, searchProfileId, client),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(
    new Set(
      results.map(
        (result) => result.status === 'completed' && result.analysis.analysisId,
      ),
    ).size,
    1,
  );
  assert.deepEqual(
    await runSemanticAnalysis(session, jobId, searchProfileId, client),
    results[0],
  );
  assert.equal(calls, 1);
});

test('pre-dispatch configuration failures release the reservation', async () => {
  const jobId = await job();
  const previous = process.env.CAREER_OS_LOCAL_MODEL_BASE_URL;
  process.env.CAREER_OS_LOCAL_MODEL_BASE_URL = '';
  try {
    await assert.rejects(
      runSemanticAnalysis(session, jobId, searchProfileId),
      SemanticAnalysisModelNotConfiguredError,
    );
    assert.equal(
      (
        await runSemanticAnalysis(session, jobId, searchProfileId, {
          generate: async (input) => generated(input),
        })
      ).status,
      'completed',
    );
  } finally {
    if (previous === undefined)
      delete process.env.CAREER_OS_LOCAL_MODEL_BASE_URL;
    else process.env.CAREER_OS_LOCAL_MODEL_BASE_URL = previous;
  }
});

test('uncertain provider failures survive requests and never automatically call the model again', async () => {
  const jobId = await job();
  let calls = 0;
  const client = {
    async generate() {
      calls += 1;
      throw new LocalModelClientError('TIMEOUT');
    },
  };
  await assert.rejects(
    runSemanticAnalysis(session, jobId, searchProfileId, client),
    LocalModelClientError,
  );
  await assert.rejects(
    runSemanticAnalysis(session, jobId, searchProfileId, client),
    SemanticAnalysisOutcomeUnknownError,
  );
  assert.equal(calls, 1);
  const [lease] =
    await admin`select status from app.semantic_analysis_leases where tenant_id = ${session.tenantId}
    and job_match_id in (select id from app.job_matches where discovered_job_id = ${jobId})`;
  assert.equal(lease.status, 'outcome_unknown');
});

test('a generated result rejected during persistence keeps an unknown outcome and cannot replay', async () => {
  const jobId = await job();
  let calls = 0;
  const client = {
    async generate(input: SemanticAnalysisInput) {
      calls += 1;
      const result = generated(input);
      result.usage.latencyMs = -1;
      return result;
    },
  };
  await assert.rejects(
    runSemanticAnalysis(session, jobId, searchProfileId, client),
    /violates check constraint/,
  );
  await assert.rejects(
    runSemanticAnalysis(session, jobId, searchProfileId, client),
    SemanticAnalysisOutcomeUnknownError,
  );
  assert.equal(calls, 1);
  const [{ count }] =
    await admin`select count(*)::integer count from app.semantic_analyses where discovered_job_id = ${jobId}`;
  assert.equal(count, 0);
});

test('expired in-flight attempts are fenced and cannot persist or dispatch again', async () => {
  const jobId = await job();
  let calls = 0;
  const client = {
    async generate(input: SemanticAnalysisInput) {
      calls += 1;
      await admin`update app.semantic_analysis_leases set expires_at = clock_timestamp() - interval '1 second'
      where tenant_id = ${session.tenantId} and job_match_id in (select id from app.job_matches where discovered_job_id = ${jobId})`;
      await assert.rejects(
        runSemanticAnalysis(session, jobId, searchProfileId, {
          generate: async () => {
            throw new Error('must not dispatch');
          },
        }),
        SemanticAnalysisOutcomeUnknownError,
      );
      return generated(input);
    },
  };
  await assert.rejects(
    runSemanticAnalysis(session, jobId, searchProfileId, client),
    LocalModelClientError,
  );
  assert.equal(calls, 1);
  const [{ count }] =
    await admin`select count(*)::integer count from app.semantic_analyses where discovered_job_id = ${jobId}`;
  assert.equal(count, 0);
});

test('a job changed during inference rejects the stale artifact', async () => {
  const jobId = await job();
  await assert.rejects(
    runSemanticAnalysis(session, jobId, searchProfileId, {
      async generate(input) {
        await admin`update app.discovered_jobs set revision = revision + 1 where id = ${jobId}`;
        return generated(input);
      },
    }),
    SemanticAnalysisInputUnavailableError,
  );
  const [{ count }] =
    await admin`select count(*)::integer count from app.semantic_analyses where discovered_job_id = ${jobId}`;
  assert.equal(count, 0);
});

test('tenant context is local on pooled connections, including rollback and lease reads', async () => {
  const sql = database();
  assert.equal(sql, database());
  const wrongSession = {
    ...session,
    userId: randomUUID(),
    tenantId: randomUUID(),
  };
  await assert.rejects(
    sql.begin(async (tx) => {
      await authorize(tx, session);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  const pids = await Promise.all(
    Array.from({ length: 12 }, () =>
      sql.begin(async (tx) => {
        const [clean] =
          await tx`select current_user role, session_user login, current_setting('request.jwt.claim.tenant_id', true) tenant`;
        assert.equal(
          clean.role,
          clean.login,
          'Transaction-local role returns to the connection login',
        );
        assert.ok(!clean.tenant);
        await authorize(tx, wrongSession);
        const [{ count, pid }] =
          await tx`select count(*)::integer count, pg_backend_pid() pid from app.semantic_analysis_leases`;
        assert.equal(count, 0);
        return pid;
      }),
    ),
  );
  assert.ok(new Set(pids).size <= 5);
  await assert.rejects(
    createJobMatch(wrongSession, await job(), { searchProfileId }),
  );
});
