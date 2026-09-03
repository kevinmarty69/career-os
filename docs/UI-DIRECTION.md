# UI source of truth

Career OS implements the designer handoff named `Career OS - Charte et concepts`, version 1.0 dated 3 September 2026. Do not infer a missing screen, component, token or state. Ask for an additional design before implementing an uncovered surface.

## Precedence

When files disagree, use this order:

1. `Career OS - Handoff Kit.dc.html`
2. `Career OS - Design System.dc.html`
3. `Career OS - A · Écrans.dc.html` and `Career OS - A · Écrans 2-7.dc.html`

`Charte Graphique.dc.html`, `Career OS - App Concepts.dc.html`, `Career OS - SaaS v2.dc.html` and `Career OS - SaaS v3.dc.html` are archived explorations. They are not implementation references.

## Non-negotiable rules

- Every displayed claim carries `Sourcé`, `Déclaré` or `Sans source`.
- Agent output is a reversible proposal, never an accepted fact.
- Publication, sending and private-link creation require an explicit human action.
- Internal documents never appear in a deliverable, including as an excerpt or paraphrase.
- Use only the tokens, type scale, radii, spacing, icon vocabulary, component variants and motion defined by the Design System.
- Use one indigo accent per screen. Semantic colors communicate state only.
- No gradients, decorative hero, emoji, dark global theme, glass effect or decorative animation.
- Preserve visible keyboard focus and the responsive behavior specified for the four breakpoint ranges.
- Errors state what happened, what was preserved and the available exit action, in that order.

## Screen contract

The normative inventory is A1-A33:

- A1 `/`: home
- A2 `/memory`: professional memory
- A3 `/applications`: application list or board
- A4 `/applications/:id`: application dossier
- A5 `/applications/:id/review`: agent run and human review
- A6 `/memory/import`: import and indexing
- A7 `/applications/:id/page`: private-page editor
- A8 `/p/:slug`: recruiter view
- A9 `/links`: private links and revocation
- A10 `/insights`: insights
- A11 `/memory/interview`: guided interview
- A12 `/interviews/:id`: interview preparation
- A13 `/assets`: reusable assets
- A14 `/settings/models`: models and instance
- A15 `/`: empty first-run state
- A16 `/applications/:id`: analysis in progress
- A17 `/memory/conflicts`: source conflicts
- A18 `/settings/privacy`: evidence privacy
- A19 `/p/:slug`: expired link
- A20 `< 900px`: mobile review, dossier and link screens
- A21 `/applications/:id/published`: publication success
- A22 `/interviews/:id/debrief`: interview debrief
- A23 `/applications/:id/versions`: versions and comparison
- A24 `/runs`: errors and recovery
- A25 global overlay: command palette
- A26 `/applications/:id/company`: company dossier
- A27 `/messages`: emails and follow-ups
- A28 `/memory/skills`: skill map
- A29 `/onboarding/hosting`: hosting choice
- A30 `/inbox`: notifications and activity
- A31 `/settings/billing`: subscription and billing
- A32 `/settings/integrations`: integrations and API
- A33 `/settings/data`: export and deletion

## Known missing design

The current product has `/sign-in`, but the handoff has no authentication screens. Sign-in, account creation, email verification, forgotten/reset password and expired-session states must not be redesigned until the designer supplies desktop, mobile, loading and error variants.

## Merge gate

Every screen must pass the Design System review checklist and its screen-specific acceptance criteria before merge. A visually similar implementation is not sufficient.
