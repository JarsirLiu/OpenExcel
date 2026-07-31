# Optional performance benchmarks

These benchmarks are intentionally separate from the normal test and CI
commands. They measure the current cost of Sheet mutation, preview creation,
and snapshot serialization at different sparse-sheet sizes.

Run them one package at a time:

```bash
pnpm --filter @openexcel/core bench
pnpm --filter @openexcel/server bench
```

The first pass uses 100,000, 500,000, and 1,000,000 cells. The Core benchmark
uses Vitest's benchmark runner; the Server preview benchmark uses explicit
`performance.now()` samples and reports RSS changes because large-object
results were not reliable in the Vitest runner. Run the benchmarks in a
constrained environment before using their timings as a server estimate.
The benchmark does not modify the application database and does not require
Docker.

The later HTTP/SQLite load test should be added here after the Docker resource
limits and a disposable database setup are agreed. It must remain a manual
command and must not be included in `pnpm test`, `pnpm check`, or default CI.
