import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_PAGE_COMPOSER_INPUT_BYTES,
  MAX_PAGE_COMPOSER_OUTPUT_BYTES,
  type PageComposerInput,
} from '../page-composer';
import { deploymentModeSchema } from '../run-contract';
import type { z } from 'zod';

const MAX_STDERR_BYTES = 8 * 1024;
const TIMEOUT_MS = 15_000;
const IMAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@:-]{0,499}$/;
const DIGEST_PATTERN = /@sha256:[0-9a-f]{64}$/;

export type PageComposerSandboxConfig = {
  image: string;
  mode: z.infer<typeof deploymentModeSchema>;
  adapter: 'docker' | 'macos';
};

export function pageComposerSandboxConfig(
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): PageComposerSandboxConfig {
  const mode = deploymentModeSchema.parse(
    environment.CAREER_OS_DEPLOYMENT_MODE ?? 'self-hosted',
  );
  const image =
    environment.CAREER_OS_PAGE_COMPOSER_IMAGE ??
    (mode === 'self-hosted' ? 'career-os-page-composer:local' : '');
  const adapter =
    environment.CAREER_OS_PAGE_COMPOSER_SANDBOX ??
    (mode === 'self-hosted' && platform === 'darwin' ? 'macos' : 'docker');
  if (adapter !== 'docker' && adapter !== 'macos')
    throw new Error('CAREER_OS_PAGE_COMPOSER_SANDBOX must be docker or macos.');
  if (adapter === 'macos' && (mode !== 'self-hosted' || platform !== 'darwin'))
    throw new Error(
      'The macOS composer adapter is only available for self-hosted macOS.',
    );
  if (!IMAGE_PATTERN.test(image))
    throw new Error('CAREER_OS_PAGE_COMPOSER_IMAGE is invalid.');
  if (mode === 'managed' && !DIGEST_PATTERN.test(image))
    throw new Error(
      'Managed page composer images must be pinned by sha256 digest.',
    );
  return { image, mode, adapter };
}

/** Only trusted repository code runs here; no generated JS, shell, plugins or eval. */
export function pageComposerMacOSArgs(paths: {
  node: string;
  workspace: string;
  zod: string;
}): string[] {
  const literal = (path: string) => `(literal ${JSON.stringify(path)})`;
  const subpath = (path: string) => `(subpath ${JSON.stringify(path)})`;
  const runtime = [
    '/System/Library',
    '/System/Cryptexes/OS',
    '/System/Volumes/Preboot/Cryptexes/OS',
    '/usr/lib',
    join(dirname(dirname(paths.node)), 'lib'),
  ]
    .map(subpath)
    .join(' ');
  // Homebrew Node links to versioned dylibs outside its own installation prefix.
  const dylibs =
    '(regex #"^/(opt/homebrew|usr/local)/(Cellar|opt)/.*[.]dylib$")';
  const profile = [
    '(version 1)',
    '(deny default)',
    `(allow process-exec ${literal(paths.node)})`,
    '(allow process-info* (target self))',
    '(allow sysctl-read)',
    '(allow file-read-metadata)',
    // dyld's libignition opens the root directory as its openat base.
    // This permits that directory only, not its contents recursively.
    `(allow file-read* ${literal('/')})`,
    `(allow file-read* ${literal(paths.node)} ${subpath(paths.workspace)} ${subpath(paths.zod)} ${runtime} ${dylibs} ${literal('/dev/urandom')} ${literal('/dev/null')})`,
    `(allow file-map-executable ${literal(paths.node)} ${runtime} ${dylibs})`,
  ].join('\n');
  return [
    '-p',
    profile,
    paths.node,
    '--permission',
    `--allow-fs-read=${paths.workspace}`,
    `--allow-fs-read=${paths.zod}`,
    '--max-old-space-size=64',
    '--disable-proto=throw',
    '--no-addons',
    '--openssl-config=/dev/null',
    '--no-warnings',
    join(paths.workspace, 'scripts/run-page-composer-sandbox.ts'),
  ];
}

async function nativeComposer() {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('The native page composer requires Node.js 24 or later.');
  const workspace = await realpath(
    await mkdtemp(join(tmpdir(), 'career-os-composer-')),
  );
  const dispose = () => rm(workspace, { recursive: true, force: true });
  try {
    const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
    const zod = await realpath(
      dirname(createRequire(import.meta.url).resolve('zod/package.json')),
    );
    await mkdir(join(workspace, 'scripts'));
    await mkdir(join(workspace, 'lib'));
    await mkdir(join(workspace, 'node_modules'));
    await copyFile(
      join(sourceRoot, 'lib/page-composer.ts'),
      join(workspace, 'lib/page-composer.ts'),
    );
    await copyFile(
      join(sourceRoot, 'scripts/run-page-composer-sandbox.ts'),
      join(workspace, 'scripts/run-page-composer-sandbox.ts'),
    );
    await symlink(zod, join(workspace, 'node_modules/zod'), 'dir');
    await writeFile(join(workspace, 'package.json'), '{"type":"module"}');
    return {
      command: '/usr/bin/sandbox-exec',
      args: pageComposerMacOSArgs({
        node: await realpath(process.execPath),
        workspace,
        zod,
      }),
      options: {
        cwd: workspace,
        env: { LANG: 'C.UTF-8', TZ: 'UTC', NODE_ENV: 'production' as const },
      },
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export function pageComposerDockerArgs(
  image: string,
  containerName: string,
): string[] {
  if (!IMAGE_PATTERN.test(image)) throw new Error('Invalid sandbox image.');
  return [
    'run',
    '--rm',
    '--interactive',
    '--pull=never',
    `--name=${containerName}`,
    '--network=none',
    '--user=65532:65532',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges=true',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16777216,mode=1777',
    '--cpus=0.50',
    '--memory=128m',
    '--memory-swap=128m',
    '--pids-limit=64',
    '--ulimit=nofile=64:64',
    '--stop-timeout=1',
    '--log-driver=none',
    image,
  ];
}

export async function runPageComposerSandbox(
  input: PageComposerInput,
  config: PageComposerSandboxConfig,
): Promise<unknown> {
  const { image, adapter } = pageComposerSandboxConfig({
    CAREER_OS_DEPLOYMENT_MODE: config.mode,
    CAREER_OS_PAGE_COMPOSER_IMAGE: config.image,
    CAREER_OS_PAGE_COMPOSER_SANDBOX: config.adapter,
  });
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized) > MAX_PAGE_COMPOSER_INPUT_BYTES)
    throw new Error('Page composer sandbox input exceeds its size limit.');

  const containerName = `career-os-page-composer-${randomUUID()}`;
  const native = adapter === 'macos' ? await nativeComposer() : undefined;
  const child = spawn(
    native?.command ?? 'docker',
    native?.args ?? pageComposerDockerArgs(image, containerName),
    {
      ...native?.options,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let forcedError: Error | undefined;
  let cleanup: Promise<void> | undefined;

  const forceStop = (error: Error) => {
    if (forcedError) return;
    forcedError = error;
    child.stdin.destroy();
    child.kill('SIGKILL');
    if (native) return;
    cleanup = new Promise((resolve) => {
      execFile(
        'docker',
        ['rm', '--force', containerName],
        { timeout: 5_000 },
        () => resolve(),
      );
    });
  };

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_PAGE_COMPOSER_OUTPUT_BYTES)
      forceStop(new Error('Page composer sandbox output exceeded its limit.'));
    else stdout.push(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBytes += chunk.length;
    if (stderrBytes > MAX_STDERR_BYTES)
      forceStop(
        new Error('Page composer sandbox error output exceeded its limit.'),
      );
  });
  child.stdin.on('error', () => undefined);

  const timeout = setTimeout(
    () => forceStop(new Error('Page composer sandbox timed out.')),
    TIMEOUT_MS,
  );
  child.stdin.end(serialized);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  }).finally(async () => {
    clearTimeout(timeout);
    await native?.dispose();
  });
  await cleanup;
  if (forcedError) throw forcedError;
  if (exitCode !== 0)
    throw new Error(`Page composer sandbox exited with code ${exitCode}.`);

  const raw = Buffer.concat(stdout).toString('utf8');
  if (!raw.trim()) throw new Error('Page composer sandbox returned no output.');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Page composer sandbox returned invalid JSON.');
  }
}
