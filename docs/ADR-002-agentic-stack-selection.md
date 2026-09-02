# ADR-002: Select the minimum agentic stack

Status: accepted, 2026-09-02

## Context

Career OS must run the same bounded agent team in a complete self-host and a managed multi-tenant SaaS. It needs durable artifacts, human approval, tenant budgets, exportable traces and strong isolation, without a second product or speculative services.

The formal comparison is in [agentic-stack-benchmark.md](agentic-stack-benchmark.md).

## Decision

Use the existing TypeScript application, Zod schemas and PostgreSQL state/event/artifact ledger. Do not add an agent framework, durable-workflow service, model proxy, trace dashboard, browser service or sandbox dependency in v0.1.

When the first model call lands:

1. use one official TypeScript provider SDK with Structured Outputs;
2. reserve and settle hard tenant budgets in PostgreSQL around the call;
3. expose an optional OpenTelemetry exporter with content capture off;
4. keep model calls as bounded step executors, never the workflow authority.

The first asynchronous worker claims idempotent PostgreSQL steps. Adopt Temporal only when real multi-day callbacks, retries across deploys or replay make the simpler worker measurably inadequate.

## Consequences

- Self-host and cloud keep identical workflow semantics.
- No Enterprise-licensed folder enters the dependency graph.
- The product owns a small explicit state machine, but not a generic agent framework.
- Hermes can later implement a self-host execution adapter only inside a dedicated whole-process sandbox. It cannot share tenants or replace Career Memory, budgets, provenance or gates.
- Trigger.dev is not the OSS foundation while documented checkpoint behavior differs between cloud and self-host.
- URL extraction stays pasted-text-first, then SSRF-safe HTTP, then a rootless Docker/Playwright fallback only when evidence justifies it.

## Re-evaluation gates

- Two active providers or real fallback routing: reconsider Envoy AI Gateway or a narrowly hardened proxy.
- Shared trace/eval debugging becomes routine: add optional Langfuse core.
- Tool approvals/handoffs exceed direct structured calls: benchmark OpenAI Agents SDK TS and Mastra core against the concrete flow.
- Arbitrary code execution becomes a product requirement: benchmark E2B against per-run rootless workers.
