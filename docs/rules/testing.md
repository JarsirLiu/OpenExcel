# Testing Rules

> Status: Rule

## General conventions

- The test framework is Vitest.
- Test files use `*.test.ts` or `*.test.tsx`.
- Keep tests next to the source under test. Cross-module HTTP/E2E tests may live under the package `src/tests/`.
- Import `describe`, `it`, `expect`, and required mock APIs explicitly from `vitest`.
- Prefer hand-written mocks and `vi.fn()`. Use `vi.mock()` only when a module-level dependency cannot be injected.
- Restore `process.env` in environment-variable tests, or use `vi.stubEnv`/`vi.unstubEnv`.

## Package testing focus

- `core`: pure conversion, schemas, mutations, coordinates, import/export, and chart invariants.
- `agent`: prompts, context, transcripts, tokens, compaction, loop, events, and tool adapters.
- `server`: application services, route boundaries, repositories, Run/recovery, tool execution, and import/export.
- `web`: state ownership, stale requests, editor/chart interaction, synchronization queues, and rendering behavior.

## Commands

```bash
pnpm test
pnpm test:core
pnpm test:server
pnpm test:web
pnpm --filter @openexcel/agent test
pnpm typecheck
```

When changing shared contracts, package boundaries, or runtime flow, run the
affected package tests and `pnpm typecheck` at minimum. For cross-package
changes, run the complete test suite. Web layout or editor changes also need
manual checks at desktop and mobile widths.
