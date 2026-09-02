# Security model

- Treat source documents, job pages, model output and tool results as untrusted data.
- Fetch no submitted URL in v0.1. A future fetcher must allow only HTTP(S) 80/443, resolve and block private/link-local/metadata IPs before every request and redirect, cap redirects/body/time/MIME, and use an egress allow-list.
- Validate all generated artifacts with strict schemas and resolve referenced IDs again inside the tenant transaction.
- Enforce tenant ownership with RLS and composite tenant foreign keys. Never use a service-role credential in a user route.
- `career_app`, worker, reviewer and publisher are `NOLOGIN` database roles assumed only by a trusted backend after JWT verification. Request claim settings are transaction-scoped inputs from that backend, never accepted from a browser or an exposed database connection.
- Store only SHA-256 capability-token hashes. Exchange a URL-fragment token for an HttpOnly, Secure, SameSite=Lax session; recheck expiry/revocation on every request. Private responses are `no-store`, `no-referrer`, `noindex` and expose no cross-navigation.
- Cloud agents run as non-root in per-run sandboxes with no host shell, minimal scoped secrets, read-only mounts, egress policy, and server-enforced token/cost/time/concurrency budgets.

Report vulnerabilities privately to the repository owner. Do not open a public exploit report before a private contact channel is configured.
