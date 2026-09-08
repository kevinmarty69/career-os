import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import type { Client } from 'pg';
import { migrationSql } from '../../lib/migration-sql';

export const fixtureIdentitySql = `create or replace function pg_temp.seed_identity(tenant uuid, actor uuid)
returns void language plpgsql as $$ begin
  insert into career_identity."user"(id,name,email,"emailVerified")
    values(actor,'Test identity',actor::text||'@example.test',true) on conflict(id) do nothing;
  insert into career_identity.organization(id,name,slug,"createdAt")
    values(tenant,'Test workspace',tenant::text,now()) on conflict(id) do nothing;
  insert into career_identity.member(id,"organizationId","userId",role,"createdAt")
    values(gen_random_uuid(),tenant,actor,'owner',now()) on conflict("organizationId","userId") do nothing;
end $$;`;

export async function bootstrapTestAuth(client: Client) {
  const source = process.env.CAREER_OS_TEST_DATABASE_URL;
  assert.equal(
    process.env.CAREER_OS_NATIVE_TEST,
    '1',
    'Use the native disposable test runner.',
  );
  assert.ok(source);
  // Copy the actual GoTrue schema, not a hand-written approximation of auth.sessions.
  const schema = execFileSync(
    'pg_dump',
    [
      '--dbname',
      source,
      '--schema=auth',
      '--schema-only',
      '--no-owner',
      '--no-privileges',
    ],
    { encoding: 'utf8' },
  );
  await client.query(schema.replace(/^\\.*$/gm, ''));
}

export async function applyTestMigrations(client: Client) {
  await bootstrapTestAuth(client);
  for (const name of (await readdir('supabase/migrations'))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort())
    await client.query(
      migrationSql(name, await readFile(`supabase/migrations/${name}`, 'utf8')),
    );
  await client.query(fixtureIdentitySql);
}
