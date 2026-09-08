# MVP validation without extra infrastructure

Date: 8 September 2026. Local application, connected Supabase development project.
No Docker, local PostgreSQL/Auth stack, inference model download, provider call,
email delivery, message sending, purchase or deployment was performed.

## Shipped changes

- Supabase migrations through 0053: durable contact research and explicit remote
  model cost estimates/reservations. Re-running the migration runner applied zero
  changes. Existing table fingerprints and privileges were checked before/after.
- Auth confirmation and OAuth callback redirects retain the configured public
  origin. A real smoke exposed `127.0.0.1` becoming `localhost`, losing the cookie.
  The shared redirect helper fixes both handlers; signup confirmation is verified.
- Public contact research: bounded sources, quoted provenance, at most three
  suggestions, explicit human acceptance, no automatic outreach. Contacts keep
  manual statuses, dated follow-ups and optimistic revision checks.
- Remote OpenAI-compatible BYOK transport is explicit opt-in, with pinned public
  HTTPS destinations, no redirects, configured prices and request/run ceilings.
  No provider has been configured or called for this validation.
- On macOS self-hosting, the deterministic page composer runs with Node 24 and
  the native OS sandbox instead of Docker. It is not an arbitrary-code sandbox or
  a substitute for managed tenant isolation.
- The application pipeline supports search and filters; incomplete/failed runs
  do not imply publication readiness. Mobile dossier content reserves space for
  the fixed bottom navigation so workflow actions remain reachable.

## Verified here

- Production build and TypeScript check pass, using one worker.
- `pnpm check` passes: formatting, lint, TypeScript and unit suite (229 passed,
  zero failures, two opt-in native checks skipped).
- Explicit native composer suite: five passed. Actual PageSpec output, invalid
  input rejection, network/file/write/subprocess denial. The OS-only denial test
  also passes with Node's additional permission layer removed.
- Hosted Supabase smoke: generated unconfirmed signup, real confirmation handler,
  password login, workspace/application persistence, sourced contact tracking,
  stale revision rejection, reload persistence and export checksum.
- The supplied n8n and Cohere URLs were imported through the real API, persisted
  and explicitly promoted to application dossiers that opened in the browser.
- Real English CV imported in the browser and explicitly approved: 20 claims
  persisted in the synthetic workspace. Source correction survives reload and
  preserves both revisions; the workspace is then removed with its test data.
- Two-account isolation, forged workspace cookie, cross-origin mutation denial,
  session listing, UI logout and replay of revoked session checked.
- Cleanup verified: zero synthetic smoke users remain; the existing user,
  workspace and 20 claims remain intact.

Browser contract checks use explicit API fixtures, not a real model: 154 scenarios
across desktop/mobile, 151 passed in the broad run; the three remaining selector
and responsive-help assertions were corrected and passed in a 30-test targeted
rerun. No product assertion was bypassed with forced clicks. Two obsolete
auto-confirming signup tests were replaced by the scoped Supabase smoke (including
provenance revision history and real-offer promotion), which always cleans up its
synthetic accounts. Browser checks do not prove model quality or production
operation. Destructive database fixtures are confined to isolated CI, not the
connected Supabase project.

Live ATS check also found an actual Ashby compatibility bug: equity compensation
can omit currency. The optional field is now accepted without inventing a salary;
the n8n job and its 44-job public board parse successfully. Cohere uses the existing
single-page fallback when its full board exceeds the 1 MiB fetch ceiling.

## Still not validated / not a launch claim

- Real model research → strategy → composition → reviews → human approval →
  publication quality. The runtime is unconfigured; no paid call is authorized.
- Real contact recommendation relevance and correct attribution from live sources.
- SMTP delivery, Google/LinkedIn OAuth provider setup and a public production domain.
- Managed cloud subscriptions, billing, provider quotas, backup restore drills,
  operational alerting and commercial onboarding. These remain the open cloud lot.

This milestone is an implemented and partially live-tested MVP foundation, not a
claim that the cloud SaaS is ready to sell. No recruiter acceptance is implied.
