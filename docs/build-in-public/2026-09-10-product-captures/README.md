# Current product captures — 10 September 2026

Three fresh Chromium screenshots of the implemented Career OS interface, not designer mockups or recycled September 4 images.

- `01-home.png`: `/` — corrected populated dashboard, two pending review decisions, two running workflows and three evidence gaps. The designer's desktop columns, monogram sizes, card padding and signal banner are restored; mobile stacks the panels without overflowing. This capture supersedes the earlier broken home image sent on September 10.
- `02-applications.png`: `/applications` — application pipeline, reusable evidence and a discovered opportunity. Long role names truncate in the current five-column layout.
- `03-evidence-review.png`: application review — a factual objection, its source excerpt and the publication guard. Recommended as the primary image for an evidence/human-review post.

All PNGs are 3200 × 2000 pixels, from a 1600 × 1000 CSS-pixel viewport at 2× device scale. English locale; raw viewport captures without added chrome, slogans, cropping, styling changes or image manipulation.

## Provenance

- Product source checkpoint: `e36bb8f`.
- Fresh production build ID: `pRkyI1Q-JafaK69UKWArJ` (September 10, after the sidebar correction). The sidebar now stays within the viewport, with independently scrolling navigation and a visible memory/account footer.
- Demo dataset: eight applications across all five pipeline stages (seven active), eight document sources/evidence excerpts, eleven claims (eight sourced, three to document), two pending review decisions and two running workflows. All counts derive from these fixtures, not DOM edits or invented customer metrics.
- `capture.mts` reuses the existing persisted-workspace fixture and validates demo application/run payloads against the real schemas.
- All API responses are intercepted in an isolated browser context. Non-local browser requests are blocked. Unconfigured `/api/auth/workspace-session` returns 204. No real identity, credential, database write, model call, payment or publication is involved.
- Alex Morgan and all companies, sources, jobs, stages and review outcomes are synthetic. The captures demonstrate rendering, not actual customer usage, agent quality or a fully authenticated end-to-end workflow. No review action was submitted.
- Capture run: three expected headings visible, English document locale verified, fonts loaded, zero browser page errors. Sidebar footer bounds are checked before capture. All three PNGs visually inspected. Production build and 13 targeted desktop/mobile checks pass, including EN/FR home geometry, publication activity, empty/loading/error states, and the sidebar footer/menu at heights of 320, 400, 600, 768 and 1000px on home and memory pages. One desktop-only sidebar test is intentionally skipped on mobile, which uses bottom navigation. This is scoped validation, not a claim of whole-app visual certification.

## Reproduce

Use the existing production build, start a temporary local server with `CAREER_OS_E2E=1 pnpm exec next start --hostname 127.0.0.1 --port 3117`, then run `pnpm exec tsx docs/build-in-public/2026-09-10-product-captures/capture.mts`. Stop that temporary server afterwards. No Docker or local database is needed.
