# Contributing

Use the Node version from CI and the pnpm version pinned in `package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Read `AGENTS.md` and the installed Next.js documentation before changing a framework boundary. Keep changes focused on a behavior, with a check that fails if that behavior breaks.

## Where code belongs

| Responsibility                       | Location                                                                                                                         | Boundary                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URLs and HTTP handlers               | `app/`                                                                                                                           | Parse and authenticate input, call services, return the response.                                                                                                                                 |
| Screen dispatch                      | `components/kit-route-page.tsx`                                                                                                  | Compose screens; do not define shared primitives or business logic here.                                                                                                                          |
| Shared UI and navigation             | `components/ui/`, `components/layout/`                                                                                           | Depend on contracts and utilities, never on the route dispatcher.                                                                                                                                 |
| Product features                     | `components/applications/`, `components/search-profiles/`, `components/memory/`, `components/dashboard/`, `components/settings/` | Keep forms, async state, and pure transformations separate when they have independent responsibilities.                                                                                           |
| Domain contracts and transformations | `lib/`                                                                                                                           | Validate external data with existing Zod schemas. Keep deterministic logic independent of HTTP and React.                                                                                         |
| Application persistence              | `lib/server/`                                                                                                                    | Share the application connection pool and transaction-local tenant authorization through `database.ts`. Never retain tenant state on a pooled connection.                                         |
| Durable execution                    | `lib/server/*worker.ts`, `supabase/migrations/`                                                                                  | Reserve atomically, perform network work outside transactions, persist using ownership/version checks. Keep worker identities separate from application credentials.                              |
| Model transport                      | `lib/server/local-openai-transport.ts`                                                                                           | Own URL restrictions, timeouts, byte limits, and response envelopes. Each role owns its prompt, limits, and output schema.                                                                        |
| Translations                         | `lib/i18n/dictionaries/`, `components/i18n/`                                                                                     | Use stable keys and explicit parameters at label rendering sites. Never pass user data through a translation lookup or walk React children to translate them.                                     |
| Styles                               | `app/design-system.css`, `app/styles/`, component CSS modules                                                                    | Keep tokens in the design system, shared primitives in `globals.css`, and surface styles with their layout or feature. Remove superseded declarations; do not append another override generation. |
| Simulations                          | `scripts/simulation/`, `benchmarks/`                                                                                             | No production imports. Simulated recovery is not evidence of durable recovery.                                                                                                                    |

Use the existing dependencies and native platform capabilities before adding a library. Remove abandoned screens and superseded CSS instead of leaving another override layer. Billing, managed hosting, and unimplemented connectors must say they are unavailable; synthetic examples belong in `/demo` or test fixtures.

## Verification

```sh
pnpm check
pnpm build
```

`pnpm check` runs formatting, zero-warning lint, TypeScript, and unit tests. A production build catches server/client and route compilation errors that unit tests cannot.

For persistence, authorization, or concurrency changes, start a disposable local database and run the relevant integration checks:

```sh
pnpm db:up
pnpm db:test
pnpm test:integration:http
pnpm test:integration:worker
pnpm test:integration:semantic
```

Do not reset a database to work around an unknown migration. Use a separate test instance. Database tests use the disposable `career_os` database; never point them at production.

For navigation, interactions, translated labels, or CSS:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests run the production build. API mocks verify UI state transitions, request payloads, and failure behavior; SQL and HTTP integration tests independently verify persistence and authorization. A responsive assertion must first prove the intended screen loaded. Contrast checks read computed styles from rendered controls after the full cascade.

CI includes the core SQL and HTTP suites, correction-worker integration, and a browser subset covering application approvals/publication, route rendering, mobile layout, and accessibility. The complete browser and worker suites are available locally. Keep README claims aligned with `.github/workflows/ci.yml`.

A useful change description states the affected behavior, the checks run, and any remaining limitation. Do not describe a local test pass as CI, deployment, or production verification.
