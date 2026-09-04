import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import {
  applicationFieldsSchema,
  applicationCompanySourcesSchema,
  applicationSchema,
  deleteApplicationInputSchema,
  updateApplicationInputSchema,
  type Application,
} from '../application-contract';
import { optionalHttpUrl } from '../http-url';
import type { PublicationSession } from './publications';

export class ApplicationConflictError extends Error {}
export class ApplicationNotFoundError extends Error {}
export class ApplicationRejectedError extends Error {}

type ApplicationRow = {
  id: string;
  company: string;
  role: string;
  raw_text: string;
  url: string | null;
  accent: string;
  stage: Application['stage'];
  company_sources: unknown;
  revision: string;
  create_input_hash: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function createApplication(
  session: PublicationSession,
  rawInput: unknown,
  rawIdempotencyKey: string,
) {
  const input = applicationFieldsSchema.parse(rawInput);
  const idempotencyKey = uuid(rawIdempotencyKey);
  const inputHash = hashJson(input);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(
        hashtextextended(${`${session.tenantId}:application:${idempotencyKey}`}, 0)
      )`;
      const [owner] = await tx<{ user_id: string }[]>`
        select "userId" as user_id from auth."member"
        where "organizationId" = ${session.tenantId} and role = 'owner'
        order by "createdAt" limit 1`;
      await authorize(tx, session);
      await tx`insert into app.tenants (id, owner_id, name)
        values (
          ${session.tenantId}, ${owner?.user_id ?? session.userId},
          ${session.tenantName ?? 'Workspace'}
        )
        on conflict (id) do update set name = excluded.name`;
      const [existing] = await tx<ApplicationRow[]>`
        select id, company, role, raw_text, url, accent, stage, company_sources, revision,
          create_input_hash, created_at, updated_at, deleted_at
        from app.applications
        where tenant_id = ${session.tenantId}
          and create_idempotency_key = ${idempotencyKey}`;
      if (existing) {
        if (existing.create_input_hash !== inputHash)
          throw new ApplicationConflictError(
            'The idempotency key belongs to another application input.',
          );
        if (existing.deleted_at) throw new ApplicationNotFoundError();
        return { created: false, application: projection(existing) };
      }

      const id = randomUUID();
      const [created] = await tx<ApplicationRow[]>`
        insert into app.applications (
          id, tenant_id, company, role, raw_text, url, accent, stage, company_sources,
          create_idempotency_key, create_input_hash
        ) values (
          ${id}, ${session.tenantId}, ${input.company}, ${input.role},
          ${input.description}, ${input.url ?? null}, ${input.accent},
          ${input.stage}, ${tx.json(input.companySources ?? [])}, ${idempotencyKey}, ${inputHash}
        ) returning id, company, role, raw_text, url, accent, stage, company_sources, revision,
          create_input_hash, created_at, updated_at, deleted_at`;
      return { created: true, application: projection(created) };
    });
  } finally {
    await sql.end();
  }
}

export async function listApplications(session: PublicationSession) {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const rows = await tx<ApplicationRow[]>`
        select id, company, role, raw_text, url, accent, stage, company_sources, revision,
          create_input_hash, created_at, updated_at, deleted_at
        from app.applications
        where tenant_id = ${session.tenantId} and deleted_at is null
        order by updated_at desc, id desc limit 100`;
      return rows.map(projection);
    });
  } finally {
    await sql.end();
  }
}

export async function readApplication(
  session: PublicationSession,
  rawApplicationId: string,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [row] = await tx<ApplicationRow[]>`
        select id, company, role, raw_text, url, accent, stage, company_sources, revision,
          create_input_hash, created_at, updated_at, deleted_at
        from app.applications
        where tenant_id = ${session.tenantId} and id = ${applicationId}
          and deleted_at is null`;
      return row ? projection(row) : undefined;
    });
  } finally {
    await sql.end();
  }
}

export async function updateApplication(
  session: PublicationSession,
  rawApplicationId: string,
  rawInput: unknown,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const input = updateApplicationInputSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [existing] = await tx<ApplicationRow[]>`
        select id, company, role, raw_text, url, accent, stage, company_sources, revision,
          create_input_hash, created_at, updated_at, deleted_at
        from app.applications
        where tenant_id = ${session.tenantId} and id = ${applicationId}
        for update`;
      if (!existing || existing.deleted_at)
        throw new ApplicationNotFoundError();
      const revision = Number(existing.revision);
      if (
        revision !== input.expectedRevision &&
        !(
          revision === input.expectedRevision + 1 && sameFields(existing, input)
        )
      )
        throw new ApplicationConflictError('Application revision is stale.');
      if (sameFields(existing, input)) return projection(existing);
      const [updated] = await tx<ApplicationRow[]>`
        update app.applications set company = ${input.company}, role = ${input.role},
          raw_text = ${input.description}, url = ${input.url ?? null},
          accent = ${input.accent}, stage = ${input.stage},
          company_sources = ${tx.json(input.companySources ?? companySources(existing.company_sources))},
          revision = revision + 1
        where tenant_id = ${session.tenantId} and id = ${applicationId}
        returning id, company, role, raw_text, url, accent, stage, company_sources, revision,
          create_input_hash, created_at, updated_at, deleted_at`;
      return projection(updated);
    });
  } finally {
    await sql.end();
  }
}

export async function deleteApplication(
  session: PublicationSession,
  rawApplicationId: string,
  rawInput: unknown,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const input = deleteApplicationInputSchema.parse(rawInput);
  const sql = database();
  try {
    await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [existing] = await tx<
        { revision: string; deleted_at: Date | null }[]
      >`
        select revision, deleted_at from app.applications
        where tenant_id = ${session.tenantId} and id = ${applicationId}
        for update`;
      if (!existing) throw new ApplicationNotFoundError();
      if (existing.deleted_at) return;
      if (Number(existing.revision) !== input.expectedRevision)
        throw new ApplicationConflictError('Application revision is stale.');
      await tx`update app.applications set deleted_at = now(),
        revision = revision + 1
        where tenant_id = ${session.tenantId} and id = ${applicationId}`;
    });
  } finally {
    await sql.end();
  }
}

function projection(row: ApplicationRow): Application {
  const url = optionalHttpUrl(row.url);
  const sources = companySources(row.company_sources);
  return applicationSchema.parse({
    applicationId: row.id,
    company: row.company,
    role: row.role,
    description: row.raw_text,
    ...(url ? { url } : {}),
    accent: row.accent,
    stage: row.stage,
    ...(sources.length ? { companySources: sources } : {}),
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}

function uuid(value: string) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success)
    throw new ApplicationRejectedError('A UUID idempotency key is required.');
  return parsed.data;
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sameFields(
  row: ApplicationRow,
  input: z.infer<typeof applicationFieldsSchema>,
) {
  return (
    row.company === input.company &&
    row.role === input.role &&
    row.raw_text === input.description &&
    row.url === (input.url ?? null) &&
    row.accent === input.accent &&
    row.stage === input.stage &&
    (input.companySources === undefined ||
      JSON.stringify(companySources(row.company_sources)) ===
        JSON.stringify(input.companySources))
  );
}

function companySources(value: unknown) {
  const parsed = applicationCompanySourcesSchema.safeParse(value);
  if (!parsed.success)
    throw new ApplicationRejectedError(
      'Application company sources are invalid.',
    );
  return parsed.data;
}
