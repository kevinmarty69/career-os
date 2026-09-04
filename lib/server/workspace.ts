import 'server-only';
import postgres from 'postgres';
import { z } from 'zod';
import { isSensitiveSessionFresh } from './auth-config';
import type { PublicationSession } from './publications';

const deleteWorkspaceSchema = z
  .object({ confirmation: z.string().min(1).max(64) })
  .strict();

export class WorkspaceDeletionRejectedError extends Error {}
export class WorkspaceSessionNotFreshError extends Error {}

export async function deleteWorkspace(
  session: PublicationSession & { sessionCreatedAt: Date },
  rawInput: unknown,
) {
  if (!isSensitiveSessionFresh(session.sessionCreatedAt))
    throw new WorkspaceSessionNotFreshError();
  const { confirmation } = deleteWorkspaceSchema.parse(rawInput);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  const sql = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
        set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
      await tx.unsafe('set local role career_app');
      try {
        await tx`select app.delete_workspace(
          ${session.tenantId}, ${confirmation}
        )`;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'workspace deletion denied'
        )
          throw new WorkspaceDeletionRejectedError();
        throw error;
      }
    });
  } finally {
    await sql.end();
  }
}
