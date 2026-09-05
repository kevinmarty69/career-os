import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import postgres from 'postgres';
import {
  workspaceExportFormat,
  workspaceExportTables,
  workspaceExportVersion,
} from '../../lib/workspace-export-contract';
import {
  exportWorkspace,
  WorkspaceExportRejectedError,
  WorkspaceExportSessionNotFreshError,
} from '../../lib/server/workspace-export';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

test('workspace export contract covers every tenant table and field', async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const columns = await sql<
      { table_name: string; column_name: string }[]
    >`select table_name, column_name
       from information_schema.columns
       where table_schema = 'app' and table_name in (
         select table_name from information_schema.columns
         where table_schema = 'app' and column_name = 'tenant_id'
       )`;
    const actual = new Map<string, { column_name: string }[]>();
    for (const { table_name, column_name } of columns)
      actual.set(table_name, [
        ...(actual.get(table_name) ?? []),
        { column_name },
      ]);
    assert.deepEqual(
      [...actual.keys()].sort(),
      workspaceExportTables.map(({ table }) => table).sort(),
    );
    const intentionalExclusions: Record<string, string[]> = {
      search_profiles: ['discovery_lease_token', 'discovery_lease_expires_at'],
      workflow_steps: ['lease_owner'],
      run_budget_reservations: ['owner_id'],
      share_links: ['token_hash'],
    };
    for (const definition of workspaceExportTables)
      assert.deepEqual(
        actual
          .get(definition.table)
          ?.map(({ column_name }) => column_name)
          .sort(),
        [
          ...definition.columns,
          ...(intentionalExclusions[definition.table] ?? []),
        ].sort(),
        `${definition.table} export fields drifted`,
      );
  } finally {
    await sql.end();
  }
});

test('fresh owners export an isolated, verifiable stream without secrets', async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const otherOwnerId = randomUUID();
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const applicationId = randomUUID();
  const applicationTimelineEventId = randomUUID();
  const applicationTaskId = randomUUID();
  const otherApplicationId = randomUUID();
  const discoveredJobId = randomUUID();
  const sourceRecordId = randomUUID();
  const observationId = randomUUID();
  const searchProfileId = randomUUID();
  const matchId = randomUUID();
  const opportunityDecisionId = randomUUID();
  const opportunityDecisionEventId = randomUUID();
  const profileId = randomUUID();
  const semanticAnalysisId = randomUUID();
  const opportunityId = randomUUID();
  const runId = randomUUID();
  const stepId = randomUUID();
  const pageSpecId = randomUUID();
  const publicationId = randomUUID();
  const secret = `must-not-export-${randomUUID()}`;
  const workerOwnerSecret = randomUUID();
  const largeLogo = `data:image/svg+xml,${'x'.repeat(70_000)}`;
  try {
    await sql.begin(async (transaction) => {
      await transaction`insert into auth."user" (id, name, email, "emailVerified") values
        (${ownerId}, 'Export Owner', ${`${ownerId}@example.test`}, true),
        (${memberId}, 'Export Member', ${`${memberId}@example.test`}, true),
        (${otherOwnerId}, 'Other Owner', ${`${otherOwnerId}@example.test`}, true)`;
      await transaction`insert into auth.organization (
        id, name, slug, metadata, "createdAt"
      ) values
        (${tenantId}, 'Export workspace', ${`export-${tenantId}`}, ${secret}, now()),
        (${otherTenantId}, ${secret}, ${`other-${otherTenantId}`}, null, now())`;
      await transaction`update auth.organization set logo = ${largeLogo}
        where id = ${tenantId}`;
      await transaction`insert into auth.member (
        id, "organizationId", "userId", role, "createdAt"
      ) values
        (${randomUUID()}, ${tenantId}, ${ownerId}, 'owner', now()),
        (${randomUUID()}, ${tenantId}, ${memberId}, 'member', now()),
        (${randomUUID()}, ${otherTenantId}, ${otherOwnerId}, 'owner', now())`;
      await transaction`insert into auth.account (
        id, issuer, "accountId", "providerId", "userId", "accessToken",
        "refreshToken", "idToken", password, "createdAt", "updatedAt"
      ) values (
        ${randomUUID()}, 'career-os', ${ownerId}, 'credential', ${ownerId}, ${secret},
        ${secret}, ${secret}, ${secret}, now(), now()
      )`;
      await transaction`insert into auth.session (
        id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent",
        "userId", "activeOrganizationId"
      ) values (
        ${randomUUID()}, now() + interval '1 day', ${secret}, now(), now(), ${secret},
        ${secret}, ${ownerId}, ${tenantId}
      )`;
      await transaction`insert into auth.verification (
        id, identifier, value, "expiresAt", "createdAt", "updatedAt"
      ) values (${randomUUID()}, ${ownerId}, ${secret}, now() + interval '1 day', now(), now())`;
      await transaction`insert into app.tenants (id, owner_id, name) values
        (${tenantId}, ${ownerId}, 'Export workspace'),
        (${otherTenantId}, ${otherOwnerId}, ${secret})`;
      await transaction`insert into app.search_profiles (
        id, tenant_id, name, hard_constraints, soft_preferences,
        discovery_sources, discovery_interval_hours, alert_threshold, active
      ) values (
        ${searchProfileId}, ${tenantId}, 'Visible search',
        '{"roles":["Platform Engineer"]}'::jsonb, '{}'::jsonb,
        '[{"url":"https://jobs.example.test/board"}]'::jsonb, 12, 82, true
      )`;
      await transaction`insert into app.profiles (
        id, tenant_id, name, headline, profile_kind, revision
      ) values (
        ${profileId}, ${tenantId}, 'Visible profile', 'Engineer', 'living', 1
      )`;
      await transaction`insert into app.profile_revisions (
        tenant_id, profile_id, revision, snapshot
      ) values (
        ${tenantId}, ${profileId}, 1,
        '{"name":"Visible profile","headline":"Engineer","sources":[],"evidence":[],"claims":[]}'::jsonb
      )`;
      await transaction`insert into app.discovered_jobs (
        id, tenant_id, company, role, description, canonical_url,
        first_seen_at, last_seen_at
      ) values (
        ${discoveredJobId}, ${tenantId}, 'Visible Jobs Co', 'Platform Engineer',
        'visible discovered job', 'https://jobs.example.test/platform-engineer',
        '2026-01-02 03:04:05+00'::timestamptz,
        '2026-01-02 03:04:06+00'::timestamptz
      )`;
      await transaction`insert into app.applications (
        id, tenant_id, discovered_job_id, company, role, raw_text, accent,
        create_idempotency_key, create_input_hash, created_at, deleted_at
      ) values
        (${applicationId}, ${tenantId}, ${discoveredJobId}, 'Visible Co',
          'Engineer', 'visible application', '#21504b', ${randomUUID()},
          ${'a'.repeat(64)},
          '2026-01-02 03:04:05.123456+00'::timestamptz, now()),
        (${otherApplicationId}, ${otherTenantId}, null, ${secret}, 'Engineer',
          ${secret}, '#21504b', ${randomUUID()}, ${'b'.repeat(64)},
          '2026-01-02 03:04:05.654321+00'::timestamptz, null)`;
      await transaction`insert into app.application_timeline_events (
        id, tenant_id, application_id, kind, title, note, occurred_at,
        actor_id
      ) values (
        ${applicationTimelineEventId}, ${tenantId}, ${applicationId},
        'interview', 'Visible interview', 'visible timeline note',
        '2026-01-03 10:00:00+00'::timestamptz, ${ownerId}
      )`;
      await transaction`insert into app.application_tasks (
        id, tenant_id, application_id, kind, title, due_at, actor_id
      ) values (
        ${applicationTaskId}, ${tenantId}, ${applicationId}, 'follow_up',
        'Visible follow-up', '2026-01-04 10:00:00+00'::timestamptz,
        ${ownerId}
      )`;
      await transaction`insert into app.job_source_records (
        id, tenant_id, discovered_job_id, requested_url, final_url, fetched_url, fetched_at,
        content_type, bytes, content_sha256, extraction
      ) values (
        ${sourceRecordId}, ${tenantId}, ${discoveredJobId},
        'https://jobs.example.test/opening',
        'https://jobs.example.test/platform-engineer',
        'https://jobs.example.test/platform-engineer',
        '2026-01-02 03:04:06+00'::timestamptz, 'text/html', 128,
        ${'c'.repeat(64)}, '{"company":"Visible Jobs Co"}'::jsonb
      )`;
      await transaction`insert into app.job_observations (
        id, tenant_id, discovered_job_id, source_record_id, observed_at,
        content_sha256, change_kind, lifecycle_signal, matched_by, normalized
      ) values (
        ${observationId}, ${tenantId}, ${discoveredJobId}, ${sourceRecordId},
        '2026-01-02 03:04:06+00'::timestamptz, ${'c'.repeat(64)},
        'first_seen', 'unknown', 'new',
        ${transaction.json({
          location: null,
          remoteMode: 'unknown',
          contractType: 'unknown',
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          salaryPeriod: 'unknown',
          publishedAt: null,
          externalId: null,
          sourceKind: 'generic_html',
          lifecycleSignal: 'unknown',
        })}
      )`;
      await transaction`insert into app.job_matches (
        id, tenant_id, discovered_job_id, job_revision, search_profile_id,
        search_profile_revision, living_profile_id, living_profile_revision,
        decision, job_snapshot, search_profile_snapshot, criteria
      ) values (
        ${matchId}, ${tenantId}, ${discoveredJobId}, 1, ${searchProfileId}, 1,
        ${profileId}, 1,
        'priority', '{"revision":1}'::jsonb, '{"revision":1}'::jsonb,
        '[]'::jsonb
      )`;
      await transaction`insert into app.opportunity_decisions (
        id, tenant_id, discovered_job_id, search_profile_id, disposition,
        qualification, reason, note, actor_id
      ) values (
        ${opportunityDecisionId}, ${tenantId}, ${discoveredJobId},
        ${searchProfileId}, 'saved', 'priority', 'strong_fit',
        'visible decision note', ${ownerId}
      )`;
      await transaction`insert into app.opportunity_decision_events (
        id, tenant_id, decision_id, discovered_job_id, search_profile_id,
        disposition, qualification, reason, note, revision, actor_id,
        idempotency_key, input_sha256, decision_created_at
      ) select
        ${opportunityDecisionEventId}, tenant_id, id, discovered_job_id,
        search_profile_id, disposition, qualification, reason, note, revision,
        actor_id, ${randomUUID()}, ${'d'.repeat(64)}, created_at
      from app.opportunity_decisions where id = ${opportunityDecisionId}`;
      await transaction`insert into app.semantic_analyses (
        id, tenant_id, version, schema_version, job_match_id,
        discovered_job_id, job_revision, search_profile_id,
        search_profile_revision, living_profile_id, living_profile_revision,
        input_hash, input, artifact, provider, model, provider_request_id,
        reserved_tokens, input_tokens, output_tokens, cost_micros, latency_ms
      ) values (
        ${semanticAnalysisId}, ${tenantId}, 1, 1, ${matchId},
        ${discoveredJobId}, 1, ${searchProfileId}, 1, ${profileId}, 1,
        ${'d'.repeat(64)}, '{"visible":true}'::jsonb,
        '{"visible":true}'::jsonb, 'openai-compatible-local', 'local-test',
        'visible-request-id', 20, 12, 4, 0, 7
      )`;
      await transaction`insert into app.opportunities (
        id, tenant_id, application_id, application_revision, company, role, raw_text,
        extraction_status
      ) values (
        ${opportunityId}, ${tenantId}, ${applicationId}, 1, 'Visible Co', 'Engineer',
        'visible opportunity', 'ready'
      )`;
      await transaction`insert into app.workflow_runs (
        id, tenant_id, opportunity_id, state, status, token_budget,
        cost_budget_micros, deadline_at
      ) values (
        ${runId}, ${tenantId}, ${opportunityId}, 'publication_ready', 'completed',
        100, 0, now() + interval '1 hour'
      )`;
      await transaction`insert into app.workflow_steps (
        id, tenant_id, workflow_run_id, stage, status, idempotency_key, lease_owner
      ) values (${stepId}, ${tenantId}, ${runId}, 'company_researcher', 'completed',
        ${randomUUID()}, ${secret})`;
      await transaction`insert into app.workflow_events (
        tenant_id, workflow_run_id, actor, event_type, summary
      ) values (${tenantId}, ${runId}, 'system', 'export_test', 'visible event')`;
      await transaction`insert into app.artifacts (
        tenant_id, workflow_run_id, kind, version, body, created_by
      ) values (${tenantId}, ${runId}, 'research', 1, '{"visible":true}', 'company_researcher')`;
      await transaction`insert into app.run_budget_reservations (
        tenant_id, workflow_run_id, idempotency_key, owner_id, requested_tokens,
        requested_cost_micros, lease_expires_at
      ) values (${tenantId}, ${runId}, ${randomUUID()}, ${workerOwnerSecret}, 10, 0,
        now() + interval '1 hour')`;
      await transaction`insert into app.model_usage (
        tenant_id, workflow_run_id, actor, provider, model, input_tokens,
        output_tokens, cost_micros, latency_ms, workflow_step_id
      ) values (${tenantId}, ${runId}, 'company_researcher', 'local', 'test',
        900719925, 1, 0, 1, ${stepId})`;
      await transaction`insert into app.page_specs (
        id, tenant_id, workflow_run_id, version, spec
      ) values (${pageSpecId}, ${tenantId}, ${runId}, 1, '{"blocks":[]}')`;
      await transaction.unsafe('set local session_replication_role = replica');
      await transaction`insert into app.publications (
        id, tenant_id, page_spec_id, publication_payload
      ) values (${publicationId}, ${tenantId}, ${pageSpecId}, '{"visible":true}')`;
      await transaction`insert into app.share_links (
        tenant_id, publication_id, token_hash, expires_at
      ) values (${tenantId}, ${publicationId}, digest(${secret}, 'sha256'),
        now() + interval '1 day')`;
      await transaction.unsafe('set local session_replication_role = origin');
      await transaction`insert into app.url_import_attempts (
        tenant_id, actor_id, status, finished_at
      ) values (${tenantId}, ${ownerId}, 'succeeded', now())`;
    });

    await assert.rejects(
      exportWorkspace({
        userId: memberId,
        tenantId,
        tenantName: 'Export workspace',
        sessionCreatedAt: new Date(),
      }),
      WorkspaceExportRejectedError,
    );
    await assert.rejects(
      exportWorkspace({
        userId: ownerId,
        tenantId,
        tenantName: 'Export workspace',
        sessionCreatedAt: new Date(Date.now() - 11 * 60_000),
      }),
      WorkspaceExportSessionNotFreshError,
    );

    const exported = await settleWithin(
      exportWorkspace({
        userId: ownerId,
        tenantId,
        tenantName: 'Export workspace',
        sessionCreatedAt: new Date(),
      }),
      2_000,
    );
    const text = await new Response(exported.body).text();
    assert.equal(text.includes(secret), false);
    assert.equal(text.includes(workerOwnerSecret), false);
    assert.equal(text.includes('token_hash'), false);
    assert.equal(text.includes('lease_owner'), false);
    assert.equal(text.includes('owner_id\":\"must-not-export'), false);
    const lines = text.trimEnd().split('\n');
    const records = lines.map((line) => JSON.parse(line));
    assert.equal(records[0].type, 'manifest');
    assert.equal(records[0].data.format, workspaceExportFormat);
    assert.equal(records[0].data.version, workspaceExportVersion);
    assert.equal(records.at(-1).type, 'complete');
    assert.equal(
      records.at(-1).data.sha256,
      createHash('sha256')
        .update(`${lines.slice(0, -1).join('\n')}\n`)
        .digest('hex'),
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'applications' &&
          record.data.id === applicationId &&
          record.data.deleted_at &&
          record.data.discovered_job_id === discoveredJobId,
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'application_timeline_events' &&
          record.data.id === applicationTimelineEventId &&
          record.data.title === 'Visible interview',
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'application_tasks' &&
          record.data.id === applicationTaskId &&
          record.data.kind === 'follow_up',
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'search_profiles' &&
          record.data.id === searchProfileId &&
          record.data.alert_threshold === 82 &&
          record.data.discovery_interval_hours === 12 &&
          !('discovery_lease_token' in record.data),
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'opportunity_decisions' &&
          record.data.id === opportunityDecisionId &&
          record.data.disposition === 'saved' &&
          record.data.qualification === 'priority',
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'opportunity_decision_events' &&
          record.data.id === opportunityDecisionEventId &&
          record.data.reason === 'strong_fit',
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'semantic_analyses' &&
          record.data.id === semanticAnalysisId &&
          record.data.job_match_id === matchId &&
          record.data.provider_request_id === 'visible-request-id' &&
          record.data.cost_micros === '0',
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'job_matches' &&
          record.data.id === matchId &&
          record.data.search_profile_id === searchProfileId &&
          record.data.decision === 'priority',
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'job_observations' &&
          record.data.id === observationId &&
          record.data.change_kind === 'first_seen',
      ),
      true,
    );
    const exportedApplication = records.find(
      (record) =>
        record.type === 'applications' && record.data.id === applicationId,
    );
    assert.match(exportedApplication.data.created_at, /\.\d{6}\+00$/);
    assert.equal(
      records.some(
        (record) =>
          record.type === 'discovered_jobs' &&
          record.data.id === discoveredJobId &&
          record.data.canonical_url ===
            'https://jobs.example.test/platform-engineer',
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'job_source_records' &&
          record.data.id === sourceRecordId &&
          record.data.content_sha256 === 'c'.repeat(64),
      ),
      true,
    );
    assert.equal(
      records.some(
        (record) =>
          record.type === 'share_links' && !('token_hash' in record.data),
      ),
      true,
    );
    assert.equal(
      records.some((record) => record.type === 'worker_heartbeats'),
      false,
    );

    const cancelled = await exportWorkspace({
      userId: ownerId,
      tenantId,
      tenantName: 'Export workspace',
      sessionCreatedAt: new Date(),
    });
    await cancelled.body.cancel();
    await waitForExportLockRelease(sql, tenantId);
    const afterCancellation = await exportWorkspace({
      userId: ownerId,
      tenantId,
      tenantName: 'Export workspace',
      sessionCreatedAt: new Date(),
    });
    assert.match(
      await new Response(afterCancellation.body).text(),
      /"type":"complete"/,
    );
  } finally {
    await sql`delete from app.tenants where id in (${tenantId}, ${otherTenantId})`;
    await sql`delete from auth.organization where id in (${tenantId}, ${otherTenantId})`;
    await sql`delete from auth."user" where id in (${ownerId}, ${memberId}, ${otherOwnerId})`;
    await sql`delete from auth.verification where identifier = ${ownerId}`;
    await sql.end();
  }
});

async function waitForExportLockRelease(
  sql: ReturnType<typeof postgres>,
  tenantId: string,
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [lock] = await sql<
      { acquired: boolean }[]
    >`select pg_try_advisory_lock(
        hashtextextended('workspace-export:' || ${tenantId}::text, 0)
      ) as acquired`;
    if (lock.acquired) {
      await sql`select pg_advisory_unlock(
        hashtextextended('workspace-export:' || ${tenantId}::text, 0)
      )`;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('cancelled export kept its transaction lock');
}

async function settleWithin<T>(promise: Promise<T>, milliseconds: number) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('export headers deadlocked')),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
