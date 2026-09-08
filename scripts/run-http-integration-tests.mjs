import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';

const adminDatabaseUrl = process.env.DATABASE_URL;
if (process.env.CAREER_OS_NATIVE_TEST !== '1' || !adminDatabaseUrl)
  throw new Error('Run HTTP tests with pnpm test:native.');
const adminUrl = new URL(adminDatabaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname) ||
  !/^\/career_os_test_[a-f0-9]{12}$/.test(adminUrl.pathname)
)
  throw new Error(
    'HTTP integration tests require the local disposable career_os database.',
  );

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const targetDatabaseUrl = new URL(adminUrl);
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  CAREER_OS_APP_URL: baseUrl,
  CAREER_OS_DEPLOYMENT_MODE: 'self-hosted',
  CAREER_OS_E2E: '1',
  CAREER_OS_HTTP_TEST_SUFFIX: suffix,
  CAREER_OS_LOCAL_MODEL_BASE_URL: '',
  CAREER_OS_LOCAL_MODEL: '',
  DATABASE_URL: targetDatabaseUrl.toString(),
  TEST_AUTH_ORIGIN: baseUrl,
  TEST_BASE_URL: baseUrl,
  TEST_REQUEST_ORIGIN: baseUrl,
};
const tests = [
  'tests/integration/auth-publication.test.ts',
  'tests/integration/applications.test.ts',
  'tests/integration/opportunities.test.ts',
  'tests/integration/opportunity-decisions.test.ts',
  'tests/integration/agent-runs.test.ts',
];
const workerLogins = [
  `publication_recruiter_${suffix}`,
  `publication_hiring_${suffix}`,
  `publication_factuality_${suffix}`,
];
const webLogin = `http_web_${suffix}`;
const webPassword = randomUUID();
const webDatabaseUrl = new URL(targetDatabaseUrl);
webDatabaseUrl.username = webLogin;
webDatabaseUrl.password = webPassword;

const admin = new Client({ connectionString: adminUrl.toString() });
const children = new Set();
let adminConnected = false;
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
  await admin.query(
    `create role ${webLogin} login inherit password '${webPassword}' in role career_web`,
  );
  const {
    rows: [permissions],
  } = await admin.query(
    `select has_function_privilege($1, 'career_identity.active_session(uuid, uuid)', 'execute') as session_access,
      pg_has_role($1, 'career_app', 'usage') as implicit_app_access`,
    [webLogin],
  );
  assert.equal(
    permissions.session_access,
    true,
    'Web login can verify sessions',
  );
  assert.equal(
    permissions.implicit_app_access,
    false,
    'Tenant role remains explicit',
  );
  server = spawnTracked('pnpm', ['exec', 'next', 'start', '-p', String(port)], {
    ...environment,
    DATABASE_URL: webDatabaseUrl.toString(),
    MIGRATION_DATABASE_URL: '',
    SUPABASE_SECRET_KEY: '',
    CAREER_OS_TEST_DATABASE_URL: '',
    LOCAL_POSTGRES_URL: '',
  });
  await waitForServer();
  for (const test of tests)
    await run(
      'pnpm',
      ['exec', 'tsx', test],
      [
        'tests/integration/opportunities.test.ts',
        'tests/integration/opportunity-decisions.test.ts',
      ].includes(test)
        ? {
            ...environment,
            NODE_OPTIONS: [
              environment.NODE_OPTIONS,
              '--conditions=react-server',
            ]
              .filter(Boolean)
              .join(' '),
          }
        : environment,
    );
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
    for (const login of [...workerLogins, webLogin])
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
