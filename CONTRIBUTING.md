# Contributing

Use the Node version from CI and the pnpm version pinned in `package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Read `AGENTS.md` and the installed Next.js documentation before changing a framework boundary. Keep changes focused on a behavior, with a check that fails if that behavior breaks.

## Where code belongs

| Responsibility                       | Location                                                                                                                         | Boundary                                                                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| URLs and HTTP handlers               | `app/`                                                                                                                           | Parse and authenticate input, call services, return the response.                                                                                                                                                              |
| Screen dispatch                      | `components/kit-route-page.tsx`                                                                                                  | Compose client screens on the server; do not pull every feature into one client entry point.                                                                                                                                   |
| Shared UI and navigation             | `components/ui/`, `components/layout/`                                                                                           | Depend on contracts and utilities, never on the route dispatcher.                                                                                                                                                              |
| Product features                     | `components/applications/`, `components/search-profiles/`, `components/memory/`, `components/dashboard/`, `components/settings/` | Keep forms, async state, and pure transformations separate when they have independent responsibilities.                                                                                                                        |
| Domain contracts and transformations | `lib/`                                                                                                                           | Validate external data with existing Zod schemas. Keep deterministic logic independent of HTTP and React.                                                                                                                      |
| Application persistence              | `lib/server/`                                                                                                                    | Share the application connection pool and transaction-local tenant authorization through `database.ts`. Never retain tenant state on a pooled connection.                                                                      |
| Durable execution                    | `lib/server/*worker.ts`, `supabase/migrations/`                                                                                  | Reserve atomically, perform network work outside transactions, persist using ownership/version checks. Keep worker identities separate from application credentials.                                                           |
| Model transport                      | `lib/server/local-openai-transport.ts`                                                                                           | Own URL restrictions, timeouts, byte limits, and response envelopes. Each role owns its prompt, limits, and output schema.                                                                                                     |
| Translations                         | `lib/i18n/dictionaries/`, `components/i18n/`                                                                                     | Use stable keys and explicit parameters at label rendering sites. Never pass user data through a translation lookup or walk React children to translate them.                                                                  |
| Styles                               | `app/design-system.css`, `app/styles/`, component CSS modules                                                                    | Use `globals.css` as the ordered entry point, tokens in the design system, primitives in `styles/base.css`, and Tailwind scopes in `styles/ui.css`. Remove superseded declarations; do not append another override generation. |
| Simulations                          | `scripts/simulation/`, `benchmarks/`                                                                                             | No production imports. Simulated recovery is not evidence of durable recovery.                                                                                                                                                 |

Shared controls live in `components/ui/`; onboarding, notifications and interview screens live with their product features. Do not copy a design handoff into a parallel component kit. ESLint enforces that shared controls cannot import feature screens and that features cannot import the server dispatcher.

Use the existing dependencies and native platform capabilities before adding a library. Remove abandoned screens and superseded CSS instead of leaving another override layer. Billing, managed hosting, and unimplemented connectors must say they are unavailable; synthetic examples belong in `/demo` or test fixtures.

## Verification

```sh
pnpm check
pnpm build
```

`pnpm check` runs formatting, zero-warning lint, TypeScript, and unit tests. A production build catches server/client and route compilation errors that unit tests cannot.

Persistence, authorization and concurrency fixtures run in CI's disposable native PostgreSQL environment:

```sh
pnpm test:native pnpm verify:persisted
```

Do not run that command on this workstation: `AGENTS.md` prohibits local PostgreSQL/Auth stacks and Docker. Local product checks use the configured Supabase development project, synthetic accounts and run-owned records only. Never run destructive schema fixtures against it. Model calls remain opt-in; validation must not silently spend provider credits.

For navigation, interactions, translated labels, or CSS:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests run the production build. API mocks verify UI state transitions, request payloads, and failure behavior; SQL and HTTP integration tests independently verify persistence and authorization. A responsive assertion must first prove the intended screen loaded. Contrast checks read computed styles from rendered controls after the full cascade.

CI runs the SQL and HTTP suites, all worker integration tests, and the full desktop/mobile browser suite. Locally, run formatting, lint, TypeScript, unit tests, the build and mocked browser tests sequentially. Keep README claims aligned with `.github/workflows/ci.yml`.

A useful change description states the affected behavior, the checks run, and any remaining limitation. Do not describe a local test pass as CI, deployment, or production verification.
