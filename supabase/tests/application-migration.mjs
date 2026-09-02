import assert from 'node:assert/strict';
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
  await target.query(
    await readFile('supabase/migrations/0009_applications.sql', 'utf8'),
  );

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
  console.log('application migration upgrade ok');
} finally {
  await target?.end();
  if (adminConnected) {
    await admin.query(`drop database if exists ${testDatabase} with (force)`);
    await admin.end();
  }
}
