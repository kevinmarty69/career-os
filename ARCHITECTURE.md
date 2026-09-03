# Architecture

Career OS is one Next.js application backed by PostgreSQL/Supabase. The same codebase serves self-hosted and managed cloud installations.

## Source of truth

PostgreSQL stores tenants, profiles, sources, claims, evidence, provenance, allowed uses, applications, workflow runs, versioned artifacts, reviews, approvals and private publications. Embeddings may later index rows for retrieval; they never replace row IDs or provenance.

Every tenant-owned foreign key includes `tenant_id`. RLS is forced on every tenant table. Browser clients never receive a service-role key. Uploaded documents and fetched pages are untrusted data, not instructions.

## Vertical flow

`memory + application revision → immutable snapshots → durable research step → human signal confirmation → deterministic evidence archive → strategy → PageSpec → three reviews → human approval → private capability`

The browser uses Better Auth organization sessions for tenant selection. Career Memory and application writes use optimistic revisions in PostgreSQL. Local storage is a versioned cache for the workspace dossier UI, including unsubmitted local drafts; it is not an authorization source. Run creation locks the requested profile and application revisions, atomically persists immutable profile and opportunity snapshots, and enqueues the first `company-researcher` step. Its idempotency operation is stored before the request and reused after a lost response or reload; explicit retries rotate it. Admission is serialized per tenant and bounded to five active runs and 30 new runs per hour. The browser receives `202 Accepted` and follows only persisted run and step state, so reloads do not lose progress.

The company-researcher worker uses a dedicated PostgreSQL login with no direct table access. PostgreSQL assigns the next job globally and returns an opaque lease token; the process does not choose a tenant. Every later transition requires that exact step and lease token. The worker reserves the run budget and marks the provider request `in_flight` before calling a loopback OpenAI-compatible endpoint outside any database transaction. Completion writes one validated artifact, usage settlement and audit event atomically. A pre-dispatch crash can be reclaimed after lease expiry. An expired in-flight call is never replayed: its reservation is settled conservatively and the run fails with an explicit unknown provider outcome. This trades availability for protection against duplicate model calls and duplicate cost.

After the human confirms the extracted signals, PostgreSQL constructs the next immutable input from the run snapshot. It excludes inferred, restricted, disallowed, unsupported and mixed-permission claims before a separate `career_evidence_archivist` login can claim the step. This worker has exactly four executable capabilities: claim, complete, fail and reap expired work. It applies a bounded lexical ranking, returns claim and evidence IDs only, and writes no model usage. SQL validates every returned ID against the immutable input before committing the artifact.

The current durable canary pauses at `strategy` after the evidence archive. The deterministic browser demo still illustrates later PageSpec composition, review and approval, but it is not the persisted runtime and cannot mint a real private capability. Publication remains gated on a persisted, reviewed PageSpec; soft-deleting an application revokes every active publication and share link derived from it.

CV import runs entirely in a browser Web Worker. It keeps the raw file out of server routes, validates and bounds the document before extraction, stores a resumable review in sessionStorage for at most 30 minutes, and persists only the claims explicitly accepted by the user. Imported claims remain `declared` and linked to a source digest and page or line locator.

Job URL import is a separate authenticated preview path. The server validates and pins each public destination, fetches only bounded HTML or plain text, extracts `JobPosting` JSON-LD with a conservative text fallback, and returns provenance without saving it. The candidate edits or confirms the brief before any application snapshot or agent run is created.

PageSpec is data, not code. The renderer accepts only known blocks and bounded color tokens. Essential recruiter information is visible first; provenance details use native `details` elements for progressive disclosure.

See [ADR-001](docs/ADR-001-agent-runtime.md) for agent runtime and isolation decisions.
