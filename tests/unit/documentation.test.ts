import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const files = ['README.md', 'docs/SELF_HOSTING.md', 'SECURITY.md'] as const;
const docs = Object.fromEntries(
  files.map((file) => [file, readFileSync(file, 'utf8')]),
) as Record<(typeof files)[number], string>;
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};

test('launch documentation matches the self-hosted product boundary', () => {
  for (const file of files) {
    for (const match of docs[file].matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:https?:|#)/.test(href)) continue;
      const target = path.resolve(path.dirname(file), href.split('#', 1)[0]);
      assert.equal(existsSync(target), true, `${file}: missing ${href}`);
    }
  }

  const env = readFileSync('.env.example', 'utf8');
  const workers = [
    ['CAREER_OS_WORKER_DATABASE_URL', 'worker:company-researcher'],
    ['CAREER_OS_EVIDENCE_WORKER_DATABASE_URL', 'worker:evidence-archivist'],
    ['CAREER_OS_STRATEGY_WORKER_DATABASE_URL', 'worker:recruiter-strategist'],
    ['CAREER_OS_PAGE_COMPOSER_DATABASE_URL', 'worker:page-composer'],
    ['CAREER_OS_RECRUITER_REVIEWER_DATABASE_URL', 'worker:recruiter-reviewer'],
    [
      'CAREER_OS_HIRING_MANAGER_REVIEWER_DATABASE_URL',
      'worker:hiring-manager-reviewer',
    ],
    [
      'CAREER_OS_FACTUALITY_REVIEWER_DATABASE_URL',
      'worker:factuality-reviewer',
    ],
    ['CAREER_OS_DISCOVERY_DATABASE_URL', 'worker:job-discovery'],
  ] as const;
  for (const [variable, script] of workers) {
    assert.match(env, new RegExp(`^${variable}=`, 'm'));
    assert.ok(docs['docs/SELF_HOSTING.md'].includes('`' + variable + '`'));
    assert.ok(packageJson.scripts[script], `package.json: missing ${script}`);
  }

  assert.match(env, /^CAREER_OS_DEPLOYMENT_MODE=self-hosted$/m);
  assert.match(README, /managed service is a future deployment target/i);
  assert.match(
    docs['docs/SELF_HOSTING.md'],
    /does not provide managed backups, email delivery, billing/i,
  );
  assert.match(
    SECURITY,
    /Planned managed-cloud boundary, not yet implemented/i,
  );
});

test('the documented security gate covers every launch boundary', () => {
  const command = packageJson.scripts['test:security'];
  for (const evidence of [
    'safe-http.test.ts',
    'profile-import.test.ts',
    'publication-security.test.ts',
    'tenant_isolation.sql',
    'auth_security.sql',
    'capability_security.sql',
    'test:integration:http',
  ])
    assert.match(command, new RegExp(evidence.replace('.', '\\.')));
});

const README = docs['README.md'];
const SECURITY = docs['SECURITY.md'];
