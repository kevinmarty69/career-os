import postgres from 'postgres';
import { z } from 'zod';
import {
  COMPANY_RESEARCH_MAX_OUTPUT_TOKENS,
  LocalOpenAICompanyResearchClient,
} from './local-openai-client';

const STEP_LEASE_SECONDS = 300;

const stepInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    source: z
      .object({
        kind: z.literal('job-posting'),
        url: z.string().url().max(2_048).optional(),
        trust: z.literal('untrusted-data'),
      })
      .strict(),
  })
  .strict();

type ClaimedStep = {
  step_id: string;
  workflow_run_id: string;
  attempt: number;
  lease_token: string;
  input: unknown;
  input_hash: string;
};

export async function processCompanyResearchStep(input: {
  databaseUrl: string;
  client: LocalOpenAICompanyResearchClient;
}) {
  const sql = postgres(input.databaseUrl, { max: 1, idle_timeout: 5 });
  let claimed: ClaimedStep | undefined;
  let dispatched = false;
  try {
    await verifyRestrictedWorkerCredential(sql);
    const reapedStepId = await sql.begin(async (tx) => {
      await authorizeWorker(tx);
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
    const offer = {
      company: stepInput.company,
      role: stepInput.role,
      description: stepInput.description,
      ...(stepInput.source.url ? { sourceUrl: stepInput.source.url } : {}),
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
      company: stepInput.company,
      role: stepInput.role,
      signals: result.output.signals,
      source: stepInput.source,
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
    if (!claimed || !dispatched) throw error;
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
    await sql.end();
  }
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
            ('mark_company_researcher_in_flight', 'target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint'),
            ('complete_company_researcher_step', 'target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text'),
            ('fail_company_researcher_step', 'target_step uuid, target_lease_token uuid, target_failure_code text'),
            ('reap_expired_company_researcher_step', '')
          )
        )
    ) as target_unexpected_function,
    (select count(*) <> 5 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'app'
        and has_function_privilege(target.rolname, procedure.oid, 'execute')
        and (procedure.proname, pg_get_function_identity_arguments(procedure.oid))
          in (
            ('claim_company_researcher_step', 'lease_seconds integer'),
            ('mark_company_researcher_in_flight', 'target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint'),
            ('complete_company_researcher_step', 'target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text'),
            ('fail_company_researcher_step', 'target_step uuid, target_lease_token uuid, target_failure_code text'),
            ('reap_expired_company_researcher_step', '')
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
