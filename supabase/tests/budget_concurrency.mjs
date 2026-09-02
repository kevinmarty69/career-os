import assert from 'node:assert/strict';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const tenantId = '21000000-0000-0000-0000-000000000099';
const ownerId = '11000000-0000-0000-0000-000000000099';
const opportunityId = '41000000-0000-0000-0000-000000000099';
const runId = '51000000-0000-0000-0000-000000000099';
const admin = postgres(databaseUrl, { max: 1 });

try {
  await admin`insert into app.tenants (id, owner_id, name)
    values (${tenantId}, ${ownerId}, 'Concurrency tenant')`;
  await admin`insert into app.applications
    (id, tenant_id, company, role, raw_text, accent, create_idempotency_key,
      create_input_hash)
    values (${opportunityId}, ${tenantId}, 'Concurrency Co', 'Engineer', 'test',
      '#21504b', gen_random_uuid(), ${'a'.repeat(64)})`;
  await admin`insert into app.opportunities
    (id, tenant_id, application_id, application_revision, company, role,
      raw_text, extraction_status)
    values (${opportunityId}, ${tenantId}, ${opportunityId}, 1,
      'Concurrency Co', 'Engineer', 'test', 'ready')`;
  await admin`insert into app.workflow_runs
    (id, tenant_id, opportunity_id, state, token_budget, cost_budget_micros, deadline_at)
    values (${runId}, ${tenantId}, ${opportunityId}, 'running', 100, 100, now() + interval '1 hour')`;

  const attempts = await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const connection = postgres(databaseUrl, { max: 1 });
      const workerId = `31000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`;
      try {
        await connection.begin(async (transaction) => {
          await transaction`select
            set_config('request.jwt.claim.tenant_id', ${tenantId}, true),
            set_config('request.jwt.claim.worker_id', ${workerId}, true)`;
          await transaction.unsafe('set local role career_worker');
          await transaction`select app.reserve_run_budget(
            ${tenantId}, ${runId}, ${`concurrent-${index}`}, 10, 10, 300
          )`;
        });
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('budget reservation rejected')
        )
          return false;
        throw error;
      } finally {
        await connection.end();
      }
    }),
  );

  assert.equal(attempts.filter(Boolean).length, 10);
  const [run] = await admin`
    select reserved_tokens, reserved_cost_micros
    from app.workflow_runs where id = ${runId}`;
  assert.deepEqual(
    { tokens: run.reserved_tokens, cost: Number(run.reserved_cost_micros) },
    { tokens: 100, cost: 100 },
  );
  const [reservations] = await admin`
    select count(*)::integer as count
    from app.run_budget_reservations
    where workflow_run_id = ${runId} and status = 'reserved'`;
  assert.equal(reservations.count, 10);
  console.log('20 concurrent reservations respected the shared budget');
} finally {
  await admin`delete from app.tenants where id = ${tenantId}`;
  await admin.end();
}
