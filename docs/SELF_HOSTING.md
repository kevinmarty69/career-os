# Self-hosting Career OS

This guide runs the complete persisted workflow. For the zero-infrastructure synthetic demo, use the two-command path in the [README](../README.md#try-the-product-in-two-minutes).

## Requirements

- Node.js 22+
- pnpm 10+
- Docker with Compose
- a loopback OpenAI-compatible model endpoint

The current canary accepts loopback model endpoints only. It cannot call a remote or paid provider.

## 1. Configure the application

```bash
pnpm install
cp .env.example .env.local
openssl rand -base64 32
```

Put the generated value in `BETTER_AUTH_SECRET`. Keep the default local `DATABASE_URL` and `BETTER_AUTH_URL` unless you changed their ports.

Start the database, then the application:

```bash
pnpm db:up
pnpm dev
```

Publication and saved Career Memory fail closed when `DATABASE_URL` or `BETTER_AUTH_SECRET` is missing.

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
```

Each login must be a non-owner without `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, inherited roles, or direct table privileges. Workers inspect their own grants before claiming work and fail closed on excess authority.

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

Worker commands intentionally do not load the application's `.env.local`: a shared file would give every process every database credential. Export only the matching variables in each worker process.

## 4. Run and supervise

Start each command from the table in a separate process. PostgreSQL assigns the next tenant-scoped job globally and returns an opaque lease token; workers never receive a tenant selector.

For a durable host, use the units in [`deploy/systemd`](../deploy/systemd). They run the seven roles separately, restart failures, send `SIGTERM`, and allow an active iteration to drain before timeout.

## 5. Verify the installation

```bash
pnpm check
pnpm build
pnpm db:test
pnpm test:integration:worker
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm db:test` exercises migrations, RLS, capability security, tenant isolation, budgets, durable concurrency, reviews, and worker heartbeats. Run it against the disposable Compose database, never a production database.

## Security notes

- Keep the model endpoint on loopback; remote hosts, redirects, credentials in URLs, query strings, and fragments are rejected.
- Do not give a worker the application connection string or another worker's login.
- Put an outbound network policy around URL-import traffic in an internet-facing deployment.
- Terminate TLS at a trusted reverse proxy and set `BETTER_AUTH_URL` to the exact public origin.
- Back up PostgreSQL. Raw CV uploads are not stored, but accepted Career Memory, applications, runs, and publications are.

The [security model](../SECURITY.md) defines the implemented trust boundaries and distinguishes them from future managed-cloud controls.
