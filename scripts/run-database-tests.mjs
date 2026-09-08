import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fixtureIdentitySql } from '../tests/integration/database-fixtures.ts';

assert.equal(
  process.env.CAREER_OS_NATIVE_TEST,
  '1',
  'Run via pnpm test:native; never against a live database.',
);
const files = [
  'tenant_isolation',
  'trust_foundation',
  'career_memory_history',
  'agent_ledger',
  'capability_security',
  'auth_security',
  'workspace_deletion',
  'agent_runs',
  'hitl_decisions',
  'applications',
  'publication_inventory',
  'worker-heartbeats',
  'page-corrections',
  'contact_research',
];
for (const name of files) {
  const sql = await readFile(`supabase/tests/${name}.sql`, 'utf8');
  const result = spawnSync(
    'psql',
    ['--dbname', process.env.DATABASE_URL, '--set=ON_ERROR_STOP=1', '--quiet'],
    {
      input: `${fixtureIdentitySql}\n${sql}`,
      encoding: 'utf8',
    },
  );
  assert.equal(
    result.status,
    0,
    `${name}: ${result.stderr}\n${result.stdout.slice(-1500)}`,
  );
  console.log(`PASS SQL ${name}`);
}
for (const name of [
  'application-migration',
  'budget_concurrency',
  'durable-step-concurrency',
  'scheduled-discovery-concurrency',
  'page-composer',
  'durable-reviewers',
]) {
  const run = spawnSync(
    'node',
    ['--import', 'tsx', `supabase/tests/${name}.mjs`],
    { stdio: 'inherit', env: process.env },
  );
  assert.equal(run.status, 0, name);
}
