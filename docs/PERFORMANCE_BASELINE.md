# MVP performance baseline

Run the dependency-free synthetic benchmark with:

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
| Greenhouse parsing + hard matching |    1,000 jobs | 67.39 ms |        - |        - |
| In-memory agent orchestration      | 100 workflows | 16.00 ms | 12.94 ms | 14.02 ms |

The agent run produced 3,700 audit events and reported 44,000 input plus 22,000 output tokens. Those tokens are synthetic accounting from the fake provider; no model request or paid service was used.

The PostgreSQL concurrency check is separate:

```bash
pnpm test:integration:discovery-concurrency
```

It runs four real database workers against 24 due profiles. The reference run completed with zero duplicate claims, recovered one expired lease and rejected its stale completion token. This verifies lease correctness, not end-to-end ATS or model capacity.
