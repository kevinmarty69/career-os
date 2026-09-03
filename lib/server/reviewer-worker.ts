import postgres from 'postgres';
import {
  buildFactualityReview,
  parseReviewerInput,
  type QualitativeReviewer,
  type Reviewer,
  type ReviewerOutput,
} from '../reviewer';
import {
  LocalOpenAIReviewClient,
  REVIEW_MAX_OUTPUT_TOKENS,
} from './local-openai-review-client';
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

type ReviewerWorkerInput =
  | {
      reviewer: QualitativeReviewer;
      databaseUrl: string;
      client: LocalOpenAIReviewClient;
    }
  | {
      reviewer: 'factuality';
      databaseUrl: string;
      client?: never;
    };

export async function processReviewerStep(input: ReviewerWorkerInput) {
  if (input.client && input.client.reviewer !== input.reviewer)
    throw new Error('Review client does not match the worker authority.');
  const sql = postgres(input.databaseUrl, { max: 1, idle_timeout: 5 });
  let claimed: ClaimedStep | undefined;
  let dispatched = false;
  let deterministicOutputBuilt = false;
  let stopHeartbeat: () => Promise<void> = async () => undefined;
  try {
    await verifyRestrictedWorkerCredential(sql, input.reviewer);
    stopHeartbeat = keepWorkerHeartbeatFresh(() =>
      sql.begin(async (tx) => {
        await authorizeWorker(tx, input.reviewer);
        await tx`select app.record_worker_heartbeat(${reviewerService(input.reviewer)})`;
      }),
    );
    const reapedStepId = await sql.begin(async (tx) => {
      await authorizeWorker(tx, input.reviewer);
      await tx`select app.record_worker_heartbeat(${reviewerService(input.reviewer)})`;
      return reapStep(tx, input.reviewer);
    });
    if (reapedStepId)
      return { status: 'reaped' as const, stepId: reapedStepId };

    claimed = await sql.begin(async (tx) => {
      await authorizeWorker(tx, input.reviewer);
      return claimStep(tx, input.reviewer);
    });
    if (!claimed) return { status: 'idle' as const };

    let parsedInput: ReturnType<typeof parseReviewerInput>;
    try {
      parsedInput = parseReviewerInput(claimed.input, input.reviewer);
    } catch {
      await failInvalidInput(sql, input.reviewer, claimed);
      return failedResult(claimed, 'invalid_step_input');
    }

    if (input.reviewer === 'factuality') {
      let output: ReviewerOutput;
      try {
        output = buildFactualityReview(parsedInput);
        deterministicOutputBuilt = true;
      } catch {
        await failInvalidInput(sql, input.reviewer, claimed);
        return failedResult(claimed, 'invalid_step_input');
      }
      const artifactId = await sql.begin(async (tx) => {
        await authorizeWorker(tx, input.reviewer);
        return completeFactualityStep(tx, claimed!, output);
      });
      return completedResult(claimed, artifactId);
    }

    if (parsedInput.reviewer === 'factuality')
      throw new Error('Qualitative reviewer received factuality input.');
    let reservation: ReturnType<LocalOpenAIReviewClient['reserve']>;
    try {
      reservation = input.client.reserve(parsedInput, REVIEW_MAX_OUTPUT_TOKENS);
    } catch {
      await failInvalidInput(sql, input.reviewer, claimed);
      return failedResult(claimed, 'invalid_step_input');
    }
    await sql.begin(async (tx) => {
      await authorizeWorker(tx, input.reviewer);
      await markInFlight(
        tx,
        input.reviewer,
        claimed!,
        input.client,
        reservation,
      );
    });
    dispatched = true;

    const generated = await input.client.generate(parsedInput, {
      maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
    });
    const artifactId = await sql.begin(async (tx) => {
      await authorizeWorker(tx, input.reviewer);
      return completeQualitativeStep(tx, input.reviewer, claimed!, generated);
    });
    return completedResult(claimed, artifactId);
  } catch (error) {
    if (!claimed || (!dispatched && !deterministicOutputBuilt)) throw error;
    if (dispatched) {
      try {
        await sql.begin(async (tx) => {
          await authorizeWorker(tx, input.reviewer);
          await failStep(
            tx,
            input.reviewer,
            claimed!,
            'provider_outcome_unknown',
          );
        });
      } catch {
        throw error;
      }
      return failedResult(claimed, 'provider_outcome_unknown');
    }
    throw error;
  } finally {
    await stopHeartbeat();
    await sql.end();
  }
}

async function failInvalidInput(
  sql: postgres.Sql,
  reviewer: Reviewer,
  step: ClaimedStep,
) {
  await sql.begin(async (tx) => {
    await authorizeWorker(tx, reviewer);
    await failStep(tx, reviewer, step, 'invalid_step_input');
  });
}

async function claimStep(
  tx: postgres.TransactionSql,
  reviewer: Reviewer,
): Promise<ClaimedStep | undefined> {
  if (reviewer === 'recruiter') {
    const [step] = await tx<ClaimedStep[]>`
      select * from app.claim_recruiter_reviewer_step(${STEP_LEASE_SECONDS})`;
    return step;
  }
  if (reviewer === 'hiring-manager') {
    const [step] = await tx<ClaimedStep[]>`
      select * from app.claim_hiring_manager_reviewer_step(${STEP_LEASE_SECONDS})`;
    return step;
  }
  const [step] = await tx<ClaimedStep[]>`
    select * from app.claim_factuality_reviewer_step(${STEP_LEASE_SECONDS})`;
  return step;
}

async function reapStep(tx: postgres.TransactionSql, reviewer: Reviewer) {
  if (reviewer === 'recruiter') {
    const [result] = await tx<{ id: string | null }[]>`
      select app.reap_expired_recruiter_reviewer_step() as id`;
    return result.id;
  }
  if (reviewer === 'hiring-manager') {
    const [result] = await tx<{ id: string | null }[]>`
      select app.reap_expired_hiring_manager_reviewer_step() as id`;
    return result.id;
  }
  const [result] = await tx<{ id: string | null }[]>`
    select app.reap_expired_factuality_reviewer_step() as id`;
  return result.id;
}

async function markInFlight(
  tx: postgres.TransactionSql,
  reviewer: QualitativeReviewer,
  step: ClaimedStep,
  client: LocalOpenAIReviewClient,
  reservation: { tokens: number; costMicros: 0 },
) {
  if (reviewer === 'recruiter') {
    await tx`select app.mark_recruiter_reviewer_in_flight(
      ${step.step_id}, ${step.lease_token}, ${client.provider}, ${client.model},
      ${reservation.tokens}, ${reservation.costMicros}
    )`;
    return;
  }
  await tx`select app.mark_hiring_manager_reviewer_in_flight(
    ${step.step_id}, ${step.lease_token}, ${client.provider}, ${client.model},
    ${reservation.tokens}, ${reservation.costMicros}
  )`;
}

async function completeQualitativeStep(
  tx: postgres.TransactionSql,
  reviewer: QualitativeReviewer,
  step: ClaimedStep,
  result: Awaited<ReturnType<LocalOpenAIReviewClient['generate']>>,
) {
  const parameters = [
    result.usage.inputTokens,
    result.usage.outputTokens,
    result.usage.costMicros,
    result.usage.latencyMs,
    false,
    result.providerRequestId ?? null,
  ] as const;
  if (reviewer === 'recruiter') {
    const [stored] = await tx<{ id: string }[]>`
      select app.complete_recruiter_reviewer_step(
        ${step.step_id}, ${step.lease_token}, ${tx.json(result.output)},
        ${parameters[0]}, ${parameters[1]}, ${parameters[2]}, ${parameters[3]},
        ${parameters[4]}, ${parameters[5]}
      ) as id`;
    return stored.id;
  }
  const [stored] = await tx<{ id: string }[]>`
    select app.complete_hiring_manager_reviewer_step(
      ${step.step_id}, ${step.lease_token}, ${tx.json(result.output)},
      ${parameters[0]}, ${parameters[1]}, ${parameters[2]}, ${parameters[3]},
      ${parameters[4]}, ${parameters[5]}
    ) as id`;
  return stored.id;
}

async function completeFactualityStep(
  tx: postgres.TransactionSql,
  step: ClaimedStep,
  output: ReviewerOutput,
) {
  const [stored] = await tx<{ id: string }[]>`
    select app.complete_factuality_reviewer_step(
      ${step.step_id}, ${step.lease_token}, ${tx.json(output)}
    ) as id`;
  return stored.id;
}

async function failStep(
  tx: postgres.TransactionSql,
  reviewer: Reviewer,
  step: ClaimedStep,
  failureCode: string,
) {
  if (reviewer === 'recruiter') {
    await tx`select app.fail_recruiter_reviewer_step(
      ${step.step_id}, ${step.lease_token}, ${failureCode}
    )`;
    return;
  }
  if (reviewer === 'hiring-manager') {
    await tx`select app.fail_hiring_manager_reviewer_step(
      ${step.step_id}, ${step.lease_token}, ${failureCode}
    )`;
    return;
  }
  await tx`select app.fail_factuality_reviewer_step(
    ${step.step_id}, ${step.lease_token}, ${failureCode}
  )`;
}

async function verifyRestrictedWorkerCredential(
  sql: postgres.Sql,
  reviewer: Reviewer,
) {
  const authority = reviewerAuthority(reviewer);
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
      executable_functions: string[];
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
        when relation.relkind = 'S' then has_sequence_privilege(
          target.rolname, relation.oid, 'usage,select,update'
        ) else false end
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
    coalesce((
      select array_agg(
        procedure.proname || '(' ||
        pg_get_function_identity_arguments(procedure.oid) || ')'
        order by procedure.proname,
          pg_get_function_identity_arguments(procedure.oid)
      )
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('app', 'auth')
        and has_function_privilege(target.rolname, procedure.oid, 'execute')
    ), array[]::text[]) as executable_functions
  from pg_roles login
  join pg_database database_owner on database_owner.datname = current_database()
  join pg_namespace app_namespace on app_namespace.nspname = 'app'
  join pg_roles target on target.rolname = ${authority.role}
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
    !sameStrings(identity.executable_functions, authority.functions)
  )
    throw new Error(
      `Reviewer database URL must use the restricted ${reviewer} reviewer login.`,
    );
}

async function authorizeWorker(
  tx: postgres.TransactionSql,
  reviewer: Reviewer,
) {
  await tx.unsafe(`set local role ${reviewerAuthority(reviewer).role}`);
}

function reviewerAuthority(reviewer: Reviewer) {
  if (reviewer === 'recruiter')
    return {
      role: 'career_recruiter_reviewer',
      functions: [
        'claim_recruiter_reviewer_step(lease_seconds integer)',
        'complete_recruiter_reviewer_step(target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text)',
        'fail_recruiter_reviewer_step(target_step uuid, target_lease_token uuid, target_failure_code text)',
        'mark_recruiter_reviewer_in_flight(target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint)',
        'reap_expired_recruiter_reviewer_step()',
        'record_worker_heartbeat(target_service text)',
      ],
    } as const;
  if (reviewer === 'hiring-manager')
    return {
      role: 'career_hiring_manager_reviewer',
      functions: [
        'claim_hiring_manager_reviewer_step(lease_seconds integer)',
        'complete_hiring_manager_reviewer_step(target_step uuid, target_lease_token uuid, step_output jsonb, actual_input_tokens integer, actual_output_tokens integer, actual_cost bigint, actual_latency integer, was_cache_hit boolean, request_id text)',
        'fail_hiring_manager_reviewer_step(target_step uuid, target_lease_token uuid, target_failure_code text)',
        'mark_hiring_manager_reviewer_in_flight(target_step uuid, target_lease_token uuid, target_provider text, target_model text, reserve_tokens integer, reserve_cost bigint)',
        'reap_expired_hiring_manager_reviewer_step()',
        'record_worker_heartbeat(target_service text)',
      ],
    } as const;
  return {
    role: 'career_factuality_reviewer',
    functions: [
      'claim_factuality_reviewer_step(lease_seconds integer)',
      'complete_factuality_reviewer_step(target_step uuid, target_lease_token uuid, step_output jsonb)',
      'fail_factuality_reviewer_step(target_step uuid, target_lease_token uuid, target_failure_code text)',
      'reap_expired_factuality_reviewer_step()',
      'record_worker_heartbeat(target_service text)',
    ],
  } as const;
}

function reviewerService(reviewer: Reviewer) {
  if (reviewer === 'recruiter') return 'recruiter-reviewer';
  if (reviewer === 'hiring-manager') return 'hiring-manager-reviewer';
  return 'factuality-reviewer';
}

function sameStrings(actual: string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    [...actual]
      .sort()
      .every((value, index) => value === [...expected].sort()[index])
  );
}

function completedResult(step: ClaimedStep, artifactId: string) {
  return {
    status: 'completed' as const,
    runId: step.workflow_run_id,
    stepId: step.step_id,
    artifactId,
  };
}

function failedResult(step: ClaimedStep, failureCode: string) {
  return {
    status: 'failed' as const,
    runId: step.workflow_run_id,
    stepId: step.step_id,
    failureCode,
  };
}
