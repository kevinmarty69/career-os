import 'server-only';
import postgres from 'postgres';
import {
  discoverSearchProfile,
  emptyDiscoverySummary,
  type DiscoverySummary,
} from '../job-discovery';
import { searchProfileSchema, type SearchProfile } from '../search-profile';
import { storeDiscoveredJob } from './discovered-jobs';
import { safeFetchText } from './safe-http';
import type { PublicationSession } from './publications';

const LEASE_MINUTES = 5;
const RETRY_MINUTES = 15;

type ClaimRow = {
  search_profile_id: string;
  tenant_id: string;
  owner_id: string;
  tenant_name: string;
  profile: unknown;
  lease_token: string;
};

type DiscoveryClaim = {
  token: string;
  profile: SearchProfile;
  session: PublicationSession;
};

export async function processScheduledDiscoveryStep({
  databaseUrl,
}: {
  databaseUrl: string;
}) {
  const sql = postgres(databaseUrl, { max: 2, idle_timeout: 5 });
  try {
    await verifyRestrictedCredential(sql);
    const claim = await claimProfile(sql);
    if (!claim) return { status: 'idle' as const };
    try {
      const summary = await discoverSearchProfile(
        claim.profile,
        claim.session,
        safeFetchText,
        (session, input) =>
          storeDiscoveredJob(session, input, {
            databaseUrl,
            discoveryLeaseToken: claim.token,
          }),
      );
      const outcome =
        summary.failedBoards === 0
          ? 'succeeded'
          : summary.failedBoards === summary.boards
            ? 'failed'
            : 'partial';
      await finishProfile(sql, claim, outcome, summary);
      return { status: 'processed' as const, outcome, ...summary };
    } catch {
      await finishProfile(sql, claim, 'failed', emptyDiscoverySummary());
      return { status: 'processed' as const, outcome: 'failed' as const };
    }
  } finally {
    await sql.end();
  }
}

async function claimProfile(sql: postgres.Sql): Promise<DiscoveryClaim | null> {
  return sql.begin(async (tx) => {
    await authorizeWorker(tx);
    const [row] = await tx<ClaimRow[]>`
      select * from app.claim_scheduled_job_discovery(${LEASE_MINUTES * 60})`;
    if (!row) return null;
    return {
      token: row.lease_token,
      profile: searchProfileSchema.parse(row.profile),
      session: {
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        userId: row.owner_id,
      },
    };
  });
}

async function finishProfile(
  sql: postgres.Sql,
  claim: DiscoveryClaim,
  status: 'succeeded' | 'partial' | 'failed',
  summary: DiscoverySummary,
) {
  await sql.begin(async (tx) => {
    await authorizeWorker(tx);
    const [result] = await tx<{ completed: boolean }[]>`
      select app.complete_scheduled_job_discovery(
        ${claim.profile.searchProfileId}, ${claim.token}, ${status},
        ${tx.json(summary)}, ${RETRY_MINUTES}
      ) as completed`;
    if (!result?.completed) throw new Error('Discovery lease expired.');
  });
}

async function verifyRestrictedCredential(sql: postgres.Sql) {
  const [identity] = await sql<
    {
      databaseOwner: boolean;
      elevated: boolean;
      expectedRole: boolean;
      unexpectedRole: boolean;
      loginAccess: boolean;
      targetUnsafe: boolean;
    }[]
  >`select
    database_owner.oid = login.oid as "databaseOwner",
    login.rolsuper or login.rolcreatedb or login.rolcreaterole
      or login.rolreplication or login.rolbypassrls as elevated,
    pg_has_role(current_user, 'career_job_discovery', 'member') as "expectedRole",
    exists(
      select 1 from pg_roles inherited
      where inherited.rolname not in (current_user, 'career_job_discovery')
        and pg_has_role(current_user, inherited.oid, 'member')
    ) as "unexpectedRole",
    exists(
      select 1 from pg_namespace namespace
      where namespace.nspname in ('app', 'auth') and (
        has_schema_privilege(current_user, namespace.oid, 'usage')
        or has_schema_privilege(current_user, namespace.oid, 'create')
      )
    ) as "loginAccess",
    target.rolsuper or target.rolcreatedb or target.rolcreaterole
      or target.rolreplication or target.rolbypassrls or target.rolcanlogin
      or target.rolinherit
      or has_schema_privilege(target.rolname, app_namespace.oid, 'create')
      or not has_schema_privilege(target.rolname, app_namespace.oid, 'usage')
      or exists(
        select 1 from pg_roles inherited
        where inherited.rolname <> target.rolname
          and pg_has_role(target.oid, inherited.oid, 'member')
      )
      or exists(
        select 1 from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname in ('app', 'auth')
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
          and (
            (
              (namespace.nspname <> 'app' or relation.relname not in (
                'discovered_jobs', 'job_source_records', 'job_observations'
              ))
              and has_table_privilege(
                target.rolname, relation.oid,
                'select,insert,update,delete,truncate,references,trigger'
              )
            )
            or (
              namespace.nspname = 'app' and relation.relname in (
                'discovered_jobs', 'job_source_records', 'job_observations'
              )
              and (
                not has_table_privilege(
                  target.rolname, relation.oid, 'select,insert,update'
                )
                or has_table_privilege(
                  target.rolname, relation.oid,
                  'delete,truncate,references,trigger'
                )
              )
            )
          )
      )
      or exists(
        select 1 from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname in ('app', 'auth')
          and has_function_privilege(target.rolname, procedure.oid, 'execute')
          and (procedure.proname, pg_get_function_identity_arguments(procedure.oid))
            not in (
              ('claim_scheduled_job_discovery', 'lease_seconds integer'),
              ('complete_scheduled_job_discovery', 'target_profile uuid, target_lease_token uuid, target_status text, target_summary jsonb, retry_minutes integer'),
              ('active_job_discovery_lease', 'target_tenant uuid')
            )
      )
      or (select count(*) <> 3 from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'app'
          and has_function_privilege(target.rolname, procedure.oid, 'execute')
      ) as "targetUnsafe"
  from pg_roles login
  join pg_database database_owner on database_owner.datname = current_database()
  join pg_roles target on target.rolname = 'career_job_discovery'
  join pg_namespace app_namespace on app_namespace.nspname = 'app'
  where login.rolname = current_user`;
  if (
    !identity ||
    identity.databaseOwner ||
    identity.elevated ||
    !identity.expectedRole ||
    identity.unexpectedRole ||
    identity.loginAccess ||
    identity.targetUnsafe
  )
    throw new Error(
      'CAREER_OS_DISCOVERY_DATABASE_URL must use the restricted job discovery login.',
    );
}

async function authorizeWorker(tx: postgres.TransactionSql) {
  await tx.unsafe('set local role career_job_discovery');
}
