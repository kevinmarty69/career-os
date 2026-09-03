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
6. inspect the resulting source-bound research artifact before later evidence, composition and review stages are enabled;
7. exercise PageSpec composition, review and approval with an explicit deterministic demo; the private-capability API remains gated and tested for persisted reviewed runs;
8. inspect or interrupt the bounded agent ledger and export all data.

Email/password accounts, organization membership, Career Memory revisions and application briefs persist in PostgreSQL. Local storage caches the active dossier UI, but it cannot authorize publication. Starting a run locks the current application and Career Memory revisions, writes immutable profile and opportunity snapshots, and atomically enqueues the first workflow step. The browser persists its idempotency key before sending, while PostgreSQL caps each tenant at five active runs and 30 admissions per hour. A separate worker claims that step, reserves its budget, marks the provider call in flight, performs it with no open database transaction, and then records either one research artifact or one conservative failure settlement. The current production canary pauses after this first analysis stage; later evidence, composition, review and publication stages remain available only in the explicit deterministic demo until they receive the same durable execution path. Editing an application creates a new revision without changing earlier runs. Deleting an application revokes its active private links.

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

To execute queued company research, provision a dedicated PostgreSQL login that is a member only of `career_company_researcher`, put its connection string in `CAREER_OS_WORKER_DATABASE_URL`, configure a loopback OpenAI-compatible model in `.env.local`, and start the worker separately. Never reuse the application `DATABASE_URL`: PostgreSQL assigns the next tenant-scoped job globally and returns an opaque lease token.

```sql
create role career_company_researcher_login login noinherit
  password '<generate a strong local password>';
grant career_company_researcher to career_company_researcher_login;
```

The login must not own the database or schema, have `SUPERUSER`, `BYPASSRLS`, `CREATEDB` or `CREATEROLE`, inherit any other role, or hold direct table privileges. The worker checks these conditions before claiming work and fails closed.

```bash
pnpm worker
```

The canary intentionally accepts loopback endpoints only. It cannot call a remote or paid model. The worker receives neither a tenant ID nor direct table access.

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
