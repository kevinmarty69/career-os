import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';

const adminDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://career_os:career_os@127.0.0.1:54329/career_os';
const adminUrl = new URL(adminDatabaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname) ||
  adminUrl.pathname !== '/career_os'
)
  throw new Error(
    'HTTP integration tests require the local disposable career_os database.',
  );

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const databaseName = `career_os_http_${suffix}`;
const targetDatabaseUrl = new URL(adminUrl);
targetDatabaseUrl.pathname = `/${databaseName}`;
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  BETTER_AUTH_URL: baseUrl,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    'career-os-http-integration-secret-at-least-32-characters',
  CAREER_OS_DEPLOYMENT_MODE: 'self-hosted',
  CAREER_OS_E2E: '1',
  CAREER_OS_HTTP_TEST_SUFFIX: suffix,
  DATABASE_URL: targetDatabaseUrl.toString(),
  TEST_AUTH_ORIGIN: baseUrl,
  TEST_BASE_URL: baseUrl,
  TEST_REQUEST_ORIGIN: baseUrl,
};
const tests = [
  'tests/integration/auth-publication.test.ts',
  'tests/integration/applications.test.ts',
  'tests/integration/agent-runs.test.ts',
];
const workerLogins = [
  `publication_recruiter_${suffix}`,
  `publication_hiring_${suffix}`,
  `publication_factuality_${suffix}`,
];

const admin = new Client({ connectionString: adminUrl.toString() });
const children = new Set();
let adminConnected = false;
let databaseCreated = false;
let server;
let cleanupPromise;

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
])
  process.on(signal, () => {
    void cleanup().finally(() => process.exit(code));
  });

try {
  await admin.connect();
  adminConnected = true;
  databaseCreated = true;
  try {
    await admin.query(`create database ${databaseName}`);
  } catch (error) {
    databaseCreated = false;
    throw error;
  }
  await run('pnpm', ['db:migrate'], environment);
  server = spawnTracked(
    'pnpm',
    ['exec', 'next', 'start', '-p', String(port)],
    environment,
  );
  await waitForServer();
  for (const test of tests)
    await run('pnpm', ['exec', 'tsx', test], environment);
} finally {
  await cleanup();
}

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  if (!address || typeof address === 'string')
    throw new Error('Unable to reserve an HTTP integration test port.');
  await new Promise((resolve) => socket.close(resolve));
  return address.port;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Next.js exited before readiness (${server.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/api/instance-status`);
      if (response.status === 401) {
        await delay(100);
        if (server.exitCode === null) return;
      }
    } catch {}
    await delay(250);
  }
  throw new Error(`Next.js was not ready at ${baseUrl} within 30 seconds.`);
}

function spawnTracked(command, args, env) {
  const child = spawn(command, args, { env, stdio: 'inherit' });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawnTracked(command, args, env);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`),
        );
    });
  });
}

function cleanup() {
  cleanupPromise ??= (async () => {
    await stopChildren();
    if (!adminConnected) return;
    if (databaseCreated)
      await admin
        .query(`drop database if exists ${databaseName} with (force)`)
        .catch(() => undefined);
    for (const login of workerLogins)
      await admin.query(`drop role if exists ${login}`).catch(() => undefined);
    await admin.end();
    adminConnected = false;
  })();
  return cleanupPromise;
}

async function stopChildren() {
  const live = [...children].filter((child) => child.exitCode === null);
  for (const child of live) child.kill('SIGTERM');
  await Promise.race([Promise.all(live.map(waitForExit)), delay(5_000)]);
  for (const child of live) if (child.exitCode === null) child.kill('SIGKILL');
  await Promise.race([Promise.all(live.map(waitForExit)), delay(1_000)]);
}

function waitForExit(child) {
  return child.exitCode === null
    ? new Promise((resolve) => child.once('exit', resolve))
    : Promise.resolve();
}
