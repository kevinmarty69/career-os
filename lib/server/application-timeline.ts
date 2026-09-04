import 'server-only';
import postgres from 'postgres';
import { z } from 'zod';
import {
  applicationTimelineEventSchema,
  applicationTimelineInputSchema,
  type ApplicationTimelineEvent,
} from '../application-timeline';
import type { PublicationSession } from './publications';

export class ApplicationTimelineNotFoundError extends Error {}

type TimelineRow = {
  id: string;
  application_id: string;
  kind: ApplicationTimelineEvent['kind'];
  title: string;
  note: string | null;
  occurred_at: Date;
  actor: 'human';
  created_at: Date;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function listApplicationTimeline(
  session: PublicationSession,
  rawApplicationId: string,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const rows = await tx<TimelineRow[]>`
        select id, application_id, kind, title, note, occurred_at, actor,
          created_at
        from app.application_timeline_events
        where tenant_id = ${session.tenantId}
          and application_id = ${applicationId}
        order by occurred_at desc, created_at desc, id desc
        limit 100`;
      return rows.map(project);
    });
  } finally {
    await sql.end();
  }
}

export async function createApplicationTimelineEvent(
  session: PublicationSession,
  rawApplicationId: string,
  rawInput: unknown,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const input = applicationTimelineInputSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const [row] = await tx<TimelineRow[]>`
        insert into app.application_timeline_events (
          tenant_id, application_id, kind, title, note, occurred_at, actor_id
        ) values (
          ${session.tenantId}, ${applicationId}, ${input.kind}, ${input.title},
          ${input.note || null}, ${input.occurredAt}, ${session.userId}
        ) returning id, application_id, kind, title, note, occurred_at, actor,
          created_at`;
      await tx`select app.record_human_audit_event(
        ${session.tenantId}, 'application_timeline_event_created',
        'application', ${applicationId},
        ${tx.json({ eventId: row.id, kind: row.kind })}
      )`;
      return project(row);
    });
  } finally {
    await sql.end();
  }
}

async function requireApplication(
  tx: postgres.TransactionSql,
  tenantId: string,
  applicationId: string,
) {
  const [application] = await tx<{ id: string }[]>`
    select id from app.applications
    where tenant_id = ${tenantId} and id = ${applicationId}
      and deleted_at is null
    for share`;
  if (!application) throw new ApplicationTimelineNotFoundError();
}

function project(row: TimelineRow) {
  return applicationTimelineEventSchema.parse({
    eventId: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    title: row.title,
    ...(row.note ? { note: row.note } : {}),
    occurredAt: row.occurred_at.toISOString(),
    actor: row.actor,
    createdAt: row.created_at.toISOString(),
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
