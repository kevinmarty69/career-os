# ADR-001: Career OS owns orchestration

Status: accepted, amended 2026-09-05

## Decision

Career OS owns the durable workflow, artifact ledger, budgets, provenance, tool policies and human gates. The first vertical uses deterministic TypeScript workers behind typed inputs and outputs. A model API becomes the first execution runtime when generation is connected. Hermes remains an experimental, whole-process-sandboxed self-host runtime, never the shared cloud control plane. ADR-002 governs dependency selection after the formal stack benchmark.

This is one product with two operating contracts. Self-hosters connect and operate their own compatible model endpoint; the open-source distribution supplies no Career OS provider account, paid inference or managed provider connection. The managed cloud supplies the model, isolated execution and server-side quotas without asking users for API keys. Career Memory in PostgreSQL remains authoritative in both modes.

The managed cloud may expose that same control plane through a remote OAuth-protected MCP server for ChatGPT, Codex and Claude. MCP is an interface, not a model-billing bypass: a Career OS workflow invoked through MCP still consumes the tenant's managed Career OS quota.

## Options considered

| Option                                         | Multi-tenancy and isolation                                                                                                      | Resume and observability                                                                                                           | Cost control                                                                   | Self-host                               | Maturity for this product                                                                | Decision                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| Internal state machine + structured model APIs | Tenant/RLS and per-run sandbox are ours to enforce                                                                               | Exact event/artifact ledger, idempotent steps                                                                                      | Gateway meters every call                                                      | BYOK/local OpenAI-compatible endpoint   | Smallest production boundary; durable runner still needed when calls become async        | Start here                 |
| Embedded Hermes                                | Official security policy calls it a single-tenant personal agent; safe use with untrusted input requires whole-process isolation | Recent Kanban supports durable multi-profile work, recovery and artifacts, but its lifecycle and memory are not our product ledger | Provider/model flexibility, but quota enforcement still belongs outside Hermes | Excellent fit for advanced self-hosters | Fast-moving; default local backend is unsafe for untrusted content and shared deployment | Experimental adapter later |
| Durable workflow engine + specialized agents   | Per-run isolation can be a first-class execution-plane contract                                                                  | Best pause/resume/retry semantics                                                                                                  | Natural time/token/cost/concurrency budgets                                    | Adds an operational service             | Appropriate when multi-day callbacks/replay exceed the Postgres worker                   | Add Temporal then          |

## Evidence checked

- [Hermes security policy](https://github.com/NousResearch/hermes-agent/security) states that Hermes is single-tenant, OS isolation is the security boundary, and whole-process wrapping is the supported posture for untrusted inputs or shared/production deployments.
- [Hermes documentation](https://hermes-agent.nousresearch.com/docs/) now documents named Bots, persistent memory, multiple providers/local models, isolated subagents and several container/cloud terminal backends.
- [Multi-agent umbrella issue #344](https://github.com/NousResearch/hermes-agent/issues/344) describes the gap between delegation and full resilient orchestration. Its discussion shows active Kanban-based progress, while formal DAG/live cooperation remains broader than the current core.
- [Profile orchestration issue #18420](https://github.com/NousResearch/hermes-agent/issues/18420) was closed in July 2026 after durable Kanban multi-profile dispatch, recovery and artifact metadata landed. This improves Hermes materially, but does not change its single-tenant trust model.

## Bounded agent team

| Role                 | Minimum context                        | Tools                         | Output                           | Authority                                     |
| -------------------- | -------------------------------------- | ----------------------------- | -------------------------------- | --------------------------------------------- |
| Evidence Archivist   | One source plus existing IDs           | parser, private storage write | source/evidence/claim candidates | Cannot mark verified or publish               |
| Company Researcher   | Offer and allow-listed public URLs     | SSRF-safe fetch/search        | sourced company brief            | Cannot write Career Memory claims             |
| Recruiter Strategist | Offer plus eligible claim summaries    | model only                    | strategy artifact                | Selects, never invents claims                 |
| Hiring Manager       | Strategy, PageSpec and evidence links  | read-only ledger              | structured review issues         | Can fail sections, cannot revise              |
| Page Composer        | Strategy plus failed section issues    | model only                    | strict PageSpec JSON             | One PageSpec/run; three child corrections max |
| Fact Checker         | PageSpec, claims, evidence, provenance | read-only ledger              | structured factual issues        | Can block publication                         |

Agents never chat freely. Each run reads versioned artifacts and writes a schema-validated artifact or review issue. A run owns exactly one immutable PageSpec. A supported targeted correction creates a child run that reuses the same profile snapshot, opportunity and approved research/evidence/strategy input; only Page Composer and the three reviewers run again. `revision_count` is the child-correction depth (`0..3`), so a lineage can contain the initial PageSpec plus at most three corrected PageSpecs, never three internal versions in one run. Afterward, the human may explicitly keep a recruiter or hiring-manager objection or correct its exact failed section. Factual objections must pass and cannot be overridden. Publication still requires explicit human approval.

## Control plane / execution plane

The control plane is Next.js plus PostgreSQL: identities, RLS, workflow state, budgets, artifacts, events, approvals, publications and model-usage records. The execution plane receives one scoped job, temporary credentials and an egress allow-list. Cloud execution must use a fresh container or sandbox per run (or stronger tenant boundary), no host shell, non-root user, read-only base filesystem, explicit mounts, wall-clock/token/cost/concurrency limits, interruption and resumable idempotency keys.

The model gateway is server-side and records tenant, run, role, provider/model, input/output tokens, cost, latency and cache hit before allowing another call. UI counters are informational; the gateway and workflow transaction enforce limits.

No `AgentRuntime` interface exists yet: only the deterministic implementation is real. Add the interface when the direct structured-API runtime lands; the second implementation must be either a tested fake used for contract tests or the sandboxed Hermes adapter.
