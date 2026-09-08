# ADR-006: Supabase Auth owns identity and sessions

Status: implemented and smoke-tested on a fresh Supabase project; supersedes ADR-003.

## Boundary

Supabase Auth handles password credentials, email confirmation, PKCE callbacks,
token refresh and sign-out. Career OS keeps workspace membership in the private
`career_identity` schema and application data in `app`. The browser cannot query
either schema through the Supabase Data API.

Each data request validates the user with Supabase Auth, validates JWT claims,
checks that the referenced `auth.sessions` row still exists, and verifies the
selected workspace membership. Neither the workspace cookie nor user-editable
JWT metadata grants authority. Existing transaction-local authorization and RLS
continue to protect data. Sensitive actions retain the ten-minute fresh-session
requirement, measured from the database session's creation, not token refresh.

The runtime uses the `career_web` login, not `postgres` or a Supabase secret key.
Every worker has a separate NOINHERIT login with only its corresponding execution
role. Migration credentials and any administrative test key stay outside runtime
configuration. PostgreSQL TLS verifies the CA and hostname.

## Fresh installation

Use a managed or self-hosted Supabase instance (including its Auth service), not
the historical PostgreSQL-only development container. This does not require a
paid AI provider or Vercel deployment.

1. Copy `.env.example` to `.env.local`. Set `CAREER_OS_APP_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Put the administrative PostgreSQL connection in `MIGRATION_DATABASE_URL`.
   Download the server CA through the Supabase dashboard and set
   `DATABASE_CA_CERT_PATH`. Use a direct or session-pooler connection for migrations.
3. Run `pnpm db:migrate`. The immutable historical SQL is translated into
   `career_identity`; it never creates or revokes Supabase's managed `auth` schema.
   Historical pgcrypto calls resolve in Supabase's `extensions` schema. Elevated
   pre-existing worker roles are rejected, not silently accepted.
4. Provision a strong login password for `career_web` and set its connection as
   `DATABASE_URL`. For each worker, create a separate `LOGIN NOINHERIT` role and
   grant only its corresponding `career_*` role; configure the matching worker URL.
   Keep the migration URL in a separate ignored operator env file thereafter.
5. Set Supabase Auth's site URL to the app origin, allow the exact `/auth/callback`
   redirect, require email confirmation, and set a minimum password length of 12.
   The default confirmation flow uses PKCE. For a custom token-hash email template,
   the app also supports `/auth/confirm?type=email&token_hash=...`.
6. Start the app. New users confirm their email, sign in, then create/select an
   app workspace. A Supabase platform organization is not an application workspace.

OAuth uses the same callback. Google and LinkedIn buttons/providers are deliberately
not enabled until the operator supplies the provider credentials and configures
redirects. No OAuth success is claimed yet.

## Migration limits

Existing Better Auth databases are not automatically upgraded. The migration
runner refuses them before changing data: old user IDs, password hashes and
workspace ownership need an explicit identity migration, not a destructive reset.
The old environment can be restored to use the old code; no legacy local data was
copied into the fresh managed project.

The Better Auth harness is replaced by `pnpm test:native pnpm verify:persisted`:
native PostgreSQL plus a checksum-pinned official GoTrue binary, a disposable
database and real sessions. No Docker is required. Fixtures use `career_identity`
memberships and the real managed Auth schema. Never run them against a live
project. Code checks remain distinct from SMTP delivery or deployment proof.

## Repeatable live smoke

The opt-in test creates two synthetic Supabase users and their own workspaces,
then deletes only those test records. It sends no confirmation emails and runs
no paid model calls. It requires a local app and an operator-only test env file:

```bash
ALLOW_SUPABASE_AUTH_SMOKE=1 node \
  --env-file=.env.local --env-file=.env.supabase.local \
  --import tsx scripts/smoke-supabase-auth.ts
```

The private operator file supplies `SUPABASE_SECRET_KEY`, `MIGRATION_DATABASE_URL`
and the database CA path. Never add this key to a `NEXT_PUBLIC_*` variable.

Sources: [Next.js SSR integration](https://supabase.com/docs/guides/auth/server-side/nextjs),
[session revocation semantics](https://supabase.com/docs/guides/auth/sessions),
[PostgreSQL connections and TLS](https://supabase.com/docs/guides/database/connecting-to-postgres).
