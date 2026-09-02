# Architecture

Career OS is one Next.js application backed by PostgreSQL/Supabase. The same codebase serves self-hosted and managed cloud installations.

## Source of truth

PostgreSQL stores tenants, profiles, sources, claims, evidence, provenance, allowed uses, workflow runs, versioned artifacts, reviews, approvals and private publications. Embeddings may later index rows for retrieval; they never replace row IDs or provenance.

Every tenant-owned foreign key includes `tenant_id`. RLS is forced on every tenant table. Browser clients never receive a service-role key. Uploaded documents and fetched pages are untrusted data, not instructions.

## Vertical flow

`memory → opportunity → strategy → PageSpec → three reviews → human approval → private capability`

The browser uses Better Auth organization sessions for tenant selection. Career Memory writes use optimistic revisions in PostgreSQL; localStorage only caches opportunity, draft and run state for the selected workspace. Run creation reloads the requested profile revision and atomically persists an immutable profile snapshot, opportunity, PageSpecs, reviews and audit events. Publication accepts only the persisted run, records human approval of its current reviewed PageSpec, and issues a revocable capability over that immutable snapshot.

CV import runs entirely in a browser Web Worker. It keeps the raw file out of server routes, validates and bounds the document before extraction, stores a resumable review in sessionStorage for at most 30 minutes, and persists only the claims explicitly accepted by the user. Imported claims remain `declared` and linked to a source digest and page or line locator.

PageSpec is data, not code. The renderer accepts only known blocks and bounded color tokens. Essential recruiter information is visible first; provenance details use native `details` elements for progressive disclosure.

See [ADR-001](docs/ADR-001-agent-runtime.md) for agent runtime and isolation decisions.
