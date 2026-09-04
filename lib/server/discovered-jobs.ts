import 'server-only';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import {
  discoveredJobPersistenceInputSchema,
  discoveredJobSchema,
  type DiscoveredJob,
  type DiscoveredJobPersistenceInput,
} from '../discovered-job-contract';
import type { PublicationSession } from './publications';

type JobRow = {
  id: string;
  company: string | null;
  role: string | null;
  description: string | null;
  canonical_url: string;
  location: string | null;
  remote_mode: 'unknown' | 'onsite' | 'hybrid' | 'remote';
  contract_type:
    | 'unknown'
    | 'full_time'
    | 'part_time'
    | 'internship'
    | 'contract'
    | 'temporary';
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: 'unknown' | 'year' | 'month' | 'hour';
  published_at: Date | null;
  external_id: string | null;
  source_kind: 'generic_html' | 'greenhouse' | 'ashby';
  lifecycle: 'open' | 'changed' | 'closed' | 'reposted';
  fingerprint: string | null;
  revision: string;
  first_seen_at: Date;
  last_seen_at: Date;
};

type SourceRow = {
  id: string;
  requested_url: string;
  final_url: string;
  fetched_url: string;
  source_kind: 'generic_html' | 'greenhouse' | 'ashby';
  external_id: string | null;
  matched_by: 'new' | 'exact_source' | 'canonical_url' | 'fingerprint';
  fetched_at: Date;
  content_type: 'text/html' | 'text/plain' | 'application/json';
  bytes: number;
  content_sha256: string;
  trust: 'untrusted-data';
};

type ObservationRow = {
  id: string;
  source_record_id: string;
  observed_at: Date;
  content_sha256: string;
  change_kind: 'first_seen' | 'unchanged' | 'changed' | 'closed' | 'reposted';
  lifecycle_signal: 'unknown' | 'open' | 'closed';
  matched_by: 'new' | 'exact_source' | 'canonical_url' | 'fingerprint';
  normalized: unknown;
};

function database(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export function discoveredJobFingerprint(
  input: Pick<DiscoveredJobPersistenceInput, 'extraction' | 'normalized'>,
) {
  const parts = [
    input.extraction.company,
    input.extraction.role,
    input.normalized.location,
  ].map(normalizeFingerprintPart);
  if (parts.some((part) => !part)) return null;
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

export async function storeDiscoveredJob(
  session: PublicationSession,
  rawInput: unknown,
  options?: { databaseUrl?: string; discoveryLeaseToken?: string },
): Promise<{ created: boolean; opportunity: DiscoveredJob }> {
  const input = discoveredJobPersistenceInputSchema.parse(rawInput);
  const fingerprint = discoveredJobFingerprint(input);
  const sourceIdentity = input.normalized.externalId
    ? `${input.normalized.sourceKind}:${input.normalized.externalId}`
    : input.provenance.requestedUrl;
  const sql = database(options?.databaseUrl);
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(
        ${`${session.tenantId}:discovered-job:${fingerprint ?? sourceIdentity}`}, 0
      ))`;
      if (options?.discoveryLeaseToken) {
        await authorizeDiscovery(tx, session, options.discoveryLeaseToken);
      } else {
        const [owner] = await tx<{ user_id: string }[]>`
          select "userId" as user_id from auth."member"
          where "organizationId" = ${session.tenantId} and role = 'owner'
          order by "createdAt" limit 1`;
        await authorize(tx, session);
        await tx`insert into app.tenants (id, owner_id, name)
          values (
            ${session.tenantId}, ${owner?.user_id ?? session.userId},
            ${session.tenantName ?? 'Workspace'}
          ) on conflict (id) do update set name = excluded.name`;
      }

      const knownSource = await findExactSource(tx, session.tenantId, input);
      let job: JobRow | undefined;
      let matchedBy: SourceRow['matched_by'] = 'new';
      if (knownSource) {
        [job] = await tx<JobRow[]>`select ${jobColumns(tx)}
          from app.discovered_jobs where tenant_id = ${session.tenantId}
            and id = ${knownSource.discovered_job_id} for update`;
        matchedBy = 'exact_source';
      }
      if (!job) {
        [job] = await tx<JobRow[]>`select ${jobColumns(tx)}
          from app.discovered_jobs where tenant_id = ${session.tenantId}
            and canonical_url = ${input.provenance.finalUrl} for update`;
        if (job) matchedBy = 'canonical_url';
      }
      if (!job && fingerprint) {
        const matches = await tx<JobRow[]>`select ${jobColumns(tx)}
          from app.discovered_jobs where tenant_id = ${session.tenantId}
            and fingerprint = ${fingerprint} order by id limit 2 for update`;
        if (matches.length === 1) {
          [job] = matches;
          matchedBy = 'fingerprint';
        }
      }

      const created = !job;
      if (!job) {
        [job] = await tx<JobRow[]>`insert into app.discovered_jobs (
          tenant_id, company, role, description, canonical_url, location,
          remote_mode, contract_type, salary_min, salary_max, salary_currency,
          salary_period,
          published_at, external_id, source_kind, lifecycle, fingerprint,
          first_seen_at, last_seen_at
        ) values (
          ${session.tenantId}, ${input.extraction.company ?? null},
          ${input.extraction.role ?? null}, ${input.extraction.description ?? null},
          ${input.provenance.finalUrl}, ${input.normalized.location},
          ${input.normalized.remoteMode}, ${input.normalized.contractType},
          ${input.normalized.salaryMin}, ${input.normalized.salaryMax},
          ${input.normalized.salaryCurrency}, ${input.normalized.salaryPeriod},
          ${input.normalized.publishedAt},
          ${input.normalized.externalId}, ${input.normalized.sourceKind},
          ${input.normalized.lifecycleSignal === 'closed' ? 'closed' : 'open'},
          ${fingerprint}, ${input.provenance.fetchedAt},
          ${input.provenance.fetchedAt}
        ) returning ${jobColumns(tx)}`;
      }

      const changedFields = !sameCurrentFields(job, input);
      const change = observationChange(
        created,
        job.lifecycle,
        input.normalized.lifecycleSignal,
        knownSource?.content_sha256,
        input.provenance.sha256,
        changedFields,
      );
      const lifecycle = nextLifecycle(
        job.lifecycle,
        input.normalized.lifecycleSignal,
        change,
      );
      if (!created) {
        const current = aggregateFields(job, input);
        [job] = await tx<JobRow[]>`update app.discovered_jobs set
          company = ${current.company}, role = ${current.role},
          description = ${current.description}, location = ${current.location},
          remote_mode = ${current.remoteMode}, contract_type = ${current.contractType},
          salary_min = ${current.salaryMin}, salary_max = ${current.salaryMax},
          salary_currency = ${current.salaryCurrency},
          salary_period = ${current.salaryPeriod},
          published_at = ${current.publishedAt}, external_id = ${current.externalId},
          source_kind = ${current.sourceKind}, lifecycle = ${lifecycle},
          fingerprint = ${fingerprint ?? job.fingerprint},
          last_seen_at = greatest(last_seen_at, ${input.provenance.fetchedAt}),
          revision = revision + ${change === 'unchanged' ? 0 : 1},
          updated_at = clock_timestamp()
          where tenant_id = ${session.tenantId} and id = ${job.id}
          returning ${jobColumns(tx)}`;
      }

      const source = knownSource
        ? await updateSource(
            tx,
            session.tenantId,
            knownSource.id,
            job.id,
            input,
            matchedBy,
          )
        : await insertSource(tx, session.tenantId, job.id, input, matchedBy);
      await tx`insert into app.job_observations (
        tenant_id, discovered_job_id, source_record_id, observed_at,
        content_sha256, change_kind, lifecycle_signal, matched_by, normalized
      ) values (
        ${session.tenantId}, ${job.id}, ${source.id}, ${input.provenance.fetchedAt},
        ${input.provenance.sha256}, ${change}, ${input.normalized.lifecycleSignal},
        ${matchedBy}, ${tx.json(input.normalized)}
      )`;

      return {
        created,
        opportunity: await projection(tx, session.tenantId, job),
      };
    });
  } finally {
    await sql.end();
  }
}

export async function listDiscoveredJobs(
  session: PublicationSession,
): Promise<DiscoveredJob[]> {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const jobs = await tx<JobRow[]>`
        select ${jobColumns(tx)} from app.discovered_jobs
        where tenant_id = ${session.tenantId}
        order by last_seen_at desc, id desc limit 100`;
      return await Promise.all(
        jobs.map((job) => projection(tx, session.tenantId, job)),
      );
    });
  } finally {
    await sql.end();
  }
}

async function findExactSource(
  tx: postgres.TransactionSql,
  tenantId: string,
  input: DiscoveredJobPersistenceInput,
) {
  const rows = input.normalized.externalId
    ? await tx<(SourceRow & { discovered_job_id: string })[]>`
        select ${sourceColumns(tx)}, discovered_job_id
        from app.job_source_records where tenant_id = ${tenantId}
          and source_kind = ${input.normalized.sourceKind}
          and external_id = ${input.normalized.externalId} for update`
    : await tx<(SourceRow & { discovered_job_id: string })[]>`
        select ${sourceColumns(tx)}, discovered_job_id
        from app.job_source_records where tenant_id = ${tenantId}
          and external_id is null
          and requested_url = ${input.provenance.requestedUrl} for update`;
  return rows[0];
}

async function insertSource(
  tx: postgres.TransactionSql,
  tenantId: string,
  jobId: string,
  input: DiscoveredJobPersistenceInput,
  matchedBy: SourceRow['matched_by'],
) {
  const [source] = await tx<SourceRow[]>`insert into app.job_source_records (
    tenant_id, discovered_job_id, requested_url, final_url, fetched_url,
    source_kind, external_id, matched_by, fetched_at, content_type, bytes,
    content_sha256, trust, extraction
  ) values (
    ${tenantId}, ${jobId}, ${input.provenance.requestedUrl},
    ${input.provenance.finalUrl}, ${input.provenance.fetchedUrl},
    ${input.normalized.sourceKind}, ${input.normalized.externalId}, ${matchedBy},
    ${input.provenance.fetchedAt}, ${input.provenance.contentType},
    ${input.provenance.bytes}, ${input.provenance.sha256},
    ${input.provenance.trust}, ${tx.json(input.extraction)}
  ) returning ${sourceColumns(tx)}`;
  return source;
}

async function updateSource(
  tx: postgres.TransactionSql,
  tenantId: string,
  sourceId: string,
  jobId: string,
  input: DiscoveredJobPersistenceInput,
  matchedBy: SourceRow['matched_by'],
) {
  const [source] = await tx<SourceRow[]>`update app.job_source_records set
    discovered_job_id = ${jobId}, requested_url = ${input.provenance.requestedUrl},
    final_url = ${input.provenance.finalUrl}, fetched_url = ${input.provenance.fetchedUrl},
    source_kind = ${input.normalized.sourceKind}, external_id = ${input.normalized.externalId},
    matched_by = ${matchedBy}, fetched_at = ${input.provenance.fetchedAt},
    content_type = ${input.provenance.contentType}, bytes = ${input.provenance.bytes},
    content_sha256 = ${input.provenance.sha256}, trust = ${input.provenance.trust},
    extraction = ${tx.json(input.extraction)}, updated_at = clock_timestamp()
    where tenant_id = ${tenantId} and id = ${sourceId}
    returning ${sourceColumns(tx)}`;
  return source;
}

async function projection(
  tx: postgres.TransactionSql,
  tenantId: string,
  job: JobRow,
): Promise<DiscoveredJob> {
  const sources = await tx<SourceRow[]>`
    select ${sourceColumns(tx)} from app.job_source_records
    where tenant_id = ${tenantId} and discovered_job_id = ${job.id}
    order by fetched_at desc, id desc limit 100`;
  const observations = await tx<ObservationRow[]>`
    select id, source_record_id, observed_at, content_sha256, change_kind,
      lifecycle_signal, matched_by, normalized
    from app.job_observations where tenant_id = ${tenantId}
      and discovered_job_id = ${job.id}
    order by observed_at desc, id desc limit 100`;
  return discoveredJobSchema.parse({
    opportunityId: job.id,
    ...(job.company ? { company: job.company } : {}),
    ...(job.role ? { role: job.role } : {}),
    ...(job.description ? { description: job.description } : {}),
    sourceUrl: job.canonical_url,
    location: job.location,
    remoteMode: job.remote_mode,
    contractType: job.contract_type,
    salaryMin: money(job.salary_min),
    salaryMax: money(job.salary_max),
    salaryCurrency: job.salary_currency,
    salaryPeriod: job.salary_period,
    publishedAt: job.published_at?.toISOString() ?? null,
    externalId: job.external_id,
    sourceKind: job.source_kind,
    lifecycle: job.lifecycle,
    fingerprint: job.fingerprint,
    revision: Number(job.revision),
    sources: sources.map((source) => ({
      sourceRecordId: source.id,
      requestedUrl: source.requested_url,
      finalUrl: source.final_url,
      fetchedUrl: source.fetched_url,
      sourceKind: source.source_kind,
      externalId: source.external_id,
      matchedBy: source.matched_by,
      fetchedAt: source.fetched_at.toISOString(),
      contentType: source.content_type,
      bytes: source.bytes,
      sha256: source.content_sha256,
      trust: source.trust,
    })),
    observations: observations.map((observation) => ({
      observationId: observation.id,
      sourceRecordId: observation.source_record_id,
      observedAt: observation.observed_at.toISOString(),
      sha256: observation.content_sha256,
      change: observation.change_kind,
      lifecycleSignal: observation.lifecycle_signal,
      matchedBy: observation.matched_by,
      normalized: observation.normalized,
    })),
    firstSeenAt: job.first_seen_at.toISOString(),
    lastSeenAt: job.last_seen_at.toISOString(),
  });
}

function sameCurrentFields(job: JobRow, input: DiscoveredJobPersistenceInput) {
  const current = aggregateFields(job, input);
  return (
    current.company === job.company &&
    current.role === job.role &&
    current.description === job.description &&
    current.location === job.location &&
    current.remoteMode === job.remote_mode &&
    current.contractType === job.contract_type &&
    current.salaryMin === money(job.salary_min) &&
    current.salaryMax === money(job.salary_max) &&
    current.salaryCurrency === job.salary_currency &&
    current.salaryPeriod === job.salary_period &&
    current.publishedAt === (job.published_at?.toISOString() ?? null) &&
    current.externalId === job.external_id &&
    current.sourceKind === job.source_kind
  );
}

function aggregateFields(job: JobRow, input: DiscoveredJobPersistenceInput) {
  const hasSalary =
    input.normalized.salaryMin !== null || input.normalized.salaryMax !== null;
  const useIncomingSalary =
    hasSalary &&
    (input.normalized.salaryPeriod !== 'unknown' ||
      job.salary_period === 'unknown');
  const useIncomingSource = input.normalized.sourceKind !== 'generic_html';
  return {
    company: input.extraction.company ?? job.company,
    role: input.extraction.role ?? job.role,
    description: input.extraction.description ?? job.description,
    location: input.normalized.location ?? job.location,
    remoteMode:
      input.normalized.remoteMode === 'unknown'
        ? job.remote_mode
        : input.normalized.remoteMode,
    contractType:
      input.normalized.contractType === 'unknown'
        ? job.contract_type
        : input.normalized.contractType,
    salaryMin: useIncomingSalary
      ? input.normalized.salaryMin
      : money(job.salary_min),
    salaryMax: useIncomingSalary
      ? input.normalized.salaryMax
      : money(job.salary_max),
    salaryCurrency: useIncomingSalary
      ? input.normalized.salaryCurrency
      : job.salary_currency,
    salaryPeriod: useIncomingSalary
      ? input.normalized.salaryPeriod
      : job.salary_period,
    publishedAt:
      input.normalized.publishedAt ?? job.published_at?.toISOString() ?? null,
    externalId: input.normalized.externalId ?? job.external_id,
    sourceKind: useIncomingSource
      ? input.normalized.sourceKind
      : job.source_kind,
  };
}

function observationChange(
  created: boolean,
  current: JobRow['lifecycle'],
  signal: DiscoveredJobPersistenceInput['normalized']['lifecycleSignal'],
  priorHash: string | undefined,
  nextHash: string,
  changedFields: boolean,
): ObservationRow['change_kind'] {
  if (created) return 'first_seen';
  if (signal === 'closed') return current === 'closed' ? 'unchanged' : 'closed';
  if (current === 'closed' && signal === 'open') return 'reposted';
  if ((priorHash && priorHash !== nextHash) || changedFields) return 'changed';
  return 'unchanged';
}

function nextLifecycle(
  current: JobRow['lifecycle'],
  signal: DiscoveredJobPersistenceInput['normalized']['lifecycleSignal'],
  change: ObservationRow['change_kind'],
) {
  if (signal === 'closed') return 'closed';
  if (current === 'closed' && signal === 'open') return 'reposted';
  if (change === 'changed') return 'changed';
  return current;
}

function normalizeFingerprintPart(value: string | null | undefined) {
  return value
    ?.normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function money(value: string | null) {
  return value === null ? null : Number(value);
}

function jobColumns(tx: postgres.TransactionSql) {
  return tx`id, company, role, description, canonical_url, location,
    remote_mode, contract_type, salary_min, salary_max, salary_currency,
    salary_period,
    published_at, external_id, source_kind, lifecycle, fingerprint, revision,
    first_seen_at, last_seen_at`;
}

function sourceColumns(tx: postgres.TransactionSql) {
  return tx`id, requested_url, final_url, fetched_url, source_kind, external_id,
    matched_by, fetched_at, content_type, bytes, content_sha256, trust`;
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}

async function authorizeDiscovery(
  tx: postgres.TransactionSql,
  session: PublicationSession,
  leaseToken: string,
) {
  await tx`select set_config('app.discovery_lease_token', ${leaseToken}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_job_discovery');
}
