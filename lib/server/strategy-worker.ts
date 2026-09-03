import postgres from 'postgres';
import { parseRecruiterStrategyInput } from '../recruiter-strategy';
import {
  LocalOpenAIRecruiterStrategyClient,
  RECRUITER_STRATEGY_MAX_OUTPUT_TOKENS,
} from './local-openai-strategy-client';
import { keepWorkerHeartbeatFresh } from './worker-heartbeat';

const STEP_LEASE_SECONDS = 300;

type ClaimedStep = {
  step_id: string;
  workflow_run_id: string;
  attempt: number;
  lease_token: string;
  input: unknown;
  input_hash: string;
};

export async function processRecruiterStrategyStep(input: {
  databaseUrl: string;
  client: LocalOpenAIRecruiterStrategyClient;
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
        await tx`select app.record_worker_heartbeat('recruiter-strategist')`;
      }),
    );
    const reapedStepId = await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      await tx`select app.record_worker_heartbeat('recruiter-strategist')`;
      const [result] = await tx<{ id: string | null }[]>`
        select app.reap_expired_recruiter_strategist_step() as id`;
      return result.id;
    });
    if (reapedStepId)
      return { status: 'reaped' as const, stepId: reapedStepId };

    claimed = await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      const [step] = await tx<ClaimedStep[]>`
        select * from app.claim_recruiter_strategist_step(${STEP_LEASE_SECONDS})`;
      return step;
    });
    if (!claimed) return { status: 'idle' as const };

    let strategyInput: ReturnType<typeof parseRecruiterStrategyInput>;
    let reservation: ReturnType<LocalOpenAIRecruiterStrategyClient['reserve']>;
    try {
      strategyInput = parseRecruiterStrategyInput(claimed.input);
      reservation = input.client.reserve(
        strategyInput,
        RECRUITER_STRATEGY_MAX_OUTPUT_TOKENS,
      );
    } catch {
      await sql.begin(async (tx) => {
        await authorizeWorker(tx);
        await tx`select app.fail_recruiter_strategist_step(
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
    await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      await tx`select app.mark_recruiter_strategist_in_flight(
        ${claimed!.step_id}, ${claimed!.lease_token}, ${input.client.provider},
        ${input.client.model}, ${reservation.tokens}, ${reservation.costMicros}
      )`;
    });
    dispatched = true;

    const result = await input.client.generate(strategyInput, {
      maxOutputTokens: RECRUITER_STRATEGY_MAX_OUTPUT_TOKENS,
    });
    const artifactId = await sql.begin(async (tx) => {
      await authorizeWorker(tx);
      const [stored] = await tx<{ id: string }[]>`
        select app.complete_recruiter_strategist_step(
          ${claimed!.step_id}, ${claimed!.lease_token}, ${tx.json(result.output)},
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
      await tx`select app.fail_recruiter_strategist_step(
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

async function verifyRestrictedWorkerCredential(sql: postgres.Sql) {
  const [identity] = await sql<
    Array<{
      login_safe: boolean;
      expected_role: boolean;
      login_has_access: boolean;
      login_unexpected_role: boolean;
      target_safe: boolean;
      target_has_data_access: boolean;
      target_has_sequence_access: boolean;
      target_schema_create: boolean;
      target_app_usage: boolean;
      target_auth_access: boolean;
      target_unexpected_role: boolean;
      target_unexpected_function: boolean;
      target_function_count: number;
    }>
  >`select
    not (database_owner.oid = login.oid or login.rolsuper or login.rolcreatedb
      or login.rolcreaterole or login.rolreplication or login.rolbypassrls)
      as login_safe,
    pg_has_role(current_user, target.oid, 'member') as expected_role,
    exists (
      select 1 from pg_namespace namespace
      where namespace.nspname in ('app', 'auth') and (
        has_schema_privilege(current_user, namespace.oid, 'usage')
        or has_schema_privilege(current_user, namespace.oid, 'create')
      )
    ) or exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('app', 'auth') and case
        when relation.relkind in ('r', 'p', 'v', 'm', 'f') then
          has_table_privilege(current_user, relation.oid,
            'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege(
            current_user, relation.oid, 'select,insert,update,references'
          )
        when relation.relkind = 'S' then
          has_sequence_privilege(current_user, relation.oid, 'usage,select,update')
        else false end
    ) or exists (
      select 1 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('app', 'auth')
        and has_function_privilege(current_user, procedure.oid, 'execute')
    ) as login_has_access,
    exists (
      select 1 from pg_roles inherited
      where inherited.rolname not in (current_user, target.rolname)
        and pg_has_role(login.oid, inherited.oid, 'member')
    ) as login_unexpected_role,
    not (database_owner.oid = target.oid or target.rolsuper or target.rolcreatedb
      or target.rolcreaterole or target.rolreplication or target.rolbypassrls
      or target.rolcanlogin or target.rolinherit) as target_safe,
    exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('app', 'auth')
        and relation.relkind in ('r', 'p', 'v', 'm', 'f')
        and (has_table_privilege(target.rolname, relation.oid,
          'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege(
            target.rolname, relation.oid, 'select,insert,update,references'
          ))
    ) as target_has_data_access,
    exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('app', 'auth') and case
        when relation.relkind = 'S' then
          has_sequence_privilege(target.rolname, relation.oid, 'usage,select,update')
        else false end
    ) as target_has_sequence_access,
    has_schema_privilege(target.rolname, app_namespace.oid, 'create')
      as target_schema_create,
    has_schema_privilege(target.rolname, app_namespace.oid, 'usage')
      as target_app_usage,
    exists (
      select 1 from pg_namespace namespace where namespace.nspname = 'auth'
        and (has_schema_privilege(target.rolname, namespace.oid, 'usage')
          or has_schema_privilege(target.rolname, namespace.oid, 'create'))
    ) as target_auth_access,
    exists (
      select 1 from pg_roles inherited
      where inherited.rolname <> target.rolname
        and pg_has_role(target.oid, inherited.oid, 'member')
    ) as target_unexpected_role,
    exists (
      select 1 from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('app', 'auth')
        and has_function_privilege(target.rolname, procedure.oid, 'execute')
        and not (namespace.nspname = 'app' and
          (procedure.proname, pg_get_function_identity_arguments(procedure.oid)) in (
            ('claim_recruiter_strategist_step', 'lease_seconds integer'),
            ('mark_recruiter_strategist_in_flight', 'target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint'),
            ('complete_recruiter_strategist_step', 'target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text'),
            ('fail_recruiter_strategist_step', 'target_step uuid, target_lease_token uuid, target_failure_code text'),
            ('reap_expired_recruiter_strategist_step', ''),
            ('record_worker_heartbeat', 'target_service text')
          ))
    ) as target_unexpected_function,
    (select count(*)::integer from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'app'
        and has_function_privilege(target.rolname, procedure.oid, 'execute')
        and (procedure.proname, pg_get_function_identity_arguments(procedure.oid)) in (
          ('claim_recruiter_strategist_step', 'lease_seconds integer'),
          ('mark_recruiter_strategist_in_flight', 'target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint'),
          ('complete_recruiter_strategist_step', 'target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text'),
          ('fail_recruiter_strategist_step', 'target_step uuid, target_lease_token uuid, target_failure_code text'),
          ('reap_expired_recruiter_strategist_step', ''),
          ('record_worker_heartbeat', 'target_service text')
        )) as target_function_count
  from pg_roles login
  join pg_database database_owner on database_owner.datname = current_database()
  join pg_namespace app_namespace on app_namespace.nspname = 'app'
  join pg_roles target on target.rolname = 'career_recruiter_strategist'
  where login.rolname = current_user`;
  if (
    !identity?.login_safe ||
    !identity.expected_role ||
    identity.login_has_access ||
    identity.login_unexpected_role ||
    !identity.target_safe ||
    identity.target_has_data_access ||
    identity.target_has_sequence_access ||
    identity.target_schema_create ||
    !identity.target_app_usage ||
    identity.target_auth_access ||
    identity.target_unexpected_role ||
    identity.target_unexpected_function ||
    identity.target_function_count !== 6
  )
    throw new Error(
      'CAREER_OS_STRATEGY_WORKER_DATABASE_URL must use the restricted recruiter strategist login.',
    );
}

async function authorizeWorker(tx: postgres.TransactionSql) {
  await tx.unsafe('set local role career_recruiter_strategist');
}
