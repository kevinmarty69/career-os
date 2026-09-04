import 'server-only';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import {
  workspaceExportExclusions,
  workspaceExportFormat,
  workspaceExportTables,
  workspaceExportVersion,
} from '../workspace-export-contract';
import { isSensitiveSessionFresh } from './auth-config';
import type { PublicationSession } from './publications';

const EXPORT_BATCH_SIZE = 250;
const EXPORT_TIMEOUT_MS = 15 * 60 * 1000;

export class WorkspaceExportRejectedError extends Error {}
export class WorkspaceExportBusyError extends Error {}
export class WorkspaceExportSessionNotFreshError extends Error {}

type ExportSession = PublicationSession & { sessionCreatedAt: Date };
type WorkspaceMetadata = {
  snapshotAt: string;
  tenant: { id: string; owner_id: string; name: string };
  organization: Record<string, unknown>;
  members: unknown[];
  invitations: unknown[];
};

export async function exportWorkspace(session: ExportSession) {
  if (!isSensitiveSessionFresh(session.sessionCreatedAt))
    throw new WorkspaceExportSessionNotFreshError();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    types: {
      timestampText: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: String,
        parse: (value: string) => value,
      },
    },
  });
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const timeout = setTimeout(() => {
    void writer
      .abort(new Error('Workspace export timed out.'))
      .catch(() => undefined);
  }, EXPORT_TIMEOUT_MS);
  let readyResolve!: () => void;
  let readyReject!: (error: unknown) => void;
  let readySettled = false;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  void (async () => {
    try {
      await sql.begin(
        'isolation level repeatable read read only',
        async (transaction) => {
          await transaction`select set_config(
            'request.jwt.claim.sub', ${session.userId}, true
          ), set_config(
            'request.jwt.claim.tenant_id', ${session.tenantId}, true
          )`;
          await transaction.unsafe('set local role career_app');
          let metadata: WorkspaceMetadata;
          try {
            const [row] = await transaction<
              [{ workspace: WorkspaceMetadata }]
            >`select app.prepare_workspace_export(${session.tenantId}) as workspace`;
            metadata = row.workspace;
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === 'workspace export busy'
            )
              throw new WorkspaceExportBusyError(error.message, {
                cause: error,
              });
            if (
              error instanceof Error &&
              error.message === 'workspace export denied'
            )
              throw new WorkspaceExportRejectedError(error.message, {
                cause: error,
              });
            throw error;
          }

          const hash = createHash('sha256');
          const counts: Record<string, number> = {};
          const manifestLine = `${JSON.stringify({
            type: 'manifest',
            data: {
              format: workspaceExportFormat,
              version: workspaceExportVersion,
              exportedAt: metadata.snapshotAt,
              snapshotAt: metadata.snapshotAt,
              actorId: session.userId,
              tenant: metadata.tenant,
              organization: metadata.organization,
              members: metadata.members,
              invitations: metadata.invitations,
              categories: workspaceExportTables.map(({ type }) => type),
              exclusions: workspaceExportExclusions,
            },
          })}\n`;
          hash.update(manifestLine);
          const manifestWrite = write(writer, manifestLine);
          readySettled = true;
          readyResolve();
          await manifestWrite;

          for (const definition of workspaceExportTables) {
            counts[definition.type] = 0;
            const columns = transaction(
              definition.columns[0],
              ...definition.columns.slice(1),
            );
            const orderBy = transaction(
              definition.orderBy[0],
              ...definition.orderBy.slice(1),
            );
            const table = transaction(`app.${definition.table}`);
            const cursor = transaction<
              Record<string, unknown>[]
            >`select ${columns} from ${table}
               where tenant_id = ${session.tenantId}
               order by ${orderBy}`.cursor(EXPORT_BATCH_SIZE);
            for await (const rows of cursor) {
              for (const row of rows) {
                await writeHashedLine(writer, hash, {
                  type: definition.type,
                  data: row,
                });
                counts[definition.type] += 1;
              }
            }
          }

          await writeLine(writer, {
            type: 'complete',
            data: { counts, sha256: hash.digest('hex') },
          });
        },
      );
      await writer.close();
    } catch (error) {
      if (!readySettled) {
        readySettled = true;
        readyReject(error);
      }
      await writer
        .abort(error instanceof Error ? error : new Error('Export failed.'))
        .catch(() => undefined);
    } finally {
      clearTimeout(timeout);
      await sql.end().catch(() => undefined);
    }
  })();

  await ready;
  return {
    body: stream.readable,
    filename: `career-os-workspace-${session.tenantId}-${new Date()
      .toISOString()
      .slice(0, 10)}.ndjson`,
  };
}

async function writeHashedLine(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  hash: ReturnType<typeof createHash>,
  record: unknown,
) {
  const line = `${JSON.stringify(record)}\n`;
  hash.update(line);
  await write(writer, line);
}

async function writeLine(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  record: unknown,
) {
  await write(writer, `${JSON.stringify(record)}\n`);
}

async function write(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  chunk: string,
) {
  await writer.write(new TextEncoder().encode(chunk));
}
