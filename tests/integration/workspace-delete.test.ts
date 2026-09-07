import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import postgres from 'postgres';
import { deleteWorkspace } from '../../lib/server/workspace';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

test('workspace deletion accepts the explicit UI confirmation and derives its tenant guard server-side', async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const userId = randomUUID();
  const tenantId = randomUUID();
  const session = {
    userId,
    tenantId,
    tenantName: 'Disposable workspace',
    sessionCreatedAt: new Date(),
  };
  try {
    await sql.begin(async (transaction) => {
      await transaction`insert into auth."user" (
        id, name, email, "emailVerified"
      ) values (
        ${userId}, 'Delete owner', ${`${userId}@example.test`}, true
      )`;
      await transaction`insert into auth.organization (
        id, name, slug, "createdAt"
      ) values (
        ${tenantId}, 'Disposable workspace', ${`delete-${tenantId}`}, now()
      )`;
      await transaction`insert into auth.member (
        id, "organizationId", "userId", role, "createdAt"
      ) values (
        ${randomUUID()}, ${tenantId}, ${userId}, 'owner', now()
      )`;
      await transaction`insert into app.tenants (id, owner_id, name)
        values (${tenantId}, ${userId}, 'Disposable workspace')`;
    });

    await assert.rejects(
      deleteWorkspace(session, { confirmation: `DELETE ${tenantId}` }),
    );
    await deleteWorkspace(session, { confirmation: 'SUPPRIMER' });

    const [remaining] = await sql<[{ count: string }]>`
      select count(*) from auth.organization where id = ${tenantId}`;
    assert.equal(remaining.count, '0');
  } finally {
    await sql`delete from auth."user" where id = ${userId}`;
    await sql.end();
  }
});
