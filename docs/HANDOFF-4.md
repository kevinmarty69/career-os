# Handoff 4 — integration log

Source: designer kit v2.4, 8 September 2026. Approved visual direction; copy remains provisional.

## Constraints

- Preserve the running application, Supabase auth, EN/FR, publication guards and workspace isolation.
- Import the supplied primitives instead of reinterpreting them. Adapt only integration, accessibility, translation and the updated contrast floor.
- No Tailwind preflight reset: existing screens retain their layout during adoption.
- No paid service, real payment, model call or deployment enabled by this work.
- Do not imply a configured service or persisted operation when it is unavailable.

## Delivery checklist

- [x] Shared form/feedback primitives imported; scoped CSS, dialog focus and contrast adaptations. Adoption on existing screens remains incremental.
- [x] Day-zero onboarding and secondary empty states (memory, applications, review, links, runs). Eight EN/FR desktop/mobile checks pass, including zero example-data writes.
- [x] Guided interview UI: accessible from Career memory, five factual questions, save/resume, failed-save recovery, explicit signature and readable source in memory.
- [x] Notifications from workspace decisions and anonymous link activity; 404/error/offline states; instance models and integration availability.
- [x] Account entry: Supabase email link with password fallback. Instance/cloud presentation does not activate billing.
- [x] Separate marketing landing at `/welcome`; examples are labeled and never written to the workspace.
- [x] EN/FR, keyboard, desktop/mobile and regression validation. See evidence below for the exact scope.

Designer defaults do not override PRODUCT-REFERENCE.md or existing security boundaries. In particular an attestation does not automatically upgrade a claim to verified, and the UI must not promise offline delivery without durable synchronization.

## Completion work — 9 September 2026

This is a progress ledger, not a claim that the whole handoff is complete.

- Multiple independent guided interviews, including an entry point from a selected claim. Signing retains a private transcript; a separate, explicit permission can make the reviewed statement available to applications/resumes. The original unsupported wording remains blocked and published pages never change automatically.
- Numeric source conflicts: side-by-side source excerpts and a saved human arbitration. All unresolved variants are excluded from new deterministic strategy/review paths and run snapshots; no variant is silently promoted to verified.
- Notification read state and the five product-email preferences persist in Supabase account metadata. Failed writes retain the saved choice. Email delivery is still disabled.
- Structured interview debriefs use the existing private application timeline: questions, answers, evidence gaps, next step and notes. Save failures preserve input; reloading restores the last saved debrief.
- Unknown routes now use native Next.js `notFound()` and return HTTP 404. Sourced-memory counters exclude blocked/inferred claims. Shared checkbox layout is isolated from legacy form styles.
- Public GitHub README import is connected to the existing local review flow. Fixed public REST endpoints, authenticated/rate-limited requests, no token or private repository access, bounded UTF-8 content, original repository/blob reference retained. Candidates start unchecked; no ownership is inferred. A failed fetch preserves the URL for retry.
- Source arbitration can retain both versions with distinct, explicitly attested contexts. Ambiguous originals remain blocked; contextual statements remain declared, preserve restrictive source permissions and survive database ID remapping. The Skills route opens the existing skill view directly.
- A shared, signed testimony names draft applications whose analysis history contains the exact previous statement. The authenticated, workspace-scoped lookup is read-only, bounded to 100 drafts and keeps the private wording out of URLs. Dossier links reuse the existing explicit new-analysis flow; no agent run starts automatically and sent applications remain excluded. This is historical exact matching, not a claim of semantic relevance or that the statement appeared on a published page.
- Offline review decisions now have a bounded browser outbox: 50 choices per account/workspace, no proofs or credentials, stable server idempotency keys, cross-tab replay locking and a fresh authenticated scope check on reconnect. Stale/rejected choices stay visible for review/discard; transient failures are retained. Only review arbitration is queued, not publication, model starts or arbitrary edits. Reloading while offline still requires the app shell to be available; there is no service-worker cache.

### Remaining before claiming the complete handoff

- Model-led adaptive interviews, in-place evidence-backed claim repair in application drafts, and source conflict detection beyond identical numeric wording. Affected-draft navigation is delivered; automatic repair and market-impact estimates are not.
- Full notification event coverage and configured product-email delivery; current read state does not create a durable outgoing queue.
- Drive OAuth, GitHub account-wide synchronization, personal API tokens, editable per-stage model and budget controls, instance first-run setup. Single public GitHub README import is delivered.
- Private cloud trial, checkout and pause integration. Existing private cloud code must be reconciled with current Supabase identity before activation; no payment authorization is implied.
- Complete populated-state visual parity across every supplied screen. Offline review arbitration is delivered; arbitrary offline edits and offline app-shell caching are not.

### Validation for this milestone

- Lint, TypeScript and production build pass; 236 unit checks pass, 2 existing checks skipped.
- 16 focused browser checks pass on desktop/mobile: guided interview, debrief persistence/failure, conflict arbitration, notification preferences/failure, native 404 and existing handoff regressions.
- Browser fixtures intercept API/Supabase responses using synthetic records. This validates the UI contracts, not real email delivery, model calls, billing or production deployment.
- GitHub follow-up: 237 unit checks pass (2 skipped); 22 browser import/regression checks pass. The actual HTTP handler rejects anonymous/cross-origin requests. A credential-free live read of `kevinmarty69/career-os` returned a valid 8,452-character README and public language metadata; no workspace write occurred during that live read.
- Completion regression: all 182 desktop/mobile browser checks pass after fixing the GitHub import tablet overflow and localized Skills heading. The tablet fix addresses the two failures in the preceding GitHub CI run.
- Real Supabase development smoke passes: contextual arbitration and two independent signed interviews survive four profile revisions and regenerated IDs; another user cannot read the workspace. Only the synthetic workspace/account created by the test is deleted through the guarded workspace-deletion path. Run explicitly with `ALLOW_HANDOFF_MEMORY_SMOKE=1 NODE_OPTIONS=--conditions=react-server node --env-file=.env.local --env-file=.env.supabase.local --import tsx --test tests/integration/handoff-memory.test.ts`. No Docker, model call or email is involved.
- Final follow-up: production build and 14 targeted desktop/mobile browser tests pass, including affected-draft lookup failure/retry with zero run requests. The real Supabase smoke also validates exact historical matching, exclusion after an application is marked sent, and cross-user isolation. Its inert historical run has no worker steps, provider request or publication; fixture cleanup uses the guarded workspace deletion service.

GitHub connector follows the [official public README endpoint](https://docs.github.com/en/rest/repos/contents#get-a-repository-readme); no SDK or OAuth scope is added.

## Original delivery boundaries — 8 September 2026

- At the initial checkpoint, the guided interview was one factual questionnaire, **not a live model conversation**. See the 9 September ledger for multiple sessions and explicit statement-sharing permissions.
- Notifications read the eight recent applications and stored link activity. They are not an email delivery system; read state and preferences were added on 9 September.
- Models are configured by the instance administrator. OAuth integrations, personal API keys, cloud checkout, trials, billing pause and email preferences remain inactive; these screens explain that state rather than simulating a working service.
- Offline mode preserves the current screen, not a durable outgoing queue. Reloading can discard unsaved input.
- Native HTTP 404 handling replaced the initial catch-all fallback on 9 September.
- Existing populated screens retain their business logic and shell. Importing the primitive library is not a claim that every old component or every state in the designer's 13 documents has been migrated. This log covers the **new handoff surfaces**, not full pixel certification of the entire app.

## Validation — 8 September 2026

- `pnpm check`: formatting, lint and TypeScript pass; 231 unit tests pass, 2 existing checks skipped.
- `pnpm build`: production build passes.
- Full browser regression: 166 checks passed on desktop and mobile. Sixteen subsequent focused checks passed for the final interview layout and memory entry point, EN/FR entry, PKCE request, notifications, settings, focus restoration and session revocation.
- Browser persistence and Supabase Auth requests in these checks use synthetic, intercepted responses. No live email delivery, real model run, payment, deployment or new Supabase record is claimed as validated by them.
- Fixed a session-revocation edge case: the SDK returns a successful no-op when the browser session is absent. The UI now refuses to report other devices as revoked in that case.
- Logout uses the SDK's error-preserving JWT endpoint: 401/403/404/500 responses keep devices visible and permit retry. Four desktop/mobile regression checks pass; no service-role credential is used in the browser.
- Fixed class merging between custom typography and semantic colors; transparent buttons no longer inherit the old generic dark button background.
- Removed the obsolete empty-state stylesheet. Unrelated social-post edits were kept outside this milestone.

English screenshots with synthetic data: [build-in-public evidence](build-in-public/handoff-4/README.md).
