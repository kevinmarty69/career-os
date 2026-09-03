# Security model

- Treat source documents, job pages, model output and tool results as untrusted data.
- Parse CV files in a browser Web Worker. Validate extension, media type and signature; cap raw and expanded sizes, PDF pages, candidates and elapsed time; reject encrypted PDFs, attachments, unsafe ZIP paths, nested archives, symlinks, macros, DTD/entities and external DOCX relationships. Persist no raw file and promote no extracted statement without explicit human confirmation.
- Import submitted job URLs only for authenticated tenants. Allow HTTP(S) 80/443, reject credentials and internal names, resolve every hop, reject mixed or private/link-local/metadata destinations, pin the validated IP through the socket connection, verify the connected peer, reject HTTPS downgrades and compressed bodies, and cap redirects, headers, body, idle time and total time. The result is an untrusted preview and is never persisted before human verification. Cloud deployments must reinforce this application boundary with an outbound network policy.
- Validate all generated artifacts with strict schemas and resolve referenced IDs again inside the tenant transaction.
- The current model worker accepts only loopback HTTP(S) OpenAI-compatible endpoints, rejects redirects, credentials, query strings and fragments, and bounds time, headers, body size, UTF-8 decoding and token usage. It cannot be configured to call a remote or paid provider.
- Never hold a database transaction open during a model request. Give the worker a dedicated non-owner database credential with no direct table access; PostgreSQL assigns jobs globally and binds every transition to an opaque lease token. Reserve budget and mark the step in flight first; complete or conservatively settle it afterward. Reclaim only leases that expired before dispatch, and never replay an in-flight call whose provider outcome is unknown.
- Persist run idempotency before dispatch and enforce tenant admission limits under a PostgreSQL lock. Replays of an accepted operation bypass the quota without creating another run.
- Enforce tenant ownership with RLS and composite tenant foreign keys. Never use a service-role credential in a user route.
- Keep application briefs mutable only through optimistic revisions. Every run references an immutable opportunity snapshot, and deleting its application revokes all derived publications and share links.
- Require an exact configured public origin for every state-changing browser request, including when the app runs behind a reverse proxy.
- Browser-facing database roles are assumed only after authenticated tenant resolution. The company-researcher executor uses a dedicated non-owner login whose only inherited role is `career_company_researcher`; it accepts no browser-supplied tenant selector.
- Store only SHA-256 capability-token hashes. Exchange a URL-fragment token for an HttpOnly, Secure, SameSite=Lax session; recheck expiry/revocation on every request. Private responses are `no-store`, `no-referrer`, `noindex` and expose no cross-navigation.
- Cloud agents run as non-root in per-run sandboxes with no host shell, minimal scoped secrets, read-only mounts, egress policy, and server-enforced token/cost/time/concurrency budgets.

Report vulnerabilities privately to the repository owner. Do not open a public exploit report before a private contact channel is configured.
