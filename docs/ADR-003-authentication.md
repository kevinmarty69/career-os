# ADR-003: Authentication and tenant membership

Status: accepted for implementation

## Decision

Use `better-auth@1.7.2` inside the existing Next.js application, backed by the
same PostgreSQL database. Use database-backed sessions and the organization
plugin for membership. Keep Career OS authorization in PostgreSQL RLS: an
authenticated user ID and selected tenant ID are copied into transaction-local
settings before the application role executes a query.

The self-hosted and managed editions use the same auth code. Operators provide
their own OAuth or email-delivery credentials; Career OS does not depend on a
hosted identity service.

## Required security posture

- Require verified email before organization invitation actions with
  `requireEmailVerificationOnInvitation: true`.
- Never authorize from a client-selected organization ID alone. Verify active
  membership server-side before setting `app.user_id` and `app.tenant_id`.
- Use opaque, database-backed session cookies with `HttpOnly`, `Secure` in
  production and `SameSite=Lax`; do not put tenant roles in a long-lived JWT.
- Revoke sessions after password or identity changes and expose per-device
  session revocation.
- Apply auth schema changes as reviewed SQL migrations, not at application
  startup.
- Keep private publication capabilities separate from authenticated sessions.

## Why this option

Better Auth is MIT licensed, runs in-process with Next.js, supports PostgreSQL,
database-backed revocable sessions and organization membership. This is the
smallest shared architecture for the open-source and managed editions.

Supabase Auth remains a valid alternative for teams already operating the full
Supabase stack, but self-hosting adds a separate Go service and its Studio is a
single project rather than a multi-organization control plane. Keycloak provides
broader enterprise IAM, but a separate Java identity platform is not justified
for the first Career OS deployment.

## Evidence snapshot

Verified on 2 September 2026:

- `better-auth` latest stable: `1.7.2`, MIT, integrity
  `sha512-gKapKBEvYIGcMxi74RjQ7EbFLiqyQt58vdoJmL1qAlWSkY1Bc2Vqshl524/3u1NxauiOU03M/Ebh762Brmac9A==`.
- Better Auth supports Next.js handlers, direct PostgreSQL connections,
  organization membership and database-backed session revocation.
- GHSA-fmh4-wcc4-5jm3 remains configuration-dependent in `>=1.6.14`; the
  required mitigation is enforced above.
- Supabase Auth `v2.196.0` is MIT and self-hostable, but requires its own auth
  service and JWT lifecycle.
- Keycloak is Apache-2.0 and self-hostable, but adds a standalone IAM runtime.

Recheck versions and security advisories before every dependency upgrade.

Primary sources:

- [Better Auth installation and Next.js integration](https://better-auth.com/docs/installation)
- [Better Auth PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql)
- [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization)
- [Better Auth session security](https://better-auth.com/docs/reference/security)
- [GHSA-fmh4-wcc4-5jm3](https://github.com/better-auth/better-auth/security/advisories/GHSA-fmh4-wcc4-5jm3)
- [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting)
- [Supabase Auth architecture](https://supabase.com/docs/guides/auth/architecture)
- [Keycloak repository and licence](https://github.com/keycloak/keycloak)

## Acceptance gates

Implementation is not complete until tests prove:

1. anonymous users cannot create or mutate tenant data;
2. a member cannot select or query another tenant;
3. removed members lose access on their next authenticated request;
4. revoked and expired sessions fail;
5. invitation acceptance requires verified email;
6. private capability links remain usable without exposing an authenticated
   session or another tenant's data.
