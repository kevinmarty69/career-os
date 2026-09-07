import 'server-only';
import { database, authorize } from './database';
import { z } from 'zod';
import { isSensitiveSessionFresh } from './auth-config';
import type { PublicationSession } from './publications';

const deleteWorkspaceSchema = z
  .object({ confirmation: z.enum(['DELETE', 'SUPPRIMER']) })
  .strict();

export class WorkspaceDeletionRejectedError extends Error {}
export class WorkspaceSessionNotFreshError extends Error {}

export async function deleteWorkspace(
  session: PublicationSession & { sessionCreatedAt: Date },
  rawInput: unknown,
) {
  if (!isSensitiveSessionFresh(session.sessionCreatedAt))
    throw new WorkspaceSessionNotFreshError();
  deleteWorkspaceSchema.parse(rawInput);
  const sql = database();

  await sql.begin(async (tx) => {
    await authorize(tx, session);
    try {
      await tx`select app.delete_workspace(
          ${session.tenantId}, ${`DELETE ${session.tenantId}`}
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
}
