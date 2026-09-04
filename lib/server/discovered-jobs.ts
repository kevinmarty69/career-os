import 'server-only';
import postgres from 'postgres';
import {
  discoveredJobPersistenceInputSchema,
  discoveredJobSchema,
  type DiscoveredJob,
} from '../discovered-job-contract';
import type { PublicationSession } from './publications';

type JobRow = {
  id: string;
  company: string | null;
  role: string | null;
  description: string | null;
  canonical_url: string;
  revision: string;
  first_seen_at: Date;
  last_seen_at: Date;
};

type SourceRow = {
  id: string;
  requested_url: string;
  final_url: string;
  fetched_at: Date;
  content_type: 'text/html' | 'text/plain';
  bytes: number;
  content_sha256: string;
  trust: 'untrusted-data';
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function storeDiscoveredJob(
  session: PublicationSession,
  rawInput: unknown,
): Promise<{ created: boolean; opportunity: DiscoveredJob }> {
  const input = discoveredJobPersistenceInputSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(
        ${`${session.tenantId}:discovered-job:${input.provenance.requestedUrl}`}, 0
      ))`;
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

      const [knownSource] = await tx<{ discovered_job_id: string }[]>`
        select discovered_job_id from app.job_source_records
        where tenant_id = ${session.tenantId}
          and requested_url = ${input.provenance.requestedUrl}`;
      let [job] = knownSource
        ? await tx<JobRow[]>`select ${jobColumns(tx)} from app.discovered_jobs
            where tenant_id = ${session.tenantId}
              and id = ${knownSource.discovered_job_id} for update`
        : await tx<JobRow[]>`select ${jobColumns(tx)} from app.discovered_jobs
            where tenant_id = ${session.tenantId}
              and canonical_url = ${input.provenance.finalUrl} for update`;
      const created = !job;

      if (!job) {
        [job] = await tx<JobRow[]>`insert into app.discovered_jobs (
          tenant_id, company, role, description, canonical_url,
          first_seen_at, last_seen_at
        ) values (
          ${session.tenantId}, ${input.extraction.company ?? null},
          ${input.extraction.role ?? null}, ${input.extraction.description ?? null},
          ${input.provenance.finalUrl}, ${input.provenance.fetchedAt},
          ${input.provenance.fetchedAt}
        ) returning ${jobColumns(tx)}`;
      } else {
        const company = input.extraction.company ?? job.company;
        const role = input.extraction.role ?? job.role;
        const description = input.extraction.description ?? job.description;
        const changed =
          company !== job.company ||
          role !== job.role ||
          description !== job.description;
        [job] = await tx<JobRow[]>`update app.discovered_jobs set
          company = ${company}, role = ${role}, description = ${description},
          last_seen_at = greatest(last_seen_at, ${input.provenance.fetchedAt}),
          revision = revision + ${changed ? 1 : 0}, updated_at = clock_timestamp()
          where tenant_id = ${session.tenantId} and id = ${job.id}
          returning ${jobColumns(tx)}`;
      }

      await tx`insert into app.job_source_records (
        tenant_id, discovered_job_id, requested_url, final_url, fetched_at,
        content_type, bytes, content_sha256, trust, extraction
      ) values (
        ${session.tenantId}, ${job.id}, ${input.provenance.requestedUrl},
        ${input.provenance.finalUrl}, ${input.provenance.fetchedAt},
        ${input.provenance.contentType}, ${input.provenance.bytes},
        ${input.provenance.sha256}, ${input.provenance.trust},
        ${tx.json(input.extraction)}
      ) on conflict (tenant_id, requested_url) do update set
        final_url = excluded.final_url,
        fetched_at = excluded.fetched_at,
        content_type = excluded.content_type,
        bytes = excluded.bytes,
        content_sha256 = excluded.content_sha256,
        trust = excluded.trust,
        extraction = excluded.extraction,
        updated_at = clock_timestamp()`;

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

async function projection(
  tx: postgres.TransactionSql,
  tenantId: string,
  job: JobRow,
): Promise<DiscoveredJob> {
  const sources = await tx<SourceRow[]>`
    select id, requested_url, final_url, fetched_at, content_type, bytes,
      content_sha256, trust
    from app.job_source_records
    where tenant_id = ${tenantId} and discovered_job_id = ${job.id}
    order by fetched_at desc, id desc limit 100`;
  return discoveredJobSchema.parse({
    opportunityId: job.id,
    ...(job.company ? { company: job.company } : {}),
    ...(job.role ? { role: job.role } : {}),
    ...(job.description ? { description: job.description } : {}),
    sourceUrl: job.canonical_url,
    revision: Number(job.revision),
    sources: sources.map((source) => ({
      sourceRecordId: source.id,
      requestedUrl: source.requested_url,
      finalUrl: source.final_url,
      fetchedAt: source.fetched_at.toISOString(),
      contentType: source.content_type,
      bytes: source.bytes,
      sha256: source.content_sha256,
      trust: source.trust,
    })),
    firstSeenAt: job.first_seen_at.toISOString(),
    lastSeenAt: job.last_seen_at.toISOString(),
  });
}

function jobColumns(tx: postgres.TransactionSql) {
  return tx`id, company, role, description, canonical_url, revision,
    first_seen_at, last_seen_at`;
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}
