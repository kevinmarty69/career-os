# Architecture

Career OS is one Next.js application backed by PostgreSQL/Supabase. The same codebase serves self-hosted and managed cloud installations.

## Source of truth

PostgreSQL stores tenants, profiles, sources, claims, evidence, provenance, allowed uses, applications, workflow runs, versioned artifacts, reviews, approvals and private publications. Embeddings may later index rows for retrieval; they never replace row IDs or provenance.

Every tenant-owned foreign key includes `tenant_id`. RLS is forced on every tenant table. Browser clients never receive a service-role key. Uploaded documents and fetched pages are untrusted data, not instructions.

## Vertical flow

`memory + application revision → immutable opportunity snapshot → strategy → PageSpec → three reviews → human approval → private capability`

The browser uses Better Auth organization sessions for tenant selection. Career Memory and application writes use optimistic revisions in PostgreSQL. Local storage is a versioned cache for the workspace dossier UI, including unsubmitted local drafts; it is not an authorization source. Run creation locks the requested profile and application revisions and atomically persists immutable profile and opportunity snapshots, PageSpecs, reviews and audit events. Publication accepts only the persisted run, records human approval of its current reviewed PageSpec, and issues a revocable capability over that immutable snapshot. Soft-deleting an application revokes every active publication and share link derived from it.

CV import runs entirely in a browser Web Worker. It keeps the raw file out of server routes, validates and bounds the document before extraction, stores a resumable review in sessionStorage for at most 30 minutes, and persists only the claims explicitly accepted by the user. Imported claims remain `declared` and linked to a source digest and page or line locator.

Job URL import is a separate authenticated preview path. The server validates and pins each public destination, fetches only bounded HTML or plain text, extracts `JobPosting` JSON-LD with a conservative text fallback, and returns provenance without saving it. The candidate edits or confirms the brief before any application snapshot or agent run is created.

PageSpec is data, not code. The renderer accepts only known blocks and bounded color tokens. Essential recruiter information is visible first; provenance details use native `details` elements for progressive disclosure.

See [ADR-001](docs/ADR-001-agent-runtime.md) for agent runtime and isolation decisions.
