import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const workerCount = 4;
const profileCount = 24;
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const databaseName = `career_os_discovery_${suffix}`;
const admin = new Client({ connectionString: databaseUrl });
let adminConnected = false;
const testUrl = new URL(databaseUrl);
testUrl.pathname = `/${databaseName}`;
const target = new Client({ connectionString: testUrl.toString() });
const workers = [];
const tenantId = randomUUID();
const ownerId = randomUUID();
const recoveryProfileId = randomUUID();
const emptySummary = JSON.stringify({
  boards: 0,
  jobsRead: 0,
  stored: 0,
  filtered: 0,
  failedBoards: 0,
});

async function workerClient() {
  const client = new Client({ connectionString: testUrl.toString() });
  await client.connect();
  await client.query('set role career_job_discovery');
  workers.push(client);
  return client;
}

async function claim(client, leaseSeconds = 60) {
  return client.query('select * from app.claim_scheduled_job_discovery($1)', [
    leaseSeconds,
  ]);
}

async function complete(client, row) {
  const result = await client.query(
    `select app.complete_scheduled_job_discovery(
      $1::uuid, $2::uuid, 'succeeded', $3::jsonb, 15
    ) as completed`,
    [row.search_profile_id, row.lease_token, emptySummary],
  );
  assert.equal(result.rows[0].completed, true);
}

try {
  await admin.connect();
  adminConnected = true;
  await admin.query(`drop database if exists ${databaseName} with (force)`);
  await admin.query(`create database ${databaseName}`);
  await target.connect();

  const migrations = (await readdir('supabase/migrations'))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  assert.ok(migrations.includes('0045_scheduled_job_discovery.sql'));
  assert.ok(migrations.includes('0047_harden_job_discovery_claim.sql'));
  for (const migration of migrations)
    await target.query(
      await readFile(`supabase/migrations/${migration}`, 'utf8'),
    );

  await target.query(
    `insert into app.tenants (id, owner_id, name)
     values ($1, $2, 'Discovery concurrency tenant')`,
    [tenantId, ownerId],
  );
  const seeded = await target.query(
    `insert into app.search_profiles (
      tenant_id, name, hard_constraints, soft_preferences,
      discovery_sources, discovery_interval_hours, next_discovery_at
    )
    select $1, 'Load profile ' || candidate,
      '{}'::jsonb, '{}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'company', 'Fixture ' || candidate,
        'url', 'https://jobs.example.test/' || candidate
      )),
      6, clock_timestamp() - interval '1 minute'
    from generate_series(1, $2::integer) candidate
    returning id`,
    [tenantId, profileCount],
  );
  assert.equal(seeded.rowCount, profileCount);

  const clients = await Promise.all(
    Array.from({ length: workerCount }, () => workerClient()),
  );
  const claimedProfileIds = new Set();
  const benchmarkStartedAt = performance.now();

  for (;;) {
    const claims = await Promise.all(clients.map((client) => claim(client)));
    const claimed = claims.flatMap((result, index) =>
      result.rows.map((row) => ({ client: clients[index], row })),
    );
    if (claimed.length === 0) break;
    assert.ok(claimed.length <= workerCount);
    for (const { row } of claimed) {
      assert.equal(claimedProfileIds.has(row.search_profile_id), false);
      claimedProfileIds.add(row.search_profile_id);
    }
    await Promise.all(claimed.map(({ client, row }) => complete(client, row)));
  }

  const benchmarkElapsedMs = performance.now() - benchmarkStartedAt;
  assert.equal(claimedProfileIds.size, profileCount);
  assert.equal(
    (await Promise.all(clients.map((client) => claim(client)))).reduce(
      (count, result) => count + result.rowCount,
      0,
    ),
    0,
  );

  await target.query(
    `insert into app.search_profiles (
      id, tenant_id, name, hard_constraints, soft_preferences,
      discovery_sources, discovery_interval_hours, next_discovery_at
    ) values (
      $1, $2, 'Expired lease recovery', '{}'::jsonb, '{}'::jsonb,
      '[{"company":"Recovery fixture","url":"https://jobs.example.test/recovery"}]'::jsonb,
      6, clock_timestamp() - interval '1 minute'
    )`,
    [recoveryProfileId, tenantId],
  );

  const initialClaim = await claim(clients[0], 30);
  assert.equal(initialClaim.rowCount, 1);
  assert.equal(initialClaim.rows[0].search_profile_id, recoveryProfileId);
  assert.equal(
    (await Promise.all(clients.slice(1).map((client) => claim(client)))).reduce(
      (count, result) => count + result.rowCount,
      0,
    ),
    0,
  );

  await target.query(
    `update app.search_profiles
     set discovery_lease_expires_at = clock_timestamp() - interval '1 second'
     where id = $1`,
    [recoveryProfileId],
  );

  const recoveryRace = await Promise.all(
    clients.map((client) => claim(client, 60)),
  );
  const recovered = recoveryRace.flatMap((result, index) =>
    result.rows.map((row) => ({ client: clients[index], row })),
  );
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].row.search_profile_id, recoveryProfileId);
  assert.notEqual(
    recovered[0].row.lease_token,
    initialClaim.rows[0].lease_token,
  );

  const staleCompletion = await clients[0].query(
    `select app.complete_scheduled_job_discovery(
      $1::uuid, $2::uuid, 'succeeded', $3::jsonb, 15
    ) as completed`,
    [recoveryProfileId, initialClaim.rows[0].lease_token, emptySummary],
  );
  assert.equal(staleCompletion.rows[0].completed, false);
  await complete(recovered[0].client, recovered[0].row);

  const finalState = await target.query(
    `select last_discovery_status, discovery_lease_token,
      discovery_lease_expires_at, next_discovery_at > clock_timestamp() as scheduled
     from app.search_profiles where id = $1`,
    [recoveryProfileId],
  );
  assert.deepEqual(finalState.rows[0], {
    last_discovery_status: 'succeeded',
    discovery_lease_token: null,
    discovery_lease_expires_at: null,
    scheduled: true,
  });

  const claimsPerSecond =
    profileCount / Math.max(benchmarkElapsedMs / 1_000, Number.EPSILON);
  console.log(
    JSON.stringify({
      workers: workerCount,
      profiles: profileCount,
      duplicateClaims: 0,
      elapsedMs: Math.round(benchmarkElapsedMs),
      claimsPerSecond: Number(claimsPerSecond.toFixed(2)),
      expiredLeaseRecovered: true,
      staleCompletionRejected: true,
    }),
  );
} finally {
  await Promise.allSettled(workers.map((client) => client.end()));
  await target.end().catch(() => undefined);
  if (adminConnected)
    await admin
      .query(`drop database if exists ${databaseName} with (force)`)
      .catch(() => undefined);
  await admin.end().catch(() => undefined);
}
