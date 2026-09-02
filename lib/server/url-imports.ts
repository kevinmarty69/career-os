import 'server-only';
import postgres from 'postgres';
import type { PublicationSession } from './publications';

export class UrlImportRateLimitError extends Error {}

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 2, idle_timeout: 5 });
}

export async function reserveUrlImport(session: PublicationSession) {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await tx`insert into app.tenants (id, owner_id, name)
        values (
          ${session.tenantId}, ${session.userId},
          ${session.tenantName ?? 'Workspace'}
        ) on conflict (id) do update set name = excluded.name`;
      try {
        const [row] = await tx<{ id: string }[]>`
          select app.reserve_url_import(${session.tenantId}::uuid) as id`;
        return row.id;
      } catch (error) {
        if (error instanceof Error && error.message.includes('rate limited'))
          throw new UrlImportRateLimitError();
        throw error;
      }
    });
  } finally {
    await sql.end();
  }
}

export async function finishUrlImport(
  session: PublicationSession,
  attemptId: string,
  outcome: 'succeeded' | 'rejected' | 'failed',
) {
  const sql = database();
  try {
    await sql.begin(async (tx) => {
      await authorize(tx, session);
      await tx`select app.finish_url_import(${attemptId}::uuid, ${outcome})`;
    });
  } finally {
    await sql.end();
  }
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}
