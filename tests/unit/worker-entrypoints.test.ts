import assert from 'node:assert/strict';
import test from 'node:test';
import packageJson from '../../package.json';

test('exposes isolated production worker entrypoints', () => {
  const expected = {
    'worker:company-researcher': 'tsx scripts/run-agent-worker.ts',
    'worker:evidence-archivist': 'tsx scripts/run-evidence-worker.ts',
    'worker:recruiter-strategist': 'tsx scripts/run-strategy-worker.ts',
    'worker:page-composer': 'tsx scripts/run-page-composer-worker.ts',
    'worker:job-discovery':
      'NODE_OPTIONS=--conditions=react-server tsx scripts/run-discovery-worker.ts',
    'worker:recruiter-reviewer':
      'CAREER_OS_REVIEWER=recruiter tsx scripts/run-reviewer-worker.ts',
    'worker:hiring-manager-reviewer':
      'CAREER_OS_REVIEWER=hiring-manager tsx scripts/run-reviewer-worker.ts',
    'worker:factuality-reviewer':
      'CAREER_OS_REVIEWER=factuality tsx scripts/run-reviewer-worker.ts',
  } as const;

  for (const [name, command] of Object.entries(expected)) {
    assert.equal(packageJson.scripts[name as keyof typeof expected], command);
    assert.doesNotMatch(command, /--env-file/);
  }
  assert.equal(packageJson.dependencies.tsx, '4.23.13');
  assert.equal('tsx' in packageJson.devDependencies, false);
  assert.equal('worker:all' in packageJson.scripts, false);
});
