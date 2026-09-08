# Model runtime (self-hosted)

Career OS does not supply or pay for a model in the open-source edition. The operator configures one server-side OpenAI-compatible Chat Completions endpoint for company research, strategy, qualitative reviews, contact research and semantic matching. Evidence checks and page composition do not require a model.

## Local endpoint

Use an existing loopback service supporting `response_format: json_schema`, a non-streaming JSON response, and token usage. No model or runtime is downloaded automatically.

```dotenv
CAREER_OS_MODEL_MODE=local
CAREER_OS_LOCAL_MODEL_BASE_URL=http://127.0.0.1:11434/v1
CAREER_OS_LOCAL_MODEL_API_KEY=local-only
CAREER_OS_LOCAL_MODEL=your-installed-model
```

`localhost`, `127.0.0.0/8` and `::1` are allowed in local mode. A service on a LAN address is not implicitly trusted; use a local tunnel if needed. A loopback address inside a container refers to that container. Do not expose an unauthenticated inference service on your network.

The small-model output must still pass exactly the same grounding/schema checks. A running model is not evidence that every workflow succeeds. Leave enough RAM for the application and database; do not load a local model on a constrained machine simply to pass a demo.

## Remote BYOK, explicit opt-in

Remote processing sends the supplied job and permitted profile evidence to the operator's chosen provider. Review their privacy/retention policy and disclose this to users. This configuration is **never** accepted from browser requests. API keys must stay in ignored server environment files, never `NEXT_PUBLIC_*`.

```dotenv
CAREER_OS_MODEL_MODE=remote
CAREER_OS_LOCAL_MODEL_BASE_URL=https://your-provider.example/v1
CAREER_OS_LOCAL_MODEL_API_KEY=replace-with-your-server-key
CAREER_OS_LOCAL_MODEL=your-provider-model
# Required, operator supplied: USD micro-dollars per token, input and output.
# Example arithmetic only, NOT a current provider tariff: $0.50/M input = 0.5.
CAREER_OS_MODEL_INPUT_MICROS_PER_TOKEN=0.5
CAREER_OS_MODEL_OUTPUT_MICROS_PER_TOKEN=2
# 1 USD = 1,000,000 micro-dollars. Example ceilings, not a recommended spend.
CAREER_OS_MODEL_MAX_REQUEST_COST_MICROS=500000
CAREER_OS_MODEL_RUN_COST_BUDGET_MICROS=1000000
```

Old `CAREER_OS_LOCAL_MODEL_*` names remain intentionally compatible; mode selects transport. HTTPS on port443, public DNS destinations only, DNS pinned to the resolved address, TLS certificate verification and no redirects. Keys are never forwarded to redirects. Missing rates or limits fail closed. Explicit zero rates can represent an operator-verified free endpoint; unknown pricing must not be entered as zero.

Estimates use your configured upper-bound rates and reported token counts, rounded up. The reservation uses a conservative byte-based token bound and the larger rate, so it can exceed a provider's eventual invoice substantially. Requests above the per-request ceiling are rejected **before dispatch**. Durable workflow reservations also enforce the run's persisted aggregate ceiling atomically. Semantic analysis and contact research use the request ceiling and their own durable idempotency fence; they are not pooled into an application's workflow budget. This is not a monthly billing/quota system.

Ledger `cost_basis` distinguishes `configured_rate_estimate`, `local_no_api_charge` and `reserved_upper_bound`. When a dispatched request fails ambiguously, the workflow consumes the reservation as an unknown upper bound and does not automatically retry. Semantic/contact unknown outcomes remain fenced. Costs are not verified invoices; extra provider fees, changed tariffs and account-level spending must also be limited with the provider's own controls. Restart model workers after changing configuration. A changed run budget applies only to newly created runs.

Apply migrations through the documented migration runner before enabling remote mode. Migration0053 removes local-only zero-cost assumptions without removing lease, tenant, lineage or human-approval checks. No remote endpoint is contacted by the unit tests. Full inference validation still requires an operator-configured model.
