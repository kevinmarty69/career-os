# Local resource limits

- Do not start Docker, Docker Desktop, or `supabase start` on this workstation.
- Use the configured Supabase project or disposable native PostgreSQL/Auth tests; never reset existing databases.
- Run builds, typechecks and browser suites sequentially, not in parallel across agents.
- Do not load or download a local inference model on this 8 GB machine. Keep provider calls opt-in and obtain approval before spending.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
