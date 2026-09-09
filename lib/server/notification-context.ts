import 'server-only';
import { createHash } from 'node:crypto';
import { authorize, database } from './database';
import { readLivingProfile } from './profile';
import { memoryConflicts } from '../memory-conflicts';
import { notificationContextSchema } from '../notification-context';
import type { PublicationSession } from './publications';

export async function readNotificationContext(session: PublicationSession) {
  const profile = await readLivingProfile({
    ...session,
    tenantName: session.tenantName ?? 'Workspace',
  });
  const groups = profile ? memoryConflicts(profile.profile) : [];
  // Statements, not regenerated profile IDs: unrelated memory saves must not mark a conflict unread again.
  const fingerprint = groups
    .map((group) => group.map((claim) => claim.statement).sort())
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const rows = await database().begin(async (tx) => {
    await authorize(tx, session);
    return tx<
      {
        id: string;
        application_id: string;
        company: string;
        title: string;
        due_at: Date;
        kind: string;
      }[]
    >`
      select task.id, task.application_id, application.company, task.title, task.due_at, task.kind
      from app.application_tasks task
      join app.applications application on application.tenant_id = task.tenant_id and application.id = task.application_id
      where task.tenant_id = ${session.tenantId} and application.deleted_at is null
        and task.completed_at is null and task.due_at <= now()
      order by task.due_at, task.id limit 51`;
  });
  return notificationContextSchema.parse({
    conflict: groups.length
      ? {
          id: `conflict:${createHash('sha256')
            .update(JSON.stringify([session.tenantId, fingerprint]))
            .digest('hex')}`,
          count: groups.length,
        }
      : null,
    tasks: rows.slice(0, 50).map((row) => ({
      id: row.id,
      applicationId: row.application_id,
      company: row.company,
      title: row.title,
      dueAt: row.due_at.toISOString(),
      kind: row.kind,
    })),
    moreTasks: rows.length > 50,
  });
}
