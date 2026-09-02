# ADR-002: Select the minimum agentic stack

Status: proposed

Decision history: an earlier draft was marked accepted before an executable bake-off. That status was premature and has been reverted. Acceptance requires every hard gate below to pass with preserved evidence.

## Context

Career OS must run the same bounded agent team in a complete self-host and a managed multi-tenant SaaS. It needs durable artifacts, human approval, tenant budgets, exportable traces and strong isolation, without a second product or speculative services.

The formal comparison is in [agentic-stack-benchmark.md](agentic-stack-benchmark.md).

## Candidate decision by layer

- Agent runtime: OpenAI Agents SDK TS `0.17.0` is the current candidate; it beat Mastra core on dependency and glue surface while covering typed tools, handoffs, HITL, cancellation and bounded turns.
- Durability: PostgreSQL steps, leases, idempotency keys and atomic budget reserve/settle remain authoritative. Neither agent SDK is a durable exactly-once engine.
- Provider calls: Vercel AI SDK Core/direct providers remain the Apache-2.0 structured-call baseline. Vercel AI Gateway is a separate proprietary hosted option and is not selected.
- Observability: PostgreSQL audit records first; content-free OpenTelemetry only when needed. Private trace capture is off by default.
- Sandbox/extraction: pasted text first. No shell or network tool. Rootless browser workers are a later measured fallback.

The current implementation uses a deterministic fake provider. A network provider remains disabled unless explicitly enabled and supplied with output caps and pricing.

## Acceptance hard gates

1. No cross-tenant leakage through checkpoints, traces, caches or errors.
2. Kill/restart produces no duplicate artifact, cost or external effect.
3. Worst-case budget reservation stays atomic under 20 concurrent runs.
4. Unknown, restricted, unsupported and source-ineligible claims cannot publish.
5. Revision, handoff, turn, deadline and cancellation limits fail closed.
6. Prompt injection cannot widen tools, tenant scope or network access.
7. Tenant export/delete covers sessions, checkpoints and traces.
8. A server-minted, expiring private capability works in a fresh browser and remains revoked once revoked.

The bake-off proves bounded in-process behavior, not the gates above. Temporal and Trigger.dev are durability candidates, not direct substitutes for an agent SDK.

## Consequences

- No dependency decision is accepted yet.
- No Enterprise-licensed folder enters the dependency graph.
- The product owns a small explicit state machine, but not a generic agent framework.
- Hermes can later implement a self-host execution adapter only inside a dedicated whole-process sandbox. It cannot share tenants or replace Career Memory, budgets, provenance or gates.
- Trigger.dev `>=4.5.2` must be the minimum if reconsidered because older releases had a cross-tenant replay advisory.
- URL extraction stays pasted-text-first, then SSRF-safe HTTP, then a rootless Docker/Playwright fallback only when evidence justifies it.

## Re-evaluation gates

- Two active providers or real fallback routing: reconsider Envoy AI Gateway or a narrowly hardened proxy.
- Shared trace/eval debugging becomes routine: add optional Langfuse core.
- Re-run the SDK comparison when the agent topology or provider set materially changes.
- Arbitrary code execution becomes a product requirement: benchmark E2B against per-run rootless workers.
