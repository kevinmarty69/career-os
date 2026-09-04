import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const testDatabase = 'career_os_migration_test';
const admin = new Client({ connectionString: databaseUrl });
const testUrl = new URL(databaseUrl);
testUrl.pathname = `/${testDatabase}`;
let target;
let adminConnected = false;

try {
  await admin.connect();
  adminConnected = true;
  await admin.query(`drop database if exists ${testDatabase} with (force)`);
  await admin.query(`create database ${testDatabase}`);
  target = new Client({ connectionString: testUrl.toString() });
  await target.connect();

  for (let index = 1; index <= 8; index += 1) {
    const prefix = String(index).padStart(4, '0');
    const file = (await readdir('supabase/migrations')).find((name) =>
      name.startsWith(`${prefix}_`),
    );
    assert.ok(file, `migration ${prefix} is missing`);
    await target.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }

  const tenantId = '00000000-0000-4000-8000-000000000001';
  await target.query(
    `insert into app.tenants (id, owner_id, name) values ($1, $2, 'Upgrade test')`,
    [tenantId, '00000000-0000-4000-8000-000000000002'],
  );
  await target.query(
    `insert into app.opportunities
      (id, tenant_id, company, role, raw_text, url, extraction_status)
     values
      ('00000000-0000-4000-8000-000000000011', $1, '   ', '', '', 'not a url', 'ready'),
      ('00000000-0000-4000-8000-000000000012', $1, $2, $3, $4, $5, 'ready'),
      ('00000000-0000-4000-8000-000000000013', $1, ' Valid ', ' Role ', '  raw  ', 'https://example.com/jobs/1', 'ready')`,
    [
      tenantId,
      'c'.repeat(240),
      'r'.repeat(240),
      'd'.repeat(21_000),
      `https://example.com/${'u'.repeat(2_050)}`,
    ],
  );
  for (let index = 9; index <= 22; index += 1) {
    const prefix = String(index).padStart(4, '0');
    const file = (await readdir('supabase/migrations')).find((name) =>
      name.startsWith(`${prefix}_`),
    );
    assert.ok(file, `migration ${prefix} is missing`);
    await target.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }

  const { rows } = await target.query(
    `select id, company, role, raw_text, url
     from app.applications order by id`,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    id: '00000000-0000-4000-8000-000000000011',
    company: 'Unknown company',
    role: 'Unknown role',
    raw_text: 'Unknown company - Unknown role',
    url: null,
  });
  assert.equal(rows[1].company.length, 200);
  assert.equal(rows[1].role.length, 200);
  assert.equal(rows[1].raw_text.length, 20_000);
  assert.equal(rows[1].url, null);
  assert.deepEqual(rows[2], {
    id: '00000000-0000-4000-8000-000000000013',
    company: 'Valid',
    role: 'Role',
    raw_text: 'raw',
    url: 'https://example.com/jobs/1',
  });

  const refused = spawnSync('pnpm', ['exec', 'tsx', 'scripts/migrate.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    encoding: 'utf8',
  });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Existing database is untracked/);
  const wrongBaseline = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/migrate.ts', '--baseline', '0024'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      encoding: 'utf8',
    },
  );
  assert.equal(wrongBaseline.status, 1);
  assert.match(
    wrongBaseline.stderr,
    /only supported untracked baseline is 0022/,
  );
  await target.query(
    'revoke execute on function app.mint_publication(uuid,bytea,timestamptz) from career_publisher',
  );
  const partialBaseline = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/migrate.ts', '--baseline', '0022'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      encoding: 'utf8',
    },
  );
  assert.equal(partialBaseline.status, 1);
  assert.match(partialBaseline.stderr, /does not match baseline 0022/);
  await target.query(
    'grant execute on function app.mint_publication(uuid,bytea,timestamptz) to career_publisher',
  );
  const migrated = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/migrate.ts', '--baseline', '0022'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      encoding: 'utf8',
    },
  );
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  assert.match(migrated.stdout, /Applied 9 migrations; schema at 0031\./);
  const rerun = spawnSync('pnpm', ['exec', 'tsx', 'scripts/migrate.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    encoding: 'utf8',
  });
  assert.equal(rerun.status, 0, rerun.stderr || rerun.stdout);
  assert.match(rerun.stdout, /Applied 0 migrations; schema at 0031\./);
  const migratedState = await target.query(
    `select
      (select count(*)::integer from public.career_os_schema_migrations) as migration_count,
      (select bool_and(company_sources = '[]'::jsonb) from app.applications) as applications_defaulted,
      (select bool_and(company_sources = '[]'::jsonb) from app.opportunities) as opportunities_defaulted,
      (select count(*)::integer from information_schema.tables
        where table_schema = 'app'
          and table_name in ('discovered_jobs', 'job_source_records')) as discovery_tables`,
  );
  assert.deepEqual(migratedState.rows[0], {
    migration_count: 31,
    applications_defaulted: true,
    opportunities_defaulted: true,
    discovery_tables: 2,
  });

  await target.query(
    `select set_config('request.jwt.claim.sub', $1, false),
      set_config('request.jwt.claim.tenant_id', $2, false)`,
    ['00000000-0000-4000-8000-000000000002', tenantId],
  );
  await target.query('set role career_app');
  const firstAttempt = await target.query(
    'select app.reserve_url_import($1::uuid) as id',
    [tenantId],
  );
  await assert.rejects(
    target.query('select app.reserve_url_import($1::uuid)', [tenantId]),
    /url import rate limited/,
  );
  await target.query('select app.finish_url_import($1::uuid, $2)', [
    firstAttempt.rows[0].id,
    'succeeded',
  ]);
  for (let index = 0; index < 4; index += 1) {
    const attempt = await target.query(
      'select app.reserve_url_import($1::uuid) as id',
      [tenantId],
    );
    await target.query('select app.finish_url_import($1::uuid, $2)', [
      attempt.rows[0].id,
      'rejected',
    ]);
  }
  await assert.rejects(
    target.query('select app.reserve_url_import($1::uuid)', [tenantId]),
    /url import rate limited/,
  );
  await target.query('reset role');

  const secondTenantId = '00000000-0000-4000-8000-000000000003';
  await target.query(
    `insert into app.tenants (id, owner_id, name) values ($1, $2, 'Second workspace')`,
    [secondTenantId, '00000000-0000-4000-8000-000000000002'],
  );
  await target.query(
    `select set_config('request.jwt.claim.sub', $1, false),
      set_config('request.jwt.claim.tenant_id', $2, false)`,
    ['00000000-0000-4000-8000-000000000002', secondTenantId],
  );
  await target.query('set role career_app');
  await assert.rejects(
    target.query('select app.reserve_url_import($1::uuid)', [secondTenantId]),
    /url import rate limited/,
  );
  await target.query('reset role');

  const concurrentClients = [];
  for (let index = 1; index <= 9; index += 1) {
    const suffix = String(index).padStart(12, '0');
    const owner = `10000000-0000-4000-8000-${suffix}`;
    const tenant = `20000000-0000-4000-8000-${suffix}`;
    await target.query(
      `insert into app.tenants (id, owner_id, name) values ($1, $2, $3)`,
      [tenant, owner, `Global ${index}`],
    );
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, false),
        set_config('request.jwt.claim.tenant_id', $2, false)`,
      [owner, tenant],
    );
    await client.query('set role career_app');
    concurrentClients.push({ client, tenant });
  }
  try {
    const reservations = await Promise.allSettled(
      concurrentClients.map(({ client, tenant }) =>
        client.query('select app.reserve_url_import($1::uuid) as id', [tenant]),
      ),
    );
    const successful = reservations
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === 'fulfilled');
    const rejected = reservations.filter(
      (result) => result.status === 'rejected',
    );
    assert.equal(successful.length, 8);
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0].reason), /url import rate limited/);

    const ownerReservation = successful[0];
    const attemptId = ownerReservation.result.value.rows[0].id;
    const otherClient =
      concurrentClients[(ownerReservation.index + 1) % 8].client;
    await assert.rejects(
      otherClient.query('select app.finish_url_import($1::uuid, $2)', [
        attemptId,
        'succeeded',
      ]),
      /url import attempt not found/,
    );
    await concurrentClients[ownerReservation.index].client.query(
      'select app.finish_url_import($1::uuid, $2)',
      [attemptId, 'succeeded'],
    );
  } finally {
    await Promise.all(concurrentClients.map(({ client }) => client.end()));
  }
  console.log('application upgrade, migration ledger and URL import quotas ok');
} finally {
  await target?.end();
  if (adminConnected) {
    await admin.query(`drop database if exists ${testDatabase} with (force)`);
    await admin.end();
  }
}
