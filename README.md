# Career OS

> Turn your real work into evidence-backed applications.

Career OS is an AGPL-licensed, self-hostable application for turning structured career evidence into private, company-specific applications. It is not a generic AI résumé generator: every published claim keeps an explicit `verified`, `declared` or `inferred` status and an auditable path back to its source.

## What runs today

The first vertical is a real browser workflow that starts with an empty, honest workspace. A synthetic demo remains available only through an explicit action:

1. import a PDF, DOCX or TXT CV locally in a Web Worker, paste its text, or start manually;
2. review every proposed claim, its source locator, sensitivity and allowed uses before it enters Career Memory;
3. create and resume multiple applications from pasted offers or a bounded, SSRF-safe URL import that always requires human verification;
4. enqueue a durable company-research step and follow its persisted progress across reloads;
5. process that step with a loopback OpenAI-compatible model outside database transactions, under a reserved token budget;
6. inspect the resulting source-bound research artifact, choose the hiring signals to keep, and resume safely after a failed request or reload;
7. map the confirmed signals to permitted, source-bound proof with a separate deterministic worker that consumes no model tokens;
8. approve that immutable evidence archive, run a least-privilege recruiter strategist against a loopback model, and review its IDs-only editorial strategy;
9. approve the strategy to enqueue a deterministic, zero-token PageSpec composer and inspect the generated draft;
10. explicitly launch three serialized, durable reviews: recruiter, hiring manager, then a deterministic factuality check;
11. decide each qualitative objection before publication; factuality failures remain blocking;
12. inspect or interrupt the bounded agent ledger and export all data.

Email/password accounts, organization membership, Career Memory revisions and application briefs persist in PostgreSQL. Local storage caches the active dossier UI, but it cannot authorize publication. Starting a run locks the current application and Career Memory revisions, writes immutable profile and opportunity snapshots, and atomically enqueues the first workflow step. The browser persists its idempotency key before sending, while PostgreSQL caps each tenant at five active runs and 30 admissions per hour. A dedicated company-researcher worker records one research artifact or one conservative failure settlement. Human confirmation then creates an immutable, permission-filtered input for a second least-privilege worker. That evidence archivist ranks IDs deterministically, writes no generated prose, calls no provider and records zero model usage. A second human checkpoint can enqueue a separately isolated recruiter strategist. Its output is internal editorial direction linked only to exact signal, claim and evidence IDs; PostgreSQL rejects stale or forged lineage before storage. The persisted workflow pauses again for human approval before a fourth isolated worker composes one strict PageSpec from the approved lead and supporting claim IDs. The composer calls no model or network service, consumes no budget and copies its thesis exactly from the approved lead claim. A final explicit checkpoint starts three serialized reviewers with separate database identities. The recruiter and hiring-manager reviewers use the configured loopback model; factuality is deterministic. PostgreSQL keeps publication closed until all three durable reviews exist and every qualitative objection has a human decision. Editing an application creates a new revision without changing earlier runs. Deleting an application revokes its active private links.

CV bytes never leave the browser and are not retained. The local parser validates file signatures, bounds decompression and extracted text, rejects active or externally linked DOCX content and embedded PDF attachments, and marks all accepted statements as `declared` and `untrusted-data`. Only the fields approved by the user are persisted.

## Quick start

Requirements: Node 22+, pnpm 10+.

```bash
pnpm install
```

Copy `.env.example` to `.env.local`, set `DATABASE_URL` and generate a `BETTER_AUTH_SECRET`, then open `http://localhost:3000`.

```bash
pnpm dev
```

To execute queued work, provision one dedicated PostgreSQL login for every worker role, configure the loopback OpenAI-compatible model for the four model-backed roles, and start each worker separately. Never reuse the application `DATABASE_URL`: PostgreSQL assigns the next tenant-scoped job globally and returns an opaque lease token.

```sql
create role career_company_researcher_login login noinherit
  password '<generate a strong local password>';
grant career_company_researcher to career_company_researcher_login;

create role career_evidence_archivist_login login noinherit
  password '<generate another strong local password>';
grant career_evidence_archivist to career_evidence_archivist_login;

create role career_recruiter_strategist_login login noinherit
  password '<generate another strong local password>';
grant career_recruiter_strategist to career_recruiter_strategist_login;

create role career_page_composer_login login noinherit
  password '<generate another strong local password>';
grant career_page_composer to career_page_composer_login;

create role career_recruiter_reviewer_login login noinherit
  password '<generate another strong local password>';
grant career_recruiter_reviewer to career_recruiter_reviewer_login;

create role career_hiring_manager_reviewer_login login noinherit
  password '<generate another strong local password>';
grant career_hiring_manager_reviewer to career_hiring_manager_reviewer_login;

create role career_factuality_reviewer_login login noinherit
  password '<generate another strong local password>';
grant career_factuality_reviewer to career_factuality_reviewer_login;
```

The login must not own the database or schema, have `SUPERUSER`, `BYPASSRLS`, `CREATEDB` or `CREATEROLE`, inherit any other role, or hold direct table privileges. The worker checks these conditions before claiming work and fails closed.

```bash
pnpm worker:company-researcher
pnpm worker:evidence-archivist
pnpm worker:recruiter-strategist
pnpm worker:page-composer
pnpm worker:recruiter-reviewer
pnpm worker:hiring-manager-reviewer
pnpm worker:factuality-reviewer
```

The canary intentionally accepts loopback endpoints only. It cannot call a remote or paid model. No worker receives a tenant selector or direct table access. Use a distinct login and connection string for each worker.

Worker commands intentionally do not load a shared `.env.local`. For local use, export the required variables before invoking one command. In production, supervise seven separate processes with systemd and give each unit only its matching database URL plus the local-model variables it needs. Use `Restart=on-failure`, send `SIGTERM`, and allow the active iteration to drain before the unit timeout; do not combine all credentials in one supervisor process.

```bash
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

For the Postgres isolation test, start Docker Desktop first:

```bash
pnpm db:up
pnpm db:test
pnpm db:down
```

Publication and saved Career Memory fail closed when `DATABASE_URL` or `BETTER_AUTH_SECRET` is missing.

The migration also runs on PostgreSQL 17 without pgvector. Embeddings are intentionally deferred.

## Architecture and security

- [Architecture](ARCHITECTURE.md)
- [Security model](SECURITY.md)
- [Agent runtime decision](docs/ADR-001-agent-runtime.md)
- [Agentic stack benchmark](docs/agentic-stack-benchmark.md)
- [Agentic stack selection](docs/ADR-002-agentic-stack-selection.md)

Self-hosters will use their own provider keys or local OpenAI-compatible models. The managed cloud will run the same product with server-enforced quotas and isolated execution. No remote repository, deployment or hosted service is created by this scaffold.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
