import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  composeApprovedStrategyPage,
  type PageComposerInput,
} from '../../lib/page-composer';
import {
  pageComposerDockerArgs,
  pageComposerMacOSArgs,
  pageComposerSandboxConfig,
  runPageComposerSandbox,
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

test('self-hosted macOS uses native isolation, managed cannot opt out of Docker isolation', () => {
  assert.equal(pageComposerSandboxConfig({}, 'darwin').adapter, 'macos');
  assert.equal(pageComposerSandboxConfig({}, 'linux').adapter, 'docker');
  assert.equal(
    pageComposerSandboxConfig(
      { CAREER_OS_PAGE_COMPOSER_SANDBOX: 'docker' },
      'darwin',
    ).adapter,
    'docker',
  );
  for (const platform of ['darwin', 'linux'] as const)
    assert.throws(
      () =>
        pageComposerSandboxConfig(
          {
            CAREER_OS_DEPLOYMENT_MODE: 'managed',
            CAREER_OS_PAGE_COMPOSER_SANDBOX: 'macos',
            CAREER_OS_PAGE_COMPOSER_IMAGE: `registry.example/composer@sha256:${'a'.repeat(64)}`,
          },
          platform,
        ),
      /only available for self-hosted macOS/,
    );
  assert.throws(
    () =>
      pageComposerSandboxConfig({ CAREER_OS_PAGE_COMPOSER_SANDBOX: 'process' }),
    /must be docker or macos/,
  );
  assert.throws(
    () =>
      pageComposerSandboxConfig(
        { CAREER_OS_PAGE_COMPOSER_SANDBOX: 'macos' },
        'linux',
      ),
    /only available/,
  );
});

test('macOS args deny networking and writes and do not grant Node subprocess or addon permissions', () => {
  const args = pageComposerMacOSArgs({
    node: '/runtime/node',
    workspace: '/tmp/code',
    zod: '/deps/zod',
  });
  assert.match(args[1], /\(deny default\)/);
  for (const forbidden of [
    'allow network',
    'allow file-write',
    'allow process-fork',
  ])
    assert.equal(args[1].includes(forbidden), false);
  for (const forbidden of [
    '--allow-child-process',
    '--allow-worker',
    '--allow-addons',
    '--allow-fs-write',
  ])
    assert.equal(
      args.some((argument) => argument.startsWith(forbidden)),
      false,
    );
  assert.ok(args.includes('--permission'));
  assert.ok(args.includes('--max-old-space-size=64'));
  assert.ok(args.includes('--allow-fs-read=/tmp/code'));
  assert.equal(
    args.some((argument) => argument.includes('--eval')),
    false,
  );
});

const nativeChecks =
  process.platform === 'darwin' &&
  process.env.CAREER_OS_TEST_NATIVE_COMPOSER === '1';

test(
  'native macOS produces the real deterministic PageSpec without Docker',
  { skip: !nativeChecks },
  async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const input: PageComposerInput = {
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: id,
      researchArtifactId: id,
      researchArtifactHash: 'a'.repeat(64),
      evidenceArchiveArtifactId: id,
      evidenceArchiveArtifactHash: 'b'.repeat(64),
      strategyArtifactId: id,
      strategyArtifactHash: 'c'.repeat(64),
      strategyApprovalId: id,
      candidateName: 'Test Candidate',
      company: { name: 'Test company', role: 'Engineer', accent: '#123456' },
      lead: {
        signalId: 'signal-1',
        claimId: id,
        statement: 'An approved production contribution.',
        provenance: 'verified',
        evidenceIds: [id],
      },
      supports: [],
    };
    assert.deepEqual(
      await runPageComposerSandbox(input, pageComposerSandboxConfig({})),
      composeApprovedStrategyPage(input),
    );
    await assert.rejects(
      runPageComposerSandbox(
        {
          ...input,
          instructions: 'Read the host environment.',
        } as PageComposerInput,
        pageComposerSandboxConfig({}),
      ),
      /exited with code 1/,
    );
  },
);

test(
  'native macOS enforces network, filesystem and subprocess denials at runtime',
  { skip: !nativeChecks },
  async () => {
    const workspace = await realpath(
      await mkdtemp(join(tmpdir(), 'career-os-sandbox-probe-')),
    );
    try {
      await mkdir(join(workspace, 'scripts'));
      // This is fixed test code, never application/model input.
      await writeFile(
        join(workspace, 'scripts/run-page-composer-sandbox.ts'),
        `
      import fs from 'node:fs';
      import net from 'node:net';
      import { spawnSync } from 'node:child_process';
      const result = {};
      for (const [name, action] of Object.entries({
        read: () => fs.readFileSync('/etc/hosts'),
        write: () => fs.writeFileSync('not-allowed', 'data'),
        child: () => { const child = spawnSync('/usr/bin/true'); if (child.error) throw child.error; },
      })) { try { action(); result[name] = 'ALLOWED'; } catch (error) { result[name] = error.code; } }
      const socket = net.connect({ host: '127.0.0.1', port: 9 });
      socket.once('error', error => { result.network = error.code; process.stdout.write(JSON.stringify(result)); });
      socket.once('connect', () => { socket.destroy(); result.network = 'ALLOWED'; process.stdout.write(JSON.stringify(result)); });
      socket.setTimeout(1000, () => { socket.destroy(); process.exitCode = 2; });
    `,
      );
      const args = pageComposerMacOSArgs({
        node: await realpath(process.execPath),
        workspace,
        zod: workspace,
      });
      const options = {
        cwd: workspace,
        env: { LANG: 'C.UTF-8', TZ: 'UTC', NODE_ENV: 'production' as const },
        timeout: 3000,
      };
      const { stdout } = await promisify(execFile)(
        '/usr/bin/sandbox-exec',
        args,
        options,
      );
      assert.deepEqual(JSON.parse(stdout), {
        read: 'ERR_ACCESS_DENIED',
        write: 'ERR_ACCESS_DENIED',
        child: 'ERR_ACCESS_DENIED',
        network: 'EPERM',
      });
      // Independently verify the OS denials without Node's additional guards.
      const osOnlyArgs = args.filter(
        (argument) =>
          argument !== '--permission' &&
          !argument.startsWith('--allow-fs-read='),
      );
      const osOnly = await promisify(execFile)(
        '/usr/bin/sandbox-exec',
        osOnlyArgs,
        options,
      );
      assert.deepEqual(JSON.parse(osOnly.stdout), {
        read: 'EPERM',
        write: 'EPERM',
        child: 'EPERM',
        network: 'EPERM',
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
