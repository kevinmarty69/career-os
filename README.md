# Career OS

> Turn your real work into evidence-backed applications.

Career OS is an AGPL-licensed, self-hostable application for turning structured career evidence into private, company-specific applications. It is not a generic AI résumé generator: every published claim keeps an explicit `verified`, `declared` or `inferred` status and an auditable path back to its source.

## What runs today

The first vertical is a real browser workflow that starts with synthetic demo data:

1. edit a profile and add a source, claim and optional proof;
2. paste an offer (URLs are stored but deliberately not fetched yet);
3. run a bounded seven-role team through a deterministic fake provider and produce a Zod-validated PageSpec;
4. inspect a company-themed, accessible preview;
5. run recruiter, hiring-manager and factuality reviews;
6. approve, mint an expiring server capability, exchange its URL fragment for a scoped HttpOnly cookie, and revoke it;
7. inspect or interrupt the bounded agent ledger and export all data.

Email/password accounts, organization membership and Career Memory revisions persist in PostgreSQL. Draft workflow state is cached locally, but it cannot authorize publication. Starting a run reloads the requested saved Career Memory revision and writes an immutable profile snapshot, opportunity, PageSpecs, review results and audit events in one transaction. Publication accepts only that persisted run, records human approval, and serves only claims, evidence and sources derived from its reviewed snapshot.

## Quick start

Requirements: Node 22+, pnpm 10+.

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local`, set `DATABASE_URL` and generate a `BETTER_AUTH_SECRET`, then open `http://localhost:3000`.

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
