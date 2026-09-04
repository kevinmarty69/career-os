import 'server-only';
import postgres from 'postgres';
import { z } from 'zod';
import {
  evaluateHardMatch,
  hardMatchCriterionSchema,
  hardMatchJobSchema,
  jobMatchRequestSchema,
  jobMatchSchema,
  type HardMatchJob,
  type JobMatch,
} from '../hard-match';
import {
  searchHardConstraintsSchema,
  searchProfileSchema,
  searchSoftPreferencesSchema,
  type SearchProfile,
} from '../search-profile';
import type { PublicationSession } from './publications';

export class DiscoveredJobNotFoundError extends Error {}
export class MatchSearchProfileNotFoundError extends Error {}

type JobRow = {
  id: string;
  company: string | null;
  role: string | null;
  location: string | null;
  remote_mode: HardMatchJob['remoteMode'];
  contract_type: HardMatchJob['contractType'];
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: HardMatchJob['salaryPeriod'];
  lifecycle: HardMatchJob['lifecycle'];
  revision: string;
};

type SearchProfileRow = {
  id: string;
  name: string;
  hard_constraints: unknown;
  soft_preferences: unknown;
  active: boolean;
  revision: string;
  created_at: Date;
  updated_at: Date;
};

type MatchRow = {
  id: string;
  discovered_job_id: string;
  job_revision: string;
  search_profile_id: string;
  search_profile_revision: string;
  living_profile_id: string | null;
  living_profile_revision: string | null;
  decision: 'priority' | 'ineligible';
  criteria: unknown;
  created_at: Date;
  updated_at: Date;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function createJobMatch(
  session: PublicationSession,
  rawJobId: string,
  rawInput: unknown,
): Promise<JobMatch> {
  const jobId = z.string().uuid().parse(rawJobId);
  const { searchProfileId } = jobMatchRequestSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [jobRow] = await tx<JobRow[]>`select ${jobColumns(tx)}
        from app.discovered_jobs where tenant_id = ${session.tenantId}
          and id = ${jobId} for share`;
      if (!jobRow) throw new DiscoveredJobNotFoundError();
      const [searchRow] = await tx<SearchProfileRow[]>`
        select ${searchColumns(tx)} from app.search_profiles
        where tenant_id = ${session.tenantId} and id = ${searchProfileId}
        for share`;
      if (!searchRow) throw new MatchSearchProfileNotFoundError();
      const [living] = await tx<{ id: string; revision: string }[]>`
        select profile.id, profile.revision from app.profiles profile
        join app.profile_revisions history
          on history.tenant_id = profile.tenant_id
          and history.profile_id = profile.id
          and history.revision = profile.revision
        where profile.tenant_id = ${session.tenantId}
          and profile.profile_kind = 'living'
        for share of profile`;
      const job = jobProjection(jobRow);
      const searchProfile = searchProjection(searchRow);
      const evaluation = evaluateHardMatch(job, searchProfile);
      const identity = [
        session.tenantId,
        job.opportunityId,
        job.revision,
        searchProfile.searchProfileId,
        searchProfile.revision,
        living?.id ?? 'none',
        living ? Number(living.revision) : 'none',
      ].join(':');
      await tx`select pg_advisory_xact_lock(hashtextextended(
        ${`job-match:${identity}`}, 0
      ))`;
      const inserted = await tx<MatchRow[]>`insert into app.job_matches (
        tenant_id, discovered_job_id, job_revision, search_profile_id,
        search_profile_revision, living_profile_id, living_profile_revision,
        decision, job_snapshot, search_profile_snapshot, criteria
      ) values (
        ${session.tenantId}, ${job.opportunityId}, ${job.revision},
        ${searchProfile.searchProfileId}, ${searchProfile.revision},
        ${living?.id ?? null}, ${living ? Number(living.revision) : null},
        ${evaluation.decision}, ${tx.json(job)}, ${tx.json(searchProfile)},
        ${tx.json(evaluation.criteria)}
      ) on conflict do nothing returning ${matchColumns(tx)}`;
      const row =
        inserted[0] ??
        (await readExactMatch(
          tx,
          session.tenantId,
          job,
          searchProfile,
          living,
        ));
      if (!row) throw new Error('The persisted hard match could not be read.');
      return matchProjection(row);
    });
  } finally {
    await sql.end();
  }
}

export async function readLatestJobMatch(
  session: PublicationSession,
  rawJobId: string,
  rawSearchProfileId: string,
): Promise<JobMatch | undefined> {
  const jobId = z.string().uuid().parse(rawJobId);
  const searchProfileId = z.string().uuid().parse(rawSearchProfileId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [row] = await tx<MatchRow[]>`select ${matchColumns(tx)}
        from app.job_matches where tenant_id = ${session.tenantId}
          and discovered_job_id = ${jobId}
          and search_profile_id = ${searchProfileId}
        order by created_at desc, id desc limit 1`;
      return row ? matchProjection(row) : undefined;
    });
  } finally {
    await sql.end();
  }
}

async function readExactMatch(
  tx: postgres.TransactionSql,
  tenantId: string,
  job: HardMatchJob,
  searchProfile: SearchProfile,
  living: { id: string; revision: string } | undefined,
) {
  const [row] = await tx<MatchRow[]>`select ${matchColumns(tx)}
    from app.job_matches where tenant_id = ${tenantId}
      and discovered_job_id = ${job.opportunityId}
      and job_revision = ${job.revision}
      and search_profile_id = ${searchProfile.searchProfileId}
      and search_profile_revision = ${searchProfile.revision}
      and living_profile_id is not distinct from ${living?.id ?? null}
      and living_profile_revision is not distinct from ${
        living ? Number(living.revision) : null
      }
    limit 1`;
  return row;
}

function jobProjection(row: JobRow) {
  return hardMatchJobSchema.parse({
    opportunityId: row.id,
    ...(row.company ? { company: row.company } : {}),
    ...(row.role ? { role: row.role } : {}),
    location: row.location,
    remoteMode: row.remote_mode,
    contractType: row.contract_type,
    salaryMin: money(row.salary_min),
    salaryMax: money(row.salary_max),
    salaryCurrency: row.salary_currency,
    salaryPeriod: row.salary_period,
    lifecycle: row.lifecycle,
    revision: Number(row.revision),
  });
}

function searchProjection(row: SearchProfileRow) {
  return searchProfileSchema.parse({
    searchProfileId: row.id,
    name: row.name,
    hardConstraints: searchHardConstraintsSchema.parse(row.hard_constraints),
    softPreferences: searchSoftPreferencesSchema.parse(row.soft_preferences),
    active: row.active,
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function matchProjection(row: MatchRow) {
  const criteria = z
    .array(hardMatchCriterionSchema)
    .length(11)
    .parse(row.criteria);
  const blockedCriteria = criteria
    .filter((criterion) => criterion.blocks)
    .map((criterion) => criterion.criterion);
  const decision = blockedCriteria.length ? 'ineligible' : 'priority';
  if (decision !== row.decision)
    throw new Error('Stored hard match decision does not match its criteria.');
  return jobMatchSchema.parse({
    matchId: row.id,
    opportunityId: row.discovered_job_id,
    jobRevision: Number(row.job_revision),
    searchProfileId: row.search_profile_id,
    searchProfileRevision: Number(row.search_profile_revision),
    livingProfile:
      row.living_profile_id && row.living_profile_revision
        ? {
            profileId: row.living_profile_id,
            revision: Number(row.living_profile_revision),
          }
        : null,
    evaluation: {
      decision,
      eligibleForPriority: decision === 'priority',
      criteria,
      blockedCriteria,
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function money(value: string | null) {
  return value === null ? null : Number(value);
}

function jobColumns(tx: postgres.TransactionSql) {
  return tx`id, company, role, location, remote_mode, contract_type,
    salary_min, salary_max, salary_currency, salary_period, lifecycle, revision`;
}

function searchColumns(tx: postgres.TransactionSql) {
  return tx`id, name, hard_constraints, soft_preferences, active, revision,
    created_at, updated_at`;
}

function matchColumns(tx: postgres.TransactionSql) {
  return tx`id, discovered_job_id, job_revision, search_profile_id,
    search_profile_revision, living_profile_id, living_profile_revision,
    decision, criteria, created_at, updated_at`;
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}
