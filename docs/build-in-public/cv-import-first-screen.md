# Milestone: first CV import screen in code

The approved `V1 · Import du CV` concept now runs as a real Next.js route at
`/memory/import`. It deliberately covers one screen only so the mock can be
judged in a browser before the remaining product surfaces are rebuilt.

## What is represented

- the running CV parsing state and its source file;
- a visible, ordered extraction pipeline;
- the human-validation guardrail before Career Memory is updated;
- live claims with direct-citation and needs-confirmation states;
- the desktop shell from the artifact and a responsive mobile reading order.

## Visual proof

- `cv-import-first-screen-desktop.png`: 1440 × 900 browser viewport;
- `cv-import-first-screen-mobile.png`: iPhone 13 browser viewport.

## Brand assets used

- `public/brand/symbol/careeros-symbol-ink.svg`: application lockup symbol;
- `public/brand/favicon/favicon.svg`: browser favicon;
- `public/brand/favicon/apple-touch-icon.svg`: Apple touch icon.

The assets are copied unchanged from the supplied Career OS brand pack. The
wordmark is composed in HTML with the documented Space Grotesk Medium setting,
because the supplied SVG lockups contain live text and would otherwise depend
on the viewer's local font availability.

## Design boundary

The new artifact defines this screen's desktop visual language but does not
include an updated global design-system document or a dedicated mobile V1.
Desktop values therefore follow the artifact. Mobile follows the existing
handoff rule of a single content column below 1120 px with bottom navigation;
it remains a functional adaptation to validate with the designer.
