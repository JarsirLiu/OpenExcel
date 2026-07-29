# Core Package Notes

`packages/core` is the framework-free spreadsheet and Excel domain package.
Read these documents before editing it:

- [Documentation entrypoint](../../docs/README.md)
- [Current architecture](../../docs/current/architecture.md)
- [Current Sheet synchronization](../../docs/current/spreadsheet-sync.md)
- [Current AI tools](../../docs/current/tools.md)
- [Package boundary rules](../../docs/rules/package-boundaries.md)
- [Testing rules](../../docs/rules/testing.md)

## Current ownership

- FortuneSheet data, styles, dates, filters, and coordinate conversion
- XLSX/XLS/CSV/JSON import and XLSX export
- Sheet mutations, command schemas, and snapshot transformations
- ChartSpec, chart references, dependencies, commands, and import/export mappings
- Canonical AI tool contracts, schemas, and model catalog generation

## Current restrictions

- Do not import React, Fastify, Prisma, HTTP, or model providers.
- Do not perform database writes, user authorization, or concrete Server tool execution in Core.
- Do not create a second conversion rule for the same coordinate, style, date, chart, or formula semantics.
- Do not treat Web ECharts options or FortuneSheet instances as persisted domain models.

## Public API and tests

`src/index.ts` is the public export boundary. Do not expand it without a real
caller. Changes to exports, schemas, import/export behavior, mutations, or
chart invariants require co-located tests.

Common commands:

```bash
pnpm --filter @openexcel/core test
pnpm --filter @openexcel/core typecheck
```
