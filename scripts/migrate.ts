import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const MIGRATION_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK = 1_220_251_833;

type Migration = { name: string; checksum: string; sql: string };

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const baseline = parseBaseline(process.argv.slice(2));
  const migrationDirectory = path.resolve('supabase/migrations');
  const migrations = await loadMigrations(migrationDirectory);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1::bigint)', [MIGRATION_LOCK]);
    await client.query(`create table if not exists public.career_os_schema_migrations (
      name text primary key,
      checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz not null default clock_timestamp()
    )`);
    await client.query(
      'revoke all on public.career_os_schema_migrations from public',
    );
    const applied = await readApplied(client);
    const hasAppSchema = Boolean(
      (
        await client.query(
          "select to_regnamespace('app') is not null as present",
        )
      ).rows[0]?.present,
    );
    if (baseline) {
      if (applied.size || !hasAppSchema)
        throw new Error(
          'Baseline is allowed only once on an existing untracked Career OS database.',
        );
      await validateBaselineFingerprint(client, baseline);
      await recordBaseline(client, migrations, baseline);
    } else if (!applied.size && hasAppSchema) {
      throw new Error(
        'Existing database is untracked. Back it up, then rerun with --baseline <last-applied-version>.',
      );
    }

    const current = await readApplied(client);
    validateAppliedPrefix(migrations, current);
    let count = 0;
    for (const migration of migrations) {
      if (current.has(migration.name)) continue;
      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query(
          `insert into public.career_os_schema_migrations (name, checksum)
           values ($1, $2) on conflict (name) do update
           set checksum = excluded.checksum`,
          [migration.name, migration.checksum],
        );
        await client.query('commit');
        count += 1;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
    console.log(
      `Applied ${count} migration${count === 1 ? '' : 's'}; schema at ${migrations.at(-1)?.name.slice(0, 4)}.`,
    );
  } finally {
    await client
      .query('select pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK])
      .catch(() => undefined);
    await client.end();
  }
}

async function loadMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory))
    .filter((name) => MIGRATION_PATTERN.test(name))
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(path.join(directory, name), 'utf8');
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

async function readApplied(client: Client) {
  const result = await client.query<{
    name: string;
    checksum: string;
  }>(
    'select name, checksum from public.career_os_schema_migrations order by name',
  );
  return new Map(result.rows.map(({ name, checksum }) => [name, checksum]));
}

async function recordBaseline(
  client: Client,
  migrations: Migration[],
  version: string,
) {
  const last = migrations.findIndex((migration) =>
    migration.name.startsWith(`${version}_`),
  );
  if (last < 0) throw new Error(`Unknown migration baseline: ${version}.`);
  await client.query('begin');
  try {
    for (const migration of migrations.slice(0, last + 1))
      await client.query(
        `insert into public.career_os_schema_migrations (name, checksum)
         values ($1, $2)`,
        [migration.name, migration.checksum],
      );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function validateBaselineFingerprint(client: Client, version: string) {
  if (version !== '0022')
    throw new Error('The only supported untracked baseline is 0022.');
  const result = await client.query<{ valid: boolean }>(
    `select
      to_regprocedure('app.reject_untrusted_living_claim()') is not null
      and exists (
        select 1 from pg_trigger
        where tgrelid = 'app.claims'::regclass
          and tgname = 'reject_untrusted_living_claim' and tgenabled <> 'D'
      )
      and exists (
        select 1 from pg_trigger
        where tgrelid = 'app.profiles'::regclass
          and tgname = 'reject_untrusted_living_profile' and tgenabled <> 'D'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'app' and table_name = 'workflow_runs'
          and column_name = 'parent_run_id'
      )
      and position(
        'publication already has an active capability' in coalesce(
          pg_get_functiondef(to_regprocedure('app.mint_publication(uuid,bytea,timestamptz)')),
          ''
        )
      ) > 0
      and has_function_privilege(
        'career_publisher',
        'app.mint_publication(uuid,bytea,timestamptz)',
        'execute'
      )
      and not has_function_privilege(
        'public',
        'app.mint_publication(uuid,bytea,timestamptz)',
        'execute'
      )
      and not exists (
        select 1 from information_schema.columns
        where table_schema = 'app' and table_name = 'applications'
          and column_name = 'company_sources'
      )
      and to_regprocedure(
        'app.prepare_company_researcher_sources(uuid,uuid,jsonb)'
      ) is null as valid`,
  );
  if (!result.rows[0]?.valid)
    throw new Error(`Database does not match baseline ${version}.`);
}

function validateAppliedPrefix(
  migrations: Migration[],
  applied: Map<string, string>,
) {
  const known = new Set(migrations.map(({ name }) => name));
  for (const name of applied.keys())
    if (!known.has(name))
      throw new Error(`Unknown applied migration: ${name}.`);
  let missingSeen = false;
  for (const migration of migrations) {
    const checksum = applied.get(migration.name);
    if (!checksum) {
      missingSeen = true;
      continue;
    }
    if (missingSeen)
      throw new Error('Applied migrations are not a contiguous prefix.');
    if (checksum !== migration.checksum)
      throw new Error(`Migration checksum mismatch: ${migration.name}.`);
  }
}

function parseBaseline(args: string[]) {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (!normalized.length) return undefined;
  if (
    normalized.length !== 2 ||
    normalized[0] !== '--baseline' ||
    !/^\d{4}$/.test(normalized[1])
  )
    throw new Error('Usage: pnpm db:migrate [-- --baseline 0022]');
  return normalized[1];
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
