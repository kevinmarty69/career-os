import 'server-only';
import { authorize, database } from './database';
import {
  notificationHistoryCursorSchema,
  notificationHistorySchema,
} from '../notification-history';
import type { PublicationSession } from './publications';

export async function readNotificationHistory(
  session: PublicationSession,
  rawCursor?: unknown,
) {
  const cursor =
    rawCursor === undefined
      ? undefined
      : notificationHistoryCursorSchema.parse(rawCursor);
  return database().begin(async (tx) => {
    await authorize(tx, session);
    const rows = await tx<
      {
        id: string;
        kind: 'run' | 'link';
        at: string;
        company: string;
        summary: string;
        application_id: string;
      }[]
    >`
      with history as (
        select event.id, 'run'::text kind, event.created_at at,
          application.company, left(event.summary, 2000) summary, application.id application_id
        from app.workflow_events event
        join app.workflow_runs run on run.tenant_id = event.tenant_id and run.id = event.workflow_run_id
        join app.opportunities opportunity on opportunity.tenant_id = run.tenant_id and opportunity.id = run.opportunity_id
        join app.applications application on application.tenant_id = opportunity.tenant_id and application.id = opportunity.application_id
        where event.tenant_id = ${session.tenantId} and application.deleted_at is null
        union all
        select event.id, 'link'::text, event.occurred_at,
          application.company, event.event_type, application.id
        from app.publication_events event
        join app.publications publication on publication.tenant_id = event.tenant_id and publication.id = event.publication_id
        join app.page_specs page on page.tenant_id = publication.tenant_id and page.id = publication.page_spec_id
        join app.workflow_runs run on run.tenant_id = page.tenant_id and run.id = page.workflow_run_id
        join app.opportunities opportunity on opportunity.tenant_id = run.tenant_id and opportunity.id = run.opportunity_id
        join app.applications application on application.tenant_id = opportunity.tenant_id and application.id = opportunity.application_id
        where event.tenant_id = ${session.tenantId} and application.deleted_at is null
      )
      select id::text, kind, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at,
        company, summary, application_id
      from history
      where ${!cursor} or (at, kind, id) < (${cursor?.at ?? null}::text::timestamptz, ${cursor?.kind ?? null}::text, ${cursor?.id ?? null}::bigint)
      order by history.at desc, kind desc, history.id desc limit 51`;
    const events = rows.slice(0, 50);
    const last = events.at(-1);
    return notificationHistorySchema.parse({
      events: events.map((event) => ({
        id: `${event.kind}:${event.id}`,
        kind: event.kind,
        at: event.at,
        company: event.company,
        summary: event.summary,
        applicationId: event.application_id,
      })),
      nextCursor:
        rows.length > 50 && last
          ? { at: last.at, kind: last.kind, id: last.id }
          : null,
    });
  });
}
