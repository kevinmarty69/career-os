# Career OS Design System v2.0

Normative source: [Claude Design artifact](https://claude.ai/code/artifact/59f81df3-123b-44cb-b692-0ff24d1745fc), dated 7 September 2026.

The artifact is the source of truth. Its values are requirements, not suggestions. If a mockup conflicts with it, report the mismatch before implementation.

## Non-negotiable rules

1. Evidence before effect: every claim exposes its status and clickable source.
2. One obvious action: at most one ink-filled primary action per screen.
3. Announce before acting: show cost, duration, and scope before costly or irreversible actions.
4. Nothing is lost: waiting, error, and decision states always offer a lossless exit.
5. Material restraint: no gradients, glassmorphism, decorative illustration, emoji, or shadows on internal cards.

## Implementation

- [`app/design-system.css`](../app/design-system.css) defines the shared `@theme static` tokens and compatibility aliases. CSS modules and Tailwind utilities consume the same values.
- [`app/globals.css`](../app/globals.css) is the only stylesheet imported by the root layout. It declares the cascade order; `app/styles/` owns shared controls, layout, and feature styles. Keep responsive rules after the corresponding base rules.
- Dashboard and publication styling lives in `app/styles/dashboard.css` and `app/styles/publication.css`; screen styles do not belong in the token file.
- [`app/layout.tsx`](../app/layout.tsx) loads Instrument Sans 400/500/600 and Geist Mono 400.
- Material Symbols Rounded is the only icon family.
- Indigo is reserved for agent activity, generated output, and focus. Primary actions use `ink-900`.
- Public pages use the separate employer-derived palette with the fallback `#16211F / #2F6B5E` when no compliant brand colors can be derived.

Screen composition must follow the incoming approved mockups. Do not infer missing screen layouts from the design-system showcase.
