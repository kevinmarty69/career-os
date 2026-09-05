# MVP performance baseline

Run the complete local load gate with:

```bash
pnpm test:load
```

It combines the synthetic collection, matching and agent-orchestration benchmark with PostgreSQL discovery and durable-step concurrency checks. Run only the dependency-free synthetic benchmark with:

```bash
pnpm benchmark:mvp
```

It exercises the real Greenhouse parser and hard-match contract on 1,000 fictitious jobs, then runs 100 concurrent in-memory agent-team workflows through research, evidence selection, strategy, composition and three reviews.

This is a local CPU and contract baseline, not a production capacity claim. It does not include PostgreSQL leases, network latency, remote model throughput or provider pricing. `costMicros: 0` means the local fake provider is unpriced, not free.

The command fails if records are lost, workflows do not reach human approval, or either tranche exceeds ten seconds. Provider failure modes and budget rejection remain covered by the focused unit and integration suites.

## Local reference run

Measured on 5 September 2026 with Node.js 24.19.0 on arm64 macOS:

| Workload                           |        Volume |    Total |      p50 |      p95 |
| ---------------------------------- | ------------: | -------: | -------: | -------: |
| Greenhouse parsing + hard matching |    1,000 jobs | 64.38 ms |        - |        - |
| In-memory agent orchestration      | 100 workflows | 17.61 ms | 14.29 ms | 15.46 ms |

The agent run produced 3,700 audit events and reported 44,000 input plus 22,000 output tokens. Those tokens are synthetic accounting from the fake provider; no model request or paid service was used.

The PostgreSQL discovery concurrency check can also be run separately:

```bash
pnpm test:integration:discovery-concurrency
```

It runs four real database workers against 24 due profiles. The reference run completed in 24 ms at 1,005 claims/s with zero duplicate claims, recovered one expired lease and rejected its stale completion token. The full gate also verifies durable agent-step claims, lease recovery and idempotent completion against PostgreSQL. This verifies local throughput and concurrency correctness, not end-to-end ATS or remote model capacity.
