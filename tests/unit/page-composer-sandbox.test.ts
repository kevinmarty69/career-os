import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pageComposerDockerArgs,
  pageComposerSandboxConfig,
} from '../../lib/server/page-composer-sandbox';

test('page composer sandbox is resource-bounded and managed images use a digest', () => {
  const args = pageComposerDockerArgs(
    'career-os-page-composer:local',
    'career-os-page-composer-test',
  );
  for (const required of [
    '--network=none',
    '--user=65532:65532',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges=true',
    '--cpus=0.50',
    '--memory=128m',
    '--memory-swap=128m',
    '--pids-limit=64',
  ])
    assert.ok(args.includes(required), `missing ${required}`);
  assert.equal(
    args.some((argument) => argument.startsWith('--env')),
    false,
  );
  assert.equal(
    args.some(
      (argument) =>
        argument.startsWith('--volume') || argument.startsWith('--mount'),
    ),
    false,
  );
  assert.throws(
    () =>
      pageComposerSandboxConfig({
        CAREER_OS_DEPLOYMENT_MODE: 'managed',
        CAREER_OS_PAGE_COMPOSER_IMAGE: 'registry.example/composer:latest',
      }),
    /pinned by sha256 digest/,
  );
  assert.equal(
    pageComposerSandboxConfig({
      CAREER_OS_DEPLOYMENT_MODE: 'managed',
      CAREER_OS_PAGE_COMPOSER_IMAGE: `registry.example/composer@sha256:${'a'.repeat(64)}`,
    }).mode,
    'managed',
  );
});
