import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import { extractReadablePageText } from '../job-posting-extractor';
import { httpUrlSchema } from '../http-url';
import {
  COMPANY_RESEARCH_MAX_OUTPUT_TOKENS,
  LocalOpenAICompanyResearchClient,
  LocalModelClientError,
} from './local-openai-client';
import { SafeHttpError, safeFetchText, type SafeHttpResult } from './safe-http';
import { keepWorkerHeartbeatFresh } from './worker-heartbeat';

const STEP_LEASE_SECONDS = 300;

const sourceSchema = z
  .object({
    kind: z.literal('job-posting'),
    url: httpUrlSchema.optional(),
    trust: z.literal('untrusted-data'),
  })
  .strict();

const companySourceSchema = z
  .object({
    url: httpUrlSchema,
    origin: z.enum(['job-jsonld', 'api']),
  })
  .strict();

const stepInputV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    source: sourceSchema,
  })
  .strict();

const stepInputV2Schema = stepInputV1Schema
  .omit({ schemaVersion: true })
  .extend({
    schemaVersion: z.literal(2),
    companySources: z.array(companySourceSchema).max(3),
  })
  .strict()
  .refine(
    ({ companySources }) =>
      new Set(companySources.map(({ url }) => url)).size ===
      companySources.length,
    {
      path: ['companySources'],
      message: 'Company source URLs must be unique.',
    },
  );

const stepInputSchema = z.union([stepInputV2Schema, stepInputV1Schema]);

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const jobDocumentSchema = z
  .object({
    sourceId: z.literal('job-posting'),
    kind: z.literal('job'),
    origin: z.literal('application-snapshot'),
    contentHash: hashSchema,
    text: z.string().min(1).max(20_000),
  })
  .strict();
const companyDocumentSchema = z
  .object({
    sourceId: z.string().regex(/^company-[1-3]$/),
    kind: z.literal('company-web'),
    origin: z.enum(['job-jsonld', 'api']),
    requestedUrl: httpUrlSchema,
    finalUrl: httpUrlSchema,
    fetchedAt: z.string().datetime(),
    contentType: z.enum(['text/html', 'text/plain']),
    bytes: z.number().int().min(1).max(1_048_576),
    contentHash: hashSchema,
    text: z.string().min(1).max(20_000),
  })
  .strict();
const sourceFailureSchema = z
  .object({
    sourceId: z.string().regex(/^company-[1-3]$/),
    origin: z.enum(['job-jsonld', 'api']),
    requestedUrl: httpUrlSchema,
    code: z.enum([
      'blocked',
      'timeout',
      'too-large',
      'unsupported',
      'unavailable',
      'unusable-content',
    ]),
  })
  .strict();
const researchSourcesSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('company-research-sources'),
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    coverage: z.enum(['job-only', 'company-sourced']),
    documents: z
      .array(z.union([jobDocumentSchema, companyDocumentSchema]))
      .min(1)
      .max(4),
    failures: z.array(sourceFailureSchema).max(3),
  })
  .strict();

type ClaimedStep = {
  step_id: string;
  workflow_run_id: string;
  attempt: number;
  lease_token: string;
  input: unknown;
  input_hash: string;
  source_artifact_id: string | null;
  source_artifact_hash: string | null;
  source_artifact: unknown | null;
};

export async function processCompanyResearchStep(input: {
  databaseUrl: string;
  client: LocalOpenAICompanyResearchClient;
  fetchText?: (url: string) => Promise<SafeHttpResult>;
}) {
  const sql = postgres(input.databaseUrl, { max: 1, idle_timeout: 5 });
  let claimed: ClaimedStep | undefined;
  let dispatched = false;
  let stopHeartbeat: () => Promise<void> = async () => undefined;
  try {
    await verifyRestrictedWorkerCredential(sql);
    stopHeartbeat = keepWorkerHeartbeatFresh(() =>
      sql.begin(async (tx) => {
        await authorizeWorker(tx);
        await tx`select app.record_worker_heartbeat('company-researcher')`;
      }),
    );
    const reapedStepId = await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      await tx`select app.record_worker_heartbeat('company-researcher')`;
      const [result] = await tx<{ id: string | null }[]>`
        select app.reap_expired_company_researcher_step() as id`;
      return result.id;
    });
    if (reapedStepId)
      return { status: 'reaped' as const, stepId: reapedStepId };

    claimed = await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      const [step] = await tx<ClaimedStep[]>`
        select * from app.claim_company_researcher_step(
          ${STEP_LEASE_SECONDS}
        )`;
      return step;
    });
    if (!claimed) return { status: 'idle' as const };

    const stepInput = stepInputSchema.parse(claimed.input);
    const preparedSources = claimed.source_artifact
      ? researchSourcesSchema.parse(claimed.source_artifact)
      : await buildResearchSources(stepInput, input.fetchText ?? safeFetchText);
    const sourceArtifact = claimed.source_artifact_id
      ? {
          id: claimed.source_artifact_id,
          hash: hashSchema.parse(claimed.source_artifact_hash),
        }
      : await sql.begin(async (tx) => {
          await authorizeWorker(tx);
          const [stored] = await tx<
            Array<{ artifact_id: string; artifact_hash: string }>
          >`select * from app.prepare_company_researcher_sources(
            ${claimed!.step_id}, ${claimed!.lease_token},
            ${tx.json(preparedSources)}
          )`;
          return { id: stored.artifact_id, hash: stored.artifact_hash };
        });
    const offer = {
      schemaVersion: 2 as const,
      company: stepInput.company,
      role: stepInput.role,
      documents: preparedSources.documents.map(({ sourceId, kind, text }) => ({
        sourceId,
        kind,
        text,
      })),
    };
    const reservation = input.client.reserve(
      offer,
      COMPANY_RESEARCH_MAX_OUTPUT_TOKENS,
    );

    await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      await tx`select app.mark_company_researcher_in_flight(
        ${claimed!.step_id}, ${claimed!.lease_token}, ${input.client.provider},
        ${input.client.model}, ${reservation.tokens}, ${reservation.costMicros}
      )`;
    });
    dispatched = true;

    const result = await input.client.generate(offer, {
      maxOutputTokens: COMPANY_RESEARCH_MAX_OUTPUT_TOKENS,
    });
    const artifact = {
      schemaVersion: 2,
      company: stepInput.company,
      role: stepInput.role,
      sourceArtifactId: sourceArtifact.id,
      sourceArtifactHash: sourceArtifact.hash,
      coverage: preparedSources.coverage,
      sources: preparedSources.documents.map((document) => ({
        sourceId: document.sourceId,
        kind: document.kind,
        origin: document.origin,
        ...('finalUrl' in document ? { finalUrl: document.finalUrl } : {}),
        ...('fetchedAt' in document ? { fetchedAt: document.fetchedAt } : {}),
        contentHash: document.contentHash,
      })),
      signals: result.output.signals.map((signal) => ({
        ...signal,
        sourceId: z.string().min(1).max(200).parse(signal.sourceId),
      })),
    };
    const artifactId = await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      const [stored] = await tx<{ id: string }[]>`
        select app.complete_company_researcher_step(
          ${claimed!.step_id}, ${claimed!.lease_token}, ${tx.json(artifact)},
          ${result.usage.inputTokens}, ${result.usage.outputTokens},
          ${result.usage.costMicros}, ${result.usage.latencyMs}, false,
          ${result.providerRequestId ?? null}
        ) as id`;
      return stored.id;
    });
    return {
      status: 'completed' as const,
      runId: claimed.workflow_run_id,
      stepId: claimed.step_id,
      artifactId,
    };
  } catch (error) {
    if (!claimed) throw error;
    if (
      !dispatched &&
      (error instanceof z.ZodError ||
        (error instanceof LocalModelClientError &&
          error.code === 'INVALID_INPUT'))
    ) {
      await sql.begin(async (tx) => {
        await authorizeWorker(tx);
        await tx`select app.fail_company_researcher_step(
          ${claimed!.step_id}, ${claimed!.lease_token}, 'invalid_step_input'
        )`;
      });
      return {
        status: 'failed' as const,
        runId: claimed.workflow_run_id,
        stepId: claimed.step_id,
        failureCode: 'invalid_step_input' as const,
      };
    }
    if (!dispatched) throw error;
    await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      await tx`select app.fail_company_researcher_step(
        ${claimed!.step_id}, ${claimed!.lease_token}, 'provider_outcome_unknown'
      )`;
    });
    return {
      status: 'failed' as const,
      runId: claimed.workflow_run_id,
      stepId: claimed.step_id,
      failureCode: 'provider_outcome_unknown' as const,
    };
  } finally {
    await stopHeartbeat();
    await sql.end();
  }
}

async function buildResearchSources(
  stepInput: z.infer<typeof stepInputSchema>,
  fetchText: (url: string) => Promise<SafeHttpResult>,
) {
  const documents: Array<
    z.infer<typeof jobDocumentSchema> | z.infer<typeof companyDocumentSchema>
  > = [
    {
      sourceId: 'job-posting',
      kind: 'job',
      origin: 'application-snapshot',
      contentHash: sha256(stepInput.description),
      text: stepInput.description,
    },
  ];
  const failures: Array<z.infer<typeof sourceFailureSchema>> = [];
  const companySources =
    stepInput.schemaVersion === 2 ? stepInput.companySources : [];

  for (const [index, source] of companySources.entries()) {
    const sourceId = `company-${index + 1}`;
    try {
      const fetched = await fetchText(source.url);
      if (fetched.contentType === 'application/json') {
        failures.push({
          sourceId,
          origin: source.origin,
          requestedUrl: source.url,
          code: 'unusable-content',
        });
        continue;
      }
      const text = extractReadablePageText(fetched.text, fetched.contentType);
      if (!text) {
        failures.push({
          sourceId,
          origin: source.origin,
          requestedUrl: source.url,
          code: 'unusable-content',
        });
        continue;
      }
      documents.push({
        sourceId,
        kind: 'company-web',
        origin: source.origin,
        requestedUrl: source.url,
        finalUrl: fetched.finalUrl,
        fetchedAt: new Date().toISOString(),
        contentType: fetched.contentType,
        bytes: fetched.bytes,
        contentHash: sha256(text),
        text,
      });
    } catch (error) {
      failures.push({
        sourceId,
        origin: source.origin,
        requestedUrl: source.url,
        code: sourceFailureCode(error),
      });
    }
  }

  return researchSourcesSchema.parse({
    schemaVersion: 1,
    purpose: 'company-research-sources',
    company: stepInput.company,
    role: stepInput.role,
    coverage: documents.length > 1 ? 'company-sourced' : 'job-only',
    documents,
    failures,
  });
}

function sourceFailureCode(
  error: unknown,
): z.infer<typeof sourceFailureSchema>['code'] {
  if (!(error instanceof SafeHttpError)) return 'unavailable';
  switch (error.code) {
    case 'INVALID_URL':
    case 'BLOCKED_DESTINATION':
    case 'REDIRECT_REJECTED':
      return 'blocked';
    case 'TIMEOUT':
      return 'timeout';
    case 'RESPONSE_TOO_LARGE':
      return 'too-large';
    case 'UNSUPPORTED_CONTENT':
      return 'unsupported';
    case 'FETCH_FAILED':
      return 'unavailable';
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function verifyRestrictedWorkerCredential(sql: postgres.Sql) {
  const [identity] = await sql<
    Array<{
      database_owner: boolean;
      elevated: boolean;
      expected_role: boolean;
      has_data_access: boolean;
      has_sequence_access: boolean;
      has_function_access: boolean;
      schema_access: boolean;
      unexpected_role: boolean;
      target_database_owner: boolean;
      target_elevated: boolean;
      target_login: boolean;
      target_inherits: boolean;
      target_has_data_access: boolean;
      target_has_sequence_access: boolean;
      target_schema_create: boolean;
      target_app_usage: boolean;
      target_auth_access: boolean;
      target_unexpected_role: boolean;
      target_unexpected_function: boolean;
      target_missing_function: boolean;
    }>
  >`select
    database_owner.oid = login.oid as database_owner,
    login.rolsuper or login.rolcreatedb or login.rolcreaterole
      or login.rolreplication or login.rolbypassrls as elevated,
    pg_has_role(current_user, 'career_company_researcher', 'member')
      as expected_role,
    exists(
      select 1 from pg_namespace namespace
      where namespace.nspname in ('app', 'auth') and (
        has_schema_privilege(current_user, namespace.oid, 'usage')
        or has_schema_privilege(current_user, namespace.oid, 'create')
      )
    ) as schema_access,
    exists(
      select 1 from pg_roles inherited
      where inherited.rolname not in (current_user, 'career_company_researcher')
        and pg_has_role(current_user, inherited.oid, 'member')
    ) as unexpected_role,
    exists(
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('app', 'auth')
        and case when relation.relkind in ('r', 'p', 'v', 'm', 'f') then
          (
            has_table_privilege(
              current_user, relation.oid,
              'select,insert,update,delete,truncate,references,trigger'
            )
            or has_any_column_privilege(
              current_user, relation.oid, 'select,insert,update,references'
            )
          )
        else false end
    ) as has_data_access,
    exists(
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('app', 'auth')
        and case when relation.relkind = 'S' then
          has_sequence_privilege(
            current_user, relation.oid, 'usage,select,update'
          )
        else false end
    ) as has_sequence_access,
    exists(
      select 1 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('app', 'auth')
        and has_function_privilege(current_user, procedure.oid, 'execute')
    ) as has_function_access,
    database_owner.oid = target.oid as target_database_owner,
    target.rolsuper or target.rolcreatedb or target.rolcreaterole
      or target.rolreplication or target.rolbypassrls as target_elevated,
    target.rolcanlogin as target_login,
    target.rolinherit as target_inherits,
    has_schema_privilege(target.rolname, app_namespace.oid, 'create')
      as target_schema_create,
    has_schema_privilege(target.rolname, app_namespace.oid, 'usage')
      as target_app_usage,
    exists(
      select 1 from pg_namespace namespace
      where namespace.nspname = 'auth' and (
        has_schema_privilege(target.rolname, namespace.oid, 'usage')
        or has_schema_privilege(target.rolname, namespace.oid, 'create')
      )
    ) as target_auth_access,
    exists(
      select 1 from pg_roles inherited
      where inherited.rolname <> target.rolname
        and pg_has_role(target.oid, inherited.oid, 'member')
    ) as target_unexpected_role,
    exists(
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('app', 'auth')
        and case when relation.relkind in ('r', 'p', 'v', 'm', 'f') then
          (
            has_table_privilege(
              target.rolname, relation.oid,
              'select,insert,update,delete,truncate,references,trigger'
            )
            or has_any_column_privilege(
              target.rolname, relation.oid, 'select,insert,update,references'
            )
          )
        else false end
    ) as target_has_data_access,
    exists(
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('app', 'auth')
        and case when relation.relkind = 'S' then
          has_sequence_privilege(
            target.rolname, relation.oid, 'usage,select,update'
          )
        else false end
    ) as target_has_sequence_access,
    exists(
      select 1 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('app', 'auth')
        and has_function_privilege(target.rolname, procedure.oid, 'execute')
        and not (
          namespace.nspname = 'app'
          and (procedure.proname, pg_get_function_identity_arguments(procedure.oid)) in (
            ('claim_company_researcher_step', 'lease_seconds integer'),
            ('prepare_company_researcher_sources', 'target_step uuid, target_lease_token uuid, source_snapshot jsonb'),
            ('mark_company_researcher_in_flight', 'target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint'),
            ('complete_company_researcher_step', 'target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text'),
            ('fail_company_researcher_step', 'target_step uuid, target_lease_token uuid, target_failure_code text'),
            ('reap_expired_company_researcher_step', ''),
            ('record_worker_heartbeat', 'target_service text')
          )
        )
    ) as target_unexpected_function,
    (select count(*) <> 7 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'app'
        and has_function_privilege(target.rolname, procedure.oid, 'execute')
        and (procedure.proname, pg_get_function_identity_arguments(procedure.oid))
          in (
            ('claim_company_researcher_step', 'lease_seconds integer'),
            ('prepare_company_researcher_sources', 'target_step uuid, target_lease_token uuid, source_snapshot jsonb'),
            ('mark_company_researcher_in_flight', 'target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint'),
            ('complete_company_researcher_step', 'target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text'),
            ('fail_company_researcher_step', 'target_step uuid, target_lease_token uuid, target_failure_code text'),
            ('reap_expired_company_researcher_step', ''),
            ('record_worker_heartbeat', 'target_service text')
          )) as target_missing_function
  from pg_roles login
  join pg_database database_owner on database_owner.datname = current_database()
  join pg_namespace app_namespace on app_namespace.nspname = 'app'
  join pg_roles target on target.rolname = 'career_company_researcher'
  where login.rolname = current_user`;
  if (
    !identity ||
    identity.database_owner ||
    identity.elevated ||
    !identity.expected_role ||
    identity.has_data_access ||
    identity.has_sequence_access ||
    identity.has_function_access ||
    identity.schema_access ||
    identity.unexpected_role ||
    identity.target_database_owner ||
    identity.target_elevated ||
    identity.target_login ||
    identity.target_inherits ||
    identity.target_has_data_access ||
    identity.target_has_sequence_access ||
    identity.target_schema_create ||
    !identity.target_app_usage ||
    identity.target_auth_access ||
    identity.target_unexpected_role ||
    identity.target_unexpected_function ||
    identity.target_missing_function
  )
    throw new Error(
      'CAREER_OS_WORKER_DATABASE_URL must use the restricted company researcher login.',
    );
}

async function authorizeWorker(tx: postgres.TransactionSql) {
  await tx.unsafe('set local role career_company_researcher');
}
