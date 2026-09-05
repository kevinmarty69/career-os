# Self-hosting Career OS

This guide runs the complete persisted workflow. For the zero-infrastructure synthetic demo, use the two-command path in the [README](../README.md#try-the-product-in-two-minutes).

## Requirements

- Node.js 22+
- pnpm 11+
- Docker with Compose
- a loopback OpenAI-compatible model endpoint

The current canary accepts loopback model endpoints only. It cannot call a remote or paid provider.

## 1. Configure the application

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
openssl rand -base64 32
```

Put the generated value in `BETTER_AUTH_SECRET`. Keep the default local `DATABASE_URL` and `BETTER_AUTH_URL` unless you changed their ports.

Start the database, then the application:

```bash
pnpm db:up
pnpm dev
```

`pnpm db:up` starts PostgreSQL, then `pnpm db:migrate` verifies migration
checksums and applies pending migrations under a database lock. Fresh and
existing installations use this same path.

An installation created before the migration ledger must be baselined once.
Stop the application and workers, back up PostgreSQL, identify the last SQL
migration already applied, then run for example:

```bash
pnpm db:migrate -- --baseline 0022
```

The baseline verifies the database structure, records migrations through that
version without replaying them, then applies every newer migration. The first
ledger release accepts only an exact, complete 0022 schema. It rejects later or
partially applied untracked states instead of guessing their history.

Publication and saved Career Memory fail closed when `DATABASE_URL` or `BETTER_AUTH_SECRET` is missing.

### PostgreSQL and stored data

`DATABASE_URL` may point to the supplied PostgreSQL 17 container or to an operator-managed PostgreSQL 17 database. The Compose setup binds PostgreSQL to loopback on port `54329` and keeps data in the named `career_os_db` volume. Do not expose that port publicly.

Career Memory accepted by the user, applications, runs, decisions, search profiles, discovered jobs and private publications live in PostgreSQL. Raw CV, DOCX and TXT bytes are parsed in the browser and are not stored. This release does not require object storage.

## 2. Create isolated worker logins

Every worker receives a distinct PostgreSQL login. Do not reuse the application `DATABASE_URL`.

Open a local database shell with `docker compose exec db psql -U career_os -d career_os`, then run:

```sql
create role career_company_researcher_login login noinherit
  password '<generate a strong local password>';
grant career_company_researcher to career_company_researcher_login;

create role career_evidence_archivist_login login noinherit
  password '<generate another strong password>';
grant career_evidence_archivist to career_evidence_archivist_login;

create role career_recruiter_strategist_login login noinherit
  password '<generate another strong password>';
grant career_recruiter_strategist to career_recruiter_strategist_login;

create role career_page_composer_login login noinherit
  password '<generate another strong password>';
grant career_page_composer to career_page_composer_login;

create role career_recruiter_reviewer_login login noinherit
  password '<generate another strong password>';
grant career_recruiter_reviewer to career_recruiter_reviewer_login;

create role career_hiring_manager_reviewer_login login noinherit
  password '<generate another strong password>';
grant career_hiring_manager_reviewer to career_hiring_manager_reviewer_login;

create role career_factuality_reviewer_login login noinherit
  password '<generate another strong password>';
grant career_factuality_reviewer to career_factuality_reviewer_login;

create role career_job_discovery_login login noinherit
  password '<generate another strong password>';
grant career_job_discovery to career_job_discovery_login;
```

Each login must be a non-owner without `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE` or inherited roles. Workers inspect their own grants before claiming work and fail closed on excess authority. Job discovery alone receives write access to the three opportunity tables, protected by a tenant-scoped, expiring lease policy; all other workers have no direct table privileges.

## 3. Configure the workers

Map each login to its matching environment variable:

| Worker                  | Database variable                                | Command                               | Model    |
| ----------------------- | ------------------------------------------------ | ------------------------------------- | -------- |
| Company researcher      | `CAREER_OS_WORKER_DATABASE_URL`                  | `pnpm worker:company-researcher`      | required |
| Evidence archivist      | `CAREER_OS_EVIDENCE_WORKER_DATABASE_URL`         | `pnpm worker:evidence-archivist`      | no       |
| Recruiter strategist    | `CAREER_OS_STRATEGY_WORKER_DATABASE_URL`         | `pnpm worker:recruiter-strategist`    | required |
| Page composer           | `CAREER_OS_PAGE_COMPOSER_DATABASE_URL`           | `pnpm worker:page-composer`           | no       |
| Recruiter reviewer      | `CAREER_OS_RECRUITER_REVIEWER_DATABASE_URL`      | `pnpm worker:recruiter-reviewer`      | required |
| Hiring-manager reviewer | `CAREER_OS_HIRING_MANAGER_REVIEWER_DATABASE_URL` | `pnpm worker:hiring-manager-reviewer` | required |
| Factuality reviewer     | `CAREER_OS_FACTUALITY_REVIEWER_DATABASE_URL`     | `pnpm worker:factuality-reviewer`     | no       |
| Job discovery           | `CAREER_OS_DISCOVERY_DATABASE_URL`               | `pnpm worker:job-discovery`           | no       |

Build the disposable Page Composer image before starting that worker:

```bash
docker build -f Dockerfile.page-composer -t career-os-page-composer:local .
export CAREER_OS_PAGE_COMPOSER_IMAGE=career-os-page-composer:local
```

The worker sends only the bounded Page Composer input through stdin. Docker
starts a fresh non-root, read-only container without network, host mounts or
inherited application environment, then the trusted worker validates and
recomputes the result before completing the leased database step. Managed deployments also
require the image reference to end in an immutable `@sha256:...` digest and do
not fall back to in-process composition.

Model-backed workers also need:

```bash
export CAREER_OS_LOCAL_MODEL_BASE_URL=http://127.0.0.1:11434/v1
export CAREER_OS_LOCAL_MODEL_API_KEY=local-only
export CAREER_OS_LOCAL_MODEL='<your local model name>'
```

This is the self-hosted BYOK boundary: the endpoint, model and key exist only in the four model-worker environments. They are never exposed through a `NEXT_PUBLIC_*` variable or sent to the browser. The current canary deliberately accepts only loopback HTTP endpoints, so run an OpenAI-compatible local server or a local gateway under your control.

Worker commands intentionally do not load the application's `.env.local`: a shared file would give every process every database credential. Export only the matching variables in each worker process.

## 4. Run and supervise

Start each command from the table in a separate process. PostgreSQL assigns the next tenant-scoped job globally and returns an opaque lease token; workers never receive a tenant selector.

For a durable host, use the units in [`deploy/systemd`](../deploy/systemd). They run the eight roles separately, restart failures, send `SIGTERM`, and allow an active iteration to drain before timeout.

### Configure job sources

Sign in, open `/search-profiles`, create a profile and add one or more public ATS board roots:

- `https://boards.greenhouse.io/<board>`
- `https://jobs.ashbyhq.com/<board>`

Choose a 6, 12, 24 or 72-hour interval. The discovery worker enumerates the public board, rejects jobs outside the profile's hard constraints and deduplicates observations in PostgreSQL. Individual job URLs, authenticated boards and arbitrary crawlers are not supported. No paid search provider is required.

## 5. Verify the installation

```bash
pnpm check
pnpm build
pnpm db:test
pnpm test:integration:http
pnpm test:integration:worker
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm db:test` exercises migrations, RLS, capability security, tenant isolation, budgets, durable concurrency, reviews, and worker heartbeats. Run it against the disposable Compose database, never a production database.

`pnpm test:integration:http` starts the production build on port 3019 and runs the application, workflow and private-publication HTTP contracts against it.

For a running instance, open **Settings → Worker availability**. The authenticated status endpoint reports each of the eight heartbeats as `fresh`, `stale` or `missing` without exposing timestamps. On a systemd host, also check:

```bash
systemctl is-active career-os-workers.target
systemctl --failed 'career-os-worker@*.service'
```

## 6. Back up and restore

Back up before every upgrade and at the interval required by your recovery objective:

```bash
docker compose exec -T db pg_dump -U career_os -d career_os --format=custom > career-os.backup
pg_restore --list career-os.backup > /dev/null
```

Copy the backup off the application host and test restoration regularly. A restore replaces database state; stop the application and all workers first, verify the target database, then run:

```bash
docker compose exec -T db pg_restore -U career_os -d career_os --clean --if-exists --no-owner < career-os.backup
pnpm db:migrate
pnpm test:integration:http
```

The database is the complete server-side backup boundary in this release. The repository and root-owned worker environment files must be backed up separately; never place those environment files in a database dump or a public archive.

## 7. Update an installation

Use a clean working tree and never edit an applied migration:

```bash
sudo systemctl stop career-os-workers.target
git pull --ff-only
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm check
pnpm build
sudo systemctl start career-os-workers.target
```

Restart the supervised Next.js process after the build, then verify worker availability and one private publication. Migration checksums and the database advisory lock prevent silent replay or two concurrent migrators.

## 8. Operator responsibilities and current limits

- terminate TLS at a trusted reverse proxy and configure the exact public origin;
- keep application, database, worker and model credentials separate and rotate them after suspected exposure;
- own PostgreSQL backups, restore tests, host monitoring, capacity and updates;
- restrict outbound URL-import traffic and comply with the terms of public ATS sources;
- choose and operate the local OpenAI-compatible model; Career OS reports usage but does not manage model availability;
- treat imported documents, job pages and model output as untrusted data;
- use this permanent worker pool for a self-hosted instance, not as the isolation boundary of a public multi-tenant SaaS.

The open-source release does not provide managed backups, email delivery, billing, remote paid-model routing or cloud sandbox isolation. Its read-only synthetic demo remains available without infrastructure at `/demo`.

## Security notes

- Keep the model endpoint on loopback; remote hosts, redirects, credentials in URLs, query strings, and fragments are rejected.
- Do not give a worker the application connection string or another worker's login.
- Put an outbound network policy around URL-import traffic in an internet-facing deployment.
- Terminate TLS at a trusted reverse proxy and set `BETTER_AUTH_URL` to the exact public origin.
- Back up PostgreSQL. Raw CV uploads are not stored, but accepted Career Memory, applications, runs, and publications are.

The [security model](../SECURITY.md) defines the implemented trust boundaries and distinguishes them from future managed-cloud controls.
