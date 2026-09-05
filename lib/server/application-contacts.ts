import 'server-only';
import postgres from 'postgres';
import { z } from 'zod';
import {
  applicationContactDraftSchema,
  applicationContactSchema,
  updateApplicationContactInputSchema,
  type ApplicationContact,
} from '../application-contact';
import type { PublicationSession } from './publications';

export class ApplicationContactConflictError extends Error {}
export class ApplicationContactNotFoundError extends Error {}

type ContactRow = {
  id: string;
  application_id: string;
  rank: number;
  name: string;
  role: string;
  profile_url: string;
  relationship: ApplicationContact['relationship'];
  rationale: string;
  sources: unknown;
  confidence: ApplicationContact['confidence'];
  connection_note: string;
  accepted_message: string;
  follow_up_message: string | null;
  status: ApplicationContact['status'];
  follow_up_at: Date | null;
  revision: string;
  created_at: Date;
  updated_at: Date;
};

const columns = `id, application_id, rank, name, role, profile_url,
  relationship, rationale, sources, confidence, connection_note,
  accepted_message, follow_up_message, status, follow_up_at, revision,
  created_at, updated_at`;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function listApplicationContacts(
  session: PublicationSession,
  rawApplicationId: string,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const rows = await tx.unsafe<ContactRow[]>(
        `select ${columns} from app.application_contacts
         where tenant_id = $1 and application_id = $2 order by rank`,
        [session.tenantId, applicationId],
      );
      return rows.map(project);
    });
  } finally {
    await sql.end();
  }
}

export async function createApplicationContact(
  session: PublicationSession,
  rawApplicationId: string,
  rawInput: unknown,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const input = applicationContactDraftSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const [row] = await tx<ContactRow[]>`
        insert into app.application_contacts (
          tenant_id, application_id, rank, name, role, profile_url,
          relationship, rationale, sources, confidence, connection_note,
          accepted_message, follow_up_message, actor_id
        ) values (
          ${session.tenantId}, ${applicationId}, ${input.rank}, ${input.name},
          ${input.role}, ${input.profileUrl}, ${input.relationship},
          ${input.rationale}, ${tx.json(input.sources)}, ${input.confidence},
          ${input.connectionNote}, ${input.acceptedMessage},
          ${input.followUpMessage ?? null}, ${session.userId}
        ) returning ${tx.unsafe(columns)}`;
      await audit(tx, session.tenantId, applicationId, row.id, 'created');
      return project(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApplicationContactConflictError();
    throw error;
  } finally {
    await sql.end();
  }
}

export async function updateApplicationContact(
  session: PublicationSession,
  rawApplicationId: string,
  rawContactId: string,
  rawInput: unknown,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const contactId = z.string().uuid().parse(rawContactId);
  const input = updateApplicationContactInputSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const [current] = await tx.unsafe<ContactRow[]>(
        `select ${columns} from app.application_contacts
         where tenant_id = $1 and application_id = $2 and id = $3 for update`,
        [session.tenantId, applicationId, contactId],
      );
      if (!current) throw new ApplicationContactNotFoundError();
      const desired = {
        connectionNote: input.connectionNote,
        acceptedMessage: input.acceptedMessage,
        followUpMessage: input.followUpMessage,
        status: input.status,
        followUpAt: input.followUpAt,
      };
      if (Number(current.revision) !== input.expectedRevision) {
        if (sameEditableValues(current, desired)) return project(current);
        throw new ApplicationContactConflictError();
      }
      if (sameEditableValues(current, desired)) return project(current);
      const [updated] = await tx<ContactRow[]>`
        update app.application_contacts set
          connection_note = ${input.connectionNote},
          accepted_message = ${input.acceptedMessage},
          follow_up_message = ${input.followUpMessage},
          status = ${input.status},
          follow_up_at = ${input.followUpAt},
          revision = revision + 1
        where tenant_id = ${session.tenantId} and application_id = ${applicationId}
          and id = ${contactId}
        returning ${tx.unsafe(columns)}`;
      await audit(tx, session.tenantId, applicationId, updated.id, 'updated');
      return project(updated);
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
      and deleted_at is null for share`;
  if (!application) throw new ApplicationContactNotFoundError();
}

async function audit(
  tx: postgres.TransactionSql,
  tenantId: string,
  applicationId: string,
  contactId: string,
  action: 'created' | 'updated',
) {
  await tx`select app.record_human_audit_event(
    ${tenantId}, ${`application_contact_${action}`}, 'application',
    ${applicationId}, ${tx.json({ contactId, action })}
  )`;
}

function sameEditableValues(
  row: ContactRow,
  desired: {
    connectionNote: string;
    acceptedMessage: string;
    followUpMessage: string | null;
    status: ApplicationContact['status'];
    followUpAt: string | null;
  },
) {
  return (
    row.connection_note === desired.connectionNote &&
    row.accepted_message === desired.acceptedMessage &&
    row.follow_up_message === desired.followUpMessage &&
    row.status === desired.status &&
    (row.follow_up_at?.toISOString() ?? null) === desired.followUpAt
  );
}

function project(row: ContactRow) {
  return applicationContactSchema.parse({
    contactId: row.id,
    applicationId: row.application_id,
    rank: row.rank,
    name: row.name,
    role: row.role,
    profileUrl: row.profile_url,
    relationship: row.relationship,
    rationale: row.rationale,
    sources: row.sources,
    confidence: row.confidence,
    connectionNote: row.connection_note,
    acceptedMessage: row.accepted_message,
    ...(row.follow_up_message
      ? { followUpMessage: row.follow_up_message }
      : {}),
    status: row.status,
    followUpAt: row.follow_up_at?.toISOString() ?? null,
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}
