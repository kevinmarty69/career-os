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

### Remaining before claiming the complete handoff

- Model-led adaptive interviews, evidence-backed claim repair in specific application drafts, and source conflict detection beyond identical numeric wording. No automatic market-impact statistics.
- Full notification event coverage and configured product-email delivery; current read state does not create a durable outgoing queue.
- GitHub/Drive connectors, personal API tokens, editable per-stage model and budget controls, instance first-run setup.
- Private cloud trial, checkout and pause integration. Existing private cloud code must be reconciled with current Supabase identity before activation; no payment authorization is implied.
- A durable offline decision queue and complete populated-state visual parity across every supplied screen.

### Validation for this milestone

- Lint, TypeScript and production build pass; 236 unit checks pass, 2 existing checks skipped.
- 16 focused browser checks pass on desktop/mobile: guided interview, debrief persistence/failure, conflict arbitration, notification preferences/failure, native 404 and existing handoff regressions.
- Browser fixtures intercept API/Supabase responses using synthetic records. This validates the UI contracts, not real email delivery, model calls, billing or production deployment.

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
