# Self-hosting Career OS

Career OS requires **Supabase Auth + PostgreSQL**, not Better Auth or a bare
PostgreSQL database. Use an existing Supabase project or an operator-managed,
open-source Supabase instance. Docker is not required on your development machine.

## Configure the application

Requirements: Node.js 22+, pnpm 11+, PostgreSQL 17, Supabase Auth and your own
model endpoint. The synthetic `/demo` needs none of that infrastructure.

### Page Composer isolation

On **self-hosted macOS with Node.js 24+**, the composer uses the installed
`/usr/bin/sandbox-exec`; no Docker daemon or image is needed. Set
`CAREER_OS_PAGE_COMPOSER_SANDBOX=macos` to select it explicitly. The worker
copies only its two trusted source files into a private temporary directory,
reads Zod from the installed dependency, and accepts bounded JSON on stdin.
It does not run generated JavaScript, shell commands, plugins or model code.

The child receives no inherited environment variables or credentials. The
deny-by-default OS profile denies networking, filesystem writes and process
forking, while allowing the Node executable, its runtime libraries and composer
source/dependency reads. Node's permission model adds a narrower application
filesystem allowlist and denies child processes, addons and worker threads.
Output and input have byte limits; a 15-second timeout kills the child and its
temporary source directory is removed afterwards. The 64 MiB V8 heap limit is
**not a hard process RSS cap**, and the timeout is **not a CPU quota**.

This native adapter is for the **trusted deterministic self-hosted composer**,
not an adversarial-code or multi-tenant cloud sandbox. Apple's sandbox policy
interface can change; launch/policy failures stop the job, never fall back to an
unrestricted subprocess. Check it locally without services or real user data:

```bash
CAREER_OS_TEST_NATIVE_COMPOSER=1 node --import tsx --test --test-concurrency=1 tests/unit/page-composer-sandbox.test.ts
```

Linux self-hosting still uses the Docker adapter (explicitly selectable with
`CAREER_OS_PAGE_COMPOSER_SANDBOX=docker`) and a locally available composer image.
There is no unisolated native Linux fallback. Managed mode requires Docker with
a sha256-pinned `CAREER_OS_PAGE_COMPOSER_IMAGE`; it rejects the macOS adapter.
If Docker is prohibited on that Linux host, run the composer on a separately
operated sandbox host instead of removing these protections. Do not start Docker
on the resource-constrained development workstation.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `CAREER_OS_APP_URL` to the exact app origin, `NEXT_PUBLIC_SUPABASE_URL` to the
Supabase API origin, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its public key.
Never put a secret/service-role key in a `NEXT_PUBLIC_*` variable.

Keep the administrative PostgreSQL connection as `MIGRATION_DATABASE_URL` in a
separate ignored operator file `.env.operator.local`. Use the direct or session
pooler connection, not transaction pooling. Configure `DATABASE_CA_CERT_PATH`
with the database CA provided by Supabase; TLS verifies CA and hostname.

```bash
node --env-file=.env.operator.local --import tsx scripts/migrate.ts
```

The custom runner verifies checksums under a database lock and translates
immutable historical SQL into `career_identity`, leaving managed `auth` alone.
**Do not run raw historical SQL through `supabase db push`.** Existing Better
Auth databases are refused without discarding users; see [ADR-006](ADR-006-supabase-auth.md).

## Isolate credentials

Create a strong, separate login for the app and each worker using the operator
connection. These are examples, not passwords to reuse:

```sql
create role career_web_login login inherit password '<unique password>';
grant career_web to career_web_login;
create role career_company_login login noinherit password '<different password>';
grant career_company_researcher to career_company_login;
```

Set the app's `DATABASE_URL` to its restricted login. Repeat the worker pattern
for each role below. Logins must not own tables or have SUPERUSER, BYPASSRLS,
CREATEDB or CREATEROLE. The web login inherits only `career_web`'s identity
permissions; `career_web` is itself NOINHERIT, so tenant roles still require
explicit transaction-scoped activation. Worker logins remain NOINHERIT and reject
excessive privileges.

| Role                             | Database variable                                | Command                               |
| -------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `career_company_researcher`      | `CAREER_OS_WORKER_DATABASE_URL`                  | `pnpm worker:company-researcher`      |
| `career_evidence_archivist`      | `CAREER_OS_EVIDENCE_WORKER_DATABASE_URL`         | `pnpm worker:evidence-archivist`      |
| `career_recruiter_strategist`    | `CAREER_OS_STRATEGY_WORKER_DATABASE_URL`         | `pnpm worker:recruiter-strategist`    |
| `career_page_composer`           | `CAREER_OS_PAGE_COMPOSER_DATABASE_URL`           | `pnpm worker:page-composer`           |
| `career_recruiter_reviewer`      | `CAREER_OS_RECRUITER_REVIEWER_DATABASE_URL`      | `pnpm worker:recruiter-reviewer`      |
| `career_hiring_manager_reviewer` | `CAREER_OS_HIRING_MANAGER_REVIEWER_DATABASE_URL` | `pnpm worker:hiring-manager-reviewer` |
| `career_factuality_reviewer`     | `CAREER_OS_FACTUALITY_REVIEWER_DATABASE_URL`     | `pnpm worker:factuality-reviewer`     |
| `career_job_discovery`           | `CAREER_OS_DISCOVERY_DATABASE_URL`               | `pnpm worker:job-discovery`           |

Each process receives only its own URL, the CA path and required model config.
Workers intentionally do not load the app's `.env.local`. See
[model setup](MODEL_SETUP.md) for local/remote BYOK and spend limits, and
[`deploy/systemd`](../deploy/systemd) for separately supervised worker services.

## Enable real signup

Configure Supabase Auth's site URL and exact `/auth/callback` and `/auth/confirm`
redirects. Keep email confirmation enabled and password minimum at least 12.
**Configure your own SMTP sender before inviting external users**: the default
Supabase development sender is restricted, not production onboarding. Do not
disable confirmation to bypass delivery problems. OAuth additionally requires
your own provider configuration; it is not automatically enabled.

```bash
pnpm dev
```

Users confirm their email, sign in, then create an app workspace. A Supabase
platform organization is not an application workspace. Imported CV claims,
strategy and private-page publication require explicit human validation.
Outreach is drafted, never automatically sent.

## Validate against an existing Supabase development project

Use the configured development project for product testing; no additional local
database or Auth service is needed. Start the local app with its restricted
credentials. Run `scripts/smoke-supabase-auth.ts` separately with the ignored
operator configuration and `ALLOW_SUPABASE_AUTH_SMOKE=1`. It creates synthetic
accounts and workspaces, then removes only those test records. It does not call
a model; optional CV and job URL inputs are explicit. Do not give the app process
the operator credentials. This smoke verifies login, not email delivery.

Never run the destructive migration/SQL fixture suites against a shared Supabase
project, even in development. They belong in the isolated CI environment below.

## Isolated CI verification without Docker

Install/start native PostgreSQL 17. The local test administrator needs to create
disposable databases and test roles. Default: your OS username on localhost5432.
Set `LOCAL_POSTGRES_URL` for other local credentials; remote hosts are refused.

```bash
pnpm check
pnpm test:native pnpm verify:persisted
pnpm exec playwright install chromium
pnpm test:accessibility
pnpm test:e2e
```

The native harness downloads a pinned official GoTrue release (macOS ARM64 or
Linux x64), verifies SHA256, and starts it on loopback with GOMAXPROCS=1 and a
128 MiB Go memory target. It creates a random test database, applies real Auth
and application migrations, passes temporary credentials to the test command,
then stops only its process and drops only that database. It never reads or
overwrites `.env.local`, starts Docker, or touches hosted Supabase data.

SQL fixtures copy the real GoTrue schema. HTTP tests use real password sessions
and administratively confirmed synthetic accounts. This tests session/tenant
boundaries, **not your production SMTP delivery**. The opt-in
[`smoke-supabase-auth.ts`](../scripts/smoke-supabase-auth.ts) separately exercises
a configured hosted project with scoped synthetic users and cleanup.

## Backups, updates and operations

Accepted memory, applications, runs, reviews and publications live in PostgreSQL.
Raw CV/DOCX/TXT bytes are parsed in the browser, not stored server-side. Back up
the full database including Supabase Auth and protect runtime config separately.
Restore to an empty isolated target, test an authenticated workflow, then cut over.

```bash
pg_dump --dbname "$MIGRATION_DATABASE_URL" --format=custom --file=career-os.backup
pg_restore --list career-os.backup
```

Before upgrading: back up, stop app/workers, pull the intended release, install
with the lockfile, run the custom migrations, build, restart and verify worker
availability. Never modify an applied migration or reset a database to fix a
mismatch. Settings → Worker availability shows fresh/stale/missing heartbeats.

You own TLS, SMTP, backup/restore tests, host monitoring, model availability and
spend, source permissions and updates. OSS does not provide managed backups, email delivery, billing
or a hosted model. See [SECURITY.md](../SECURITY.md). Cloud deployment
and paid services require a separate explicit operator decision.
