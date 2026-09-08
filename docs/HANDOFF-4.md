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

## Deliberate boundaries

- The guided interview is a factual questionnaire, **not a live model conversation**. A single resumable testimony uses existing versioned profile persistence; signing creates a private, declared claim with interview-only permission. No automatic claim repair, independent verification, market-impact calculation or publication is implied. Additional interview sessions and model-led follow-ups are not implemented by this lot.
- Notifications read the eight recent applications and stored link activity. They are not an email delivery system and do not persist read/unread preferences.
- Models are configured by the instance administrator. OAuth integrations, personal API keys, cloud checkout, trials, billing pause and email preferences remain inactive; these screens explain that state rather than simulating a working service.
- Offline mode preserves the current screen, not a durable outgoing queue. Reloading can discard unsaved input.
- Unknown workspace routes show the kit's not-found state through the existing catch-all; this is not an HTTP routing rewrite.
- Existing populated screens retain their business logic and shell. Importing the primitive library is not a claim that every old component or every state in the designer's 13 documents has been migrated. This log covers the **new handoff surfaces**, not full pixel certification of the entire app.

## Validation — 8 September 2026

- `pnpm check`: formatting, lint and TypeScript pass; 231 unit tests pass, 2 existing checks skipped.
- `pnpm build`: production build passes.
- Full browser regression: 166 checks passed on desktop and mobile. Sixteen subsequent focused checks passed for the final interview layout and memory entry point, EN/FR entry, PKCE request, notifications, settings, focus restoration and session revocation.
- Browser persistence and Supabase Auth requests in these checks use synthetic, intercepted responses. No live email delivery, real model run, payment, deployment or new Supabase record is claimed as validated by them.
- Fixed a session-revocation edge case: the SDK returns a successful no-op when the browser session is absent. The UI now refuses to report other devices as revoked in that case.
- Fixed class merging between custom typography and semantic colors; transparent buttons no longer inherit the old generic dark button background.
- Removed the obsolete empty-state stylesheet. Unrelated social-post edits were kept outside this milestone.

English screenshots with synthetic data: [build-in-public evidence](build-in-public/handoff-4/README.md).
