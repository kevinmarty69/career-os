import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
};

export function pageComposerSandboxConfig(
  environment: Readonly<Record<string, string | undefined>>,
): PageComposerSandboxConfig {
  const mode = deploymentModeSchema.parse(
    environment.CAREER_OS_DEPLOYMENT_MODE ?? 'self-hosted',
  );
  const image =
    environment.CAREER_OS_PAGE_COMPOSER_IMAGE ??
    (mode === 'self-hosted' ? 'career-os-page-composer:local' : '');
  if (!IMAGE_PATTERN.test(image))
    throw new Error('CAREER_OS_PAGE_COMPOSER_IMAGE is invalid.');
  if (mode === 'managed' && !DIGEST_PATTERN.test(image))
    throw new Error(
      'Managed page composer images must be pinned by sha256 digest.',
    );
  return { image, mode };
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
  const { image } = pageComposerSandboxConfig({
    CAREER_OS_DEPLOYMENT_MODE: config.mode,
    CAREER_OS_PAGE_COMPOSER_IMAGE: config.image,
  });
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized) > MAX_PAGE_COMPOSER_INPUT_BYTES)
    throw new Error('Page composer sandbox input exceeds its size limit.');

  const containerName = `career-os-page-composer-${randomUUID()}`;
  const child = spawn('docker', pageComposerDockerArgs(image, containerName), {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
  }).finally(() => clearTimeout(timeout));
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
