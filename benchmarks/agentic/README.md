# Agentic bake-off

This package is intentionally outside the production application dependency graph. It compares exact agent SDK releases against one deterministic Career OS contract without provider calls.

```bash
npm ci
npm run check
```

The runner blocks `fetch`, HTTP(S) and TCP connection APIs before dynamically loading either SDK. Model responses are scripted in memory. Results are written to `results/latest.json`; no cloud account, model key or paid service is used.
