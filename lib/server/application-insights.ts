import 'server-only';
import { database, authorize } from './database';
import { summarizeApplicationInsights } from '../application-insights';
import type { Application } from '../application-contract';
import type { ApplicationTimelineEvent } from '../application-timeline';
import type { PublicationSession } from './publications';

type ApplicationRow = {
  application_id: string;
  stage: Application['stage'];
};

type EventRow = {
  application_id: string;
  kind: ApplicationTimelineEvent['kind'];
  occurred_at: Date;
};

export async function readApplicationInsights(session: PublicationSession) {
  const sql = database();

  return await sql.begin(async (tx) => {
    await authorize(tx, session);
    const applications = await tx<ApplicationRow[]>`
        select id as application_id, stage
        from app.applications
        where tenant_id = ${session.tenantId} and deleted_at is null`;
    const events = await tx<EventRow[]>`
        select event.application_id, event.kind, event.occurred_at
        from app.application_timeline_events event
        join app.applications application
          on application.tenant_id = event.tenant_id
          and application.id = event.application_id
        where event.tenant_id = ${session.tenantId}
          and application.deleted_at is null`;
    return summarizeApplicationInsights(
      applications.map((row) => ({
        applicationId: row.application_id,
        stage: row.stage,
      })),
      events.map((row) => ({
        applicationId: row.application_id,
        kind: row.kind,
        occurredAt: row.occurred_at.toISOString(),
      })),
    );
  });
}
