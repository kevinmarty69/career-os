import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { userInfo } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';

// Disposable native PostgreSQL + official GoTrue, never Docker or .env.local.
assert.equal(
  process.env.CI,
  'true',
  'Isolated native stack is CI-only. Use the configured hosted Supabase smoke test on this workstation.',
);
const releases = {
  'darwin-arm64': [
    'darwin-arm64.tar.gz',
    '4d3b55133614e97cb139f08dd8d2bcecb4dd82ee9a8fefea985a790aabf5f28b',
  ],
  'linux-x64': [
    'amd64.tar.xz',
    'ecb60cc55e5644c39c2319b73ebb348623ee98f968465590c4829ce853870db5',
  ],
};
const version = 'v2.194.0';
const release = releases[`${process.platform}-${process.arch}`];
assert.ok(release, 'Native test stack supports macOS ARM64 or Linux x64.');
const cache = path.resolve(
  '.cache',
  `supabase-auth-${version}-${process.platform}-${process.arch}`,
);
await mkdir(cache, { recursive: true });
const archive = path.join(cache, `auth-${release[0]}`);
let bytes = await readFile(archive).catch(() => null);
if (!bytes) {
  const response = await fetch(
    `https://github.com/supabase/auth/releases/download/${version}/auth-${version}-${release[0]}`,
  );
  assert.ok(response.ok, 'Official GoTrue binary download failed.');
  bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), release[1]);
  await writeFile(archive, bytes, { mode: 0o600 });
}
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  release[1],
  'GoTrue release checksum',
);
execFileSync('tar', ['-xf', archive, '-C', cache]);
const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
  .trim()
  .split('\n');
const binary = entries.find((entry) => /(?:^|\/)auth[^/]*$/.test(entry));
assert.ok(binary, 'GoTrue archive has no executable.');
if (process.argv[2] === '--download-only') {
  console.log(
    'Official native GoTrue binary downloaded and checksum verified.',
  );
  process.exit(0);
}

const suffix = randomBytes(6).toString('hex');
const databaseName = `career_os_test_${suffix}`;
const adminUrl = new URL(
  process.env.LOCAL_POSTGRES_URL ??
    `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres`,
);
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname),
  'Tests require local PostgreSQL.',
);
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: adminUrl.toString() });
const children = new Set();
let created = false;
let proxy;
const secret = randomBytes(32).toString('hex');
function jwt(role) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      role,
      iss: 'supabase',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7200,
    }),
  ).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
}
function run(command, args, env, quiet = false) {
  const child = spawn(command, args, {
    env,
    detached: true,
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  child.diagnostic = '';
  if (quiet)
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        child.diagnostic = (
          child.diagnostic +
          String(chunk).replace(
            /postgres(?:ql)?:\/\/[^\s"']+/g,
            '[database URL]',
          )
        ).slice(-4000);
      });
  children.add(child);
  return child;
}
async function completed(child) {
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0, 'Native integration command failed.');
}
async function port() {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const value = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return value;
}
async function cleanup() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  await delay(250);
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  proxy?.closeAllConnections();
  proxy?.close();
  if (created)
    await admin.query(`drop database if exists ${databaseName} with (force)`);
  await admin.end();
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(130));
  });
try {
  await admin.connect();
  const version = await admin.query('show server_version_num');
  assert.ok(
    Number(version.rows[0].server_version_num) >= 170000,
    'Native test stack requires PostgreSQL 17+.',
  );
  await admin.query(`create database ${databaseName}`);
  created = true;
  const target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  await target.query('create schema auth');
  await target.end();
  for (const role of ['anon', 'authenticated', 'postgres'])
    await admin.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if;
  end $$`);
  const authPort = await port();
  const appPort = await port();
  proxy = createServer((incoming, outgoing) => {
    if (!incoming.url?.startsWith('/auth/v1/')) {
      outgoing.writeHead(404).end();
      return;
    }
    const forwarded = request(
      {
        host: '127.0.0.1',
        port: authPort,
        path: incoming.url.slice('/auth/v1'.length),
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    forwarded.on('error', () => outgoing.writeHead(502).end());
    incoming.pipe(forwarded);
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const apiUrl = `http://127.0.0.1:${proxy.address().port}`;
  const env = {
    ...process.env,
    DATABASE_URL: targetUrl.toString(),
    MIGRATION_DATABASE_URL: targetUrl.toString(),
    DATABASE_CA_CERT_PATH: '',
    CAREER_OS_TEST_DATABASE_URL: targetUrl.toString(),
    CAREER_OS_NATIVE_TEST: '1',
    CAREER_OS_DEPLOYMENT_MODE: 'self-hosted',
    CAREER_OS_APP_URL: `http://127.0.0.1:${appPort}`,
    TEST_BASE_URL: `http://127.0.0.1:${appPort}`,
    TEST_REQUEST_ORIGIN: `http://127.0.0.1:${appPort}`,
    TEST_AUTH_ORIGIN: `http://127.0.0.1:${appPort}`,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('anon'),
    SUPABASE_SECRET_KEY: jwt('service_role'),
    CAREER_OS_LOCAL_MODEL: '',
    CAREER_OS_LOCAL_MODEL_BASE_URL: '',
    // Next loads .env.local itself: explicit empties prevent a test build from
    // inheriting real worker credentials or a paid crawler from that file.
    CAREER_OS_WORKER_DATABASE_URL: '',
    CAREER_OS_EVIDENCE_WORKER_DATABASE_URL: '',
    CAREER_OS_STRATEGY_WORKER_DATABASE_URL: '',
    CAREER_OS_PAGE_COMPOSER_DATABASE_URL: '',
    CAREER_OS_RECRUITER_REVIEWER_DATABASE_URL: '',
    CAREER_OS_HIRING_MANAGER_REVIEWER_DATABASE_URL: '',
    CAREER_OS_FACTUALITY_REVIEWER_DATABASE_URL: '',
    CAREER_OS_DISCOVERY_DATABASE_URL: '',
    FIRECRAWL_API_KEY: '',
  };
  const auth = run(
    path.join(cache, binary),
    [],
    {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GOMAXPROCS: '1',
      GOMEMLIMIT: '128MiB',
      DATABASE_URL: targetUrl.toString(),
      GOTRUE_DB_DRIVER: 'postgres',
      DB_NAMESPACE: 'auth',
      GOTRUE_DB_MAX_POOL_SIZE: '3',
      GOTRUE_API_HOST: '127.0.0.1',
      PORT: String(authPort),
      API_EXTERNAL_URL: `${apiUrl}/auth/v1`,
      GOTRUE_SITE_URL: env.CAREER_OS_APP_URL,
      GOTRUE_JWT_SECRET: secret,
      GOTRUE_JWT_AUD: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role',
      GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_MAILER_AUTOCONFIRM: 'false',
      GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_PASSWORD_MIN_LENGTH: '12',
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
      GOTRUE_LOG_LEVEL: 'error',
    },
    true,
  );
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (auth.exitCode !== null)
      throw new Error(
        `Native GoTrue exited before readiness: ${auth.diagnostic}`,
      );
    if ((await fetch(`${apiUrl}/auth/v1/health`).catch(() => null))?.ok) {
      ready = true;
      break;
    }
    await delay(250);
  }
  assert.ok(ready, 'Native GoTrue readiness timeout.');
  await completed(run('node', ['--import', 'tsx', 'scripts/migrate.ts'], env));
  const args = process.argv
    .slice(2)
    .filter((arg, index) => index !== 0 || arg !== '--');
  assert.ok(
    args.length,
    'Provide the command to run against the disposable stack.',
  );
  console.log('Native Supabase Auth + isolated PostgreSQL ready (no Docker).');
  await completed(run(args[0], args.slice(1), env));
} finally {
  await cleanup();
}
