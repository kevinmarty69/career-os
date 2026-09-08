# Local resource limits

- Do not start Docker, Docker Desktop, or `supabase start` on this workstation.
- Use the configured Career OS Supabase development project for local product/integration validation. Do not start a local PostgreSQL/Auth stack or create local test databases.
- Use synthetic accounts and workspaces for tests; delete only records created by that run. Never reset the connected project or run destructive migration/schema fixtures against it. Keep destructive fixtures isolated in CI, not on this workstation.
- Run builds, typechecks and browser suites sequentially, not in parallel across agents.
- Do not load or download a local inference model on this 8 GB machine. Keep provider calls opt-in and obtain approval before spending.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
