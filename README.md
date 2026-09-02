# Career OS

> Turn your real work into evidence-backed applications.

Career OS is an AGPL-licensed, self-hostable application for turning structured career evidence into private, company-specific applications. It is not a generic AI résumé generator: every published claim keeps an explicit `verified`, `declared` or `inferred` status and an auditable path back to its source.

## What runs today

The first vertical is a real browser workflow that starts with an empty, honest workspace. A synthetic demo remains available only through an explicit action:

1. import a PDF, DOCX or TXT CV locally in a Web Worker, paste its text, or start manually;
2. review every proposed claim, its source locator, sensitivity and allowed uses before it enters Career Memory;
3. create and resume multiple applications from pasted offers or a bounded, SSRF-safe URL import that always requires human verification;
4. run a bounded seven-role team through a deterministic fake provider and produce a Zod-validated PageSpec;
5. inspect a company-themed, accessible preview;
6. run recruiter, hiring-manager and factuality reviews, then correct or explicitly keep each non-factual objection;
7. approve, mint an expiring server capability, exchange its URL fragment for a scoped HttpOnly cookie, and revoke it;
8. inspect or interrupt the bounded agent ledger and export all data.

Email/password accounts, organization membership, Career Memory revisions and application briefs persist in PostgreSQL. Local storage caches the active dossier UI, but it cannot authorize publication. Starting a run locks the current application and Career Memory revisions, then writes immutable profile and opportunity snapshots, PageSpecs, review results and audit events in one transaction. Editing an application creates a new revision without changing earlier runs. Review decisions are immutable and tenant-scoped; factual objections cannot be overridden, and a correction creates a new reviewed run. Publication accepts only a persisted run that passes this database gate, records human approval, and serves only claims, evidence and sources derived from its reviewed snapshot. Deleting an application revokes its active private links.

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
