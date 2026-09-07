import 'server-only';
import { database, authorize } from './database';
import type { PublicationSession } from './publications';

export class UrlImportRateLimitError extends Error {}

export async function reserveUrlImport(session: PublicationSession) {
  const sql = database();

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
}

export async function finishUrlImport(
  session: PublicationSession,
  attemptId: string,
  outcome: 'succeeded' | 'rejected' | 'failed',
) {
  const sql = database();

  await sql.begin(async (tx) => {
    await authorize(tx, session);
    await tx`select app.finish_url_import(${attemptId}::uuid, ${outcome})`;
  });
}
