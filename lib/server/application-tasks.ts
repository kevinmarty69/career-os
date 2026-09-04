import 'server-only';
import postgres from 'postgres';
import { z } from 'zod';
import {
  applicationTaskInputSchema,
  applicationTaskSchema,
  updateApplicationTaskInputSchema,
  type ApplicationTask,
} from '../application-task';
import type { PublicationSession } from './publications';

export class ApplicationTaskConflictError extends Error {}
export class ApplicationTaskNotFoundError extends Error {}

type TaskRow = {
  id: string;
  application_id: string;
  kind: ApplicationTask['kind'];
  title: string;
  due_at: Date;
  completed_at: Date | null;
  revision: string;
  created_at: Date;
  updated_at: Date;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function listApplicationTasks(
  session: PublicationSession,
  rawApplicationId: string,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const rows = await tx<TaskRow[]>`
        select id, application_id, kind, title, due_at, completed_at, revision,
          created_at, updated_at
        from app.application_tasks
        where tenant_id = ${session.tenantId}
          and application_id = ${applicationId}
        order by (completed_at is not null), due_at, created_at, id
        limit 100`;
      return rows.map(project);
    });
  } finally {
    await sql.end();
  }
}

export async function createApplicationTask(
  session: PublicationSession,
  rawApplicationId: string,
  rawInput: unknown,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const input = applicationTaskInputSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const [row] = await tx<TaskRow[]>`
        insert into app.application_tasks (
          tenant_id, application_id, kind, title, due_at, actor_id
        ) values (
          ${session.tenantId}, ${applicationId}, ${input.kind}, ${input.title},
          ${input.dueAt}, ${session.userId}
        ) returning id, application_id, kind, title, due_at, completed_at,
          revision, created_at, updated_at`;
      await audit(
        tx,
        session.tenantId,
        applicationId,
        row.id,
        row.kind,
        'created',
      );
      return project(row);
    });
  } finally {
    await sql.end();
  }
}

export async function updateApplicationTask(
  session: PublicationSession,
  rawApplicationId: string,
  rawTaskId: string,
  rawInput: unknown,
) {
  const applicationId = z.string().uuid().parse(rawApplicationId);
  const taskId = z.string().uuid().parse(rawTaskId);
  const input = updateApplicationTaskInputSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      await requireApplication(tx, session.tenantId, applicationId);
      const [current] = await tx<TaskRow[]>`
        select id, application_id, kind, title, due_at, completed_at, revision,
          created_at, updated_at
        from app.application_tasks
        where tenant_id = ${session.tenantId} and application_id = ${applicationId}
          and id = ${taskId}
        for update`;
      if (!current) throw new ApplicationTaskNotFoundError();
      const completed = current.completed_at !== null;
      if (Number(current.revision) !== input.expectedRevision) {
        if (completed === input.completed) return project(current);
        throw new ApplicationTaskConflictError();
      }
      if (completed === input.completed) return project(current);
      const [updated] = await tx<TaskRow[]>`
        update app.application_tasks
        set completed_at = ${input.completed ? new Date() : null},
          revision = revision + 1
        where tenant_id = ${session.tenantId} and id = ${taskId}
        returning id, application_id, kind, title, due_at, completed_at,
          revision, created_at, updated_at`;
      await audit(
        tx,
        session.tenantId,
        applicationId,
        updated.id,
        updated.kind,
        input.completed ? 'completed' : 'reopened',
      );
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
      and deleted_at is null
    for share`;
  if (!application) throw new ApplicationTaskNotFoundError();
}

async function audit(
  tx: postgres.TransactionSql,
  tenantId: string,
  applicationId: string,
  taskId: string,
  kind: ApplicationTask['kind'],
  action: 'created' | 'completed' | 'reopened',
) {
  await tx`select app.record_human_audit_event(
    ${tenantId},
    ${`application_task_${action}`},
    'application', ${applicationId},
    ${tx.json({ taskId, kind, action })}
  )`;
}

function project(row: TaskRow) {
  return applicationTaskSchema.parse({
    taskId: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    title: row.title,
    dueAt: row.due_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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
