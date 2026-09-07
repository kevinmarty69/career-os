# Local Supabase import smoke test

The opt-in Supabase smoke script now accepts `CAREER_OS_SMOKE_CV` (a local PDF path) and `CAREER_OS_SMOKE_OFFERS` (comma-separated public job URLs).

Verified against the local app and the configured Supabase project:

- Password sign-in and workspace creation using synthetic, pre-confirmed accounts.
- Real PDF extraction in the browser, explicit review confirmation, and persistence of 20 claims with their source.
- Import and persistence of the Folk Principal Software Engineer posting.
- Application persistence, export, tenant isolation, CSRF rejection and sign-out revocation.
- Synthetic accounts and workspaces removed after the test.

No CV contents, credentials or personal screenshots are committed. This is not a test of email delivery or the complete agent pipeline. Email confirmation remains enabled; custom SMTP and a local model are not configured. Four model-independent workers can run locally (evidence, page composition, factuality review and job discovery); the model-dependent workers remain unavailable.
