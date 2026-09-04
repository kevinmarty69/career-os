import 'server-only';
import postgres from 'postgres';
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
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  const sql = postgres(url, { max: 5, idle_timeout: 5 });
  try {
    return await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
        set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
      await tx.unsafe('set local role career_app');
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
  } finally {
    await sql.end();
  }
}
