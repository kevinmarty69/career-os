# Follow-ups and application age

Two small changes informed by individual conversations, not a claim of broad demand:

- Sapna described spreadsheet upkeep, scanning rows and remembering follow-ups. Home now reads incomplete dated tasks across active dossiers, oldest due first, and links straight to the existing task list. The first three tasks are visible with an expand control. Completed, deleted and closed-dossier tasks are excluded. The endpoint is tenant-scoped and returns the next 100 tasks with an explicit overflow notice. Agent workflows now load in batches of four across the existing application list (up to 100), rather than checking only eight recent entries.
- Devieka described comparing applications of similar age. The existing timeline now lets users save or correct their stage and actual submission date. Insights shows 0–6, 7–13, 14–27 and 28+ UTC-day groups, plus unknown dates, with response counts and denominators. These are descriptive age groups, not predicted response probabilities or deadlines. No status is changed automatically; a closed dossier is not treated as proof of rejection.
- Pat's cutoff prompted a check, not another scoring system. Existing ranking preserves low-ranked opportunities; alert thresholds do not hide them. Ranking behavior is unchanged.

Sources: [Sapna](https://x.com/sapnavermaui/status/2098360249824817432), [Devieka](https://x.com/devieka_24/status/2100785100455821606), [Pat](https://x.com/PatBergie/status/2101753200957394987). Interpretation uses the recorded exchanges; none is presented as a Career OS customer or endorsement.

## Verification

- Unit tests cover UTC/date boundaries, missing and future dates, duplicate responses, completed tasks, ordering and the request adapter with mocked fetch.
- Stateful mocked browser tests cover an older ninth application, follow-up navigation/completion, submission-date save/reload/clear, English/French and error recovery on desktop/mobile.
- The opt-in Supabase smoke script additionally exercises real authentication, persistence, age aggregation and tenant isolation using disposable synthetic records. No models, outbound applications or messages are involved.
- The existing HTTP integration suite now checks date correction, omission preservation, unknown-date clearing, future-date rejection and the task agenda. It remains an isolated CI test, not a destructive local database fixture.

Local verification: formatting, lint, typechecking and production build passed; 247 unit tests passed (2 existing skips), and 213 desktop/mobile browser tests passed (1 intentional mobile skip). The production dependency audit reported no known vulnerabilities. The configured Supabase smoke passed with real authentication and scoped synthetic data cleanup; this does not establish SMTP delivery or production deployment readiness.

Operators must apply migration `0056_application_submission_date.sql` through `pnpm db:migrate` before running this version. It adds a nullable date without inferring dates for existing applications. The configured development Supabase project has been migrated; this is not a production deployment.
