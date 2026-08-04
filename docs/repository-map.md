# Repository Map

> Status: Current

## Repository structure

```text
OpenExcel/
|-- packages/
|   |-- core/       # Framework-free spreadsheet, Excel, chart, and tool contracts
|   |-- agent/      # Model/tool runtime without HTTP, database, or UI concerns
|   |-- server/     # Fastify API, Prisma, resource orchestration, and executors
|   `-- web/        # React/Vite browser application and editor interactions
|-- docs/           # Current facts, rules, designs, proposals, and history
|-- config/         # Repository-level configuration
`-- .data/          # Local database and file-storage runtime data
```

Do not edit `node_modules/`, `dist/`, or `packages/server/prisma/generated/`.

## Package dependency direction

The package manifests are the authority for workspace dependencies:

```text
packages/core      # Does not depend on another OpenExcel workspace package
packages/agent     # Does not depend on server, web, or core
packages/server -> @openexcel/agent, @openexcel/core
packages/web    -> @openexcel/core
```

The server invokes the Agent through injected tool definitions and execution
context. The Agent does not depend on the server. The browser communicates
with the server through HTTP and does not import server code.

## Code entrypoints

### Core

- `packages/core/src/index.ts`: stable public exports.
- `packages/core/src/excel/`: FortuneSheet data, styles, dates, and filters.
- `packages/core/src/importer/`: JSON, XLSX, XLS/CSV import, and XLSX safety checks.
- `packages/core/src/exporter/`: XLSX, template, and chart export.
- `packages/core/src/sheet-sync/`: Sheet commands, mutations, and snapshot application.
- `packages/core/src/sheetTools/`: model-facing reads, queries, object projections, and paging.
- `packages/core/src/chart/`: ChartSpec, references, dependencies, and chart commands.
- `packages/core/src/tools/`: Excel tool contracts and model catalog generation.
- `docs/current/color-tools.md`: current color/style data flow and code map.
- `docs/design/color-tools.md`: draft theme-aware color and AI style mutation design.

### Agent

- `packages/agent/src/index.ts`: public exports.
- `packages/agent/src/runtime/loop/`: AgentRunner, model/tool loop, and stream bridging.
- `packages/agent/src/runtime/events/`: event creation, ordering, and persistence barriers.
- `packages/agent/src/runtime/context/`: model context and compaction.
- `packages/agent/src/runtime/tools/`: generic tool adaptation, validation, and result budgets.
- `packages/agent/src/session/`: workspace context, transcripts, token, and window budgets.

### Server

- `packages/server/src/index.ts`: process entrypoint.
- `packages/server/src/app.ts`: Fastify composition, plugins, workers, and static files.
- `packages/server/src/config.ts`: environment and model configuration.
- `packages/server/src/infra/`: database, file storage, runtime paths, and logging.
- `packages/server/src/middleware/`: user resolution, request context, and resource access.
- `packages/server/src/modules/auth/`: registration, login, and session cookies.
- `packages/server/src/modules/workspaces/`: workspace catalog and authorization scope.
- `packages/server/src/modules/workbooks/`: workbook creation, import/export, and Sheet structure.
- `packages/server/src/modules/sheets/`: Sheet queries, commands, and AI tools.
- `packages/server/src/modules/charts/`: chart queries, mutations, persistence, and tools.
- `packages/server/src/modules/sessions/`: sessions, chat, Runs, events, recovery, undo, and titles.
- `packages/server/src/modules/assets/`: uploaded asset lifecycle and cleanup workers.

### Web

- `packages/web/src/main.tsx`: browser entrypoint.
- `packages/web/src/app/routes.tsx`: React Router routes and loaders.
- `packages/web/src/api/`: HTTP clients and response types.
- `packages/web/src/features/workspace/`: workspace and workbook catalog.
- `packages/web/src/features/session/`: session catalog and session shell.
- `packages/web/src/features/chat/`: chat transport, messages, tool results, and composer.
- `packages/web/src/features/workbook/`: FortuneSheet editor, Sheet navigation, and charts.
- `packages/web/src/features/sync/`: Sheet save queue, revisions, and synchronization scheduling.
- `packages/web/src/features/demos/`: isolated demo data and replay runtime.

## Recommended reading order

```text
User task -> docs/README.md -> nearest AGENTS.md -> current/ documentation
          -> package entrypoint and application code -> co-located tests
```

Routes, tool manifests, the Prisma schema, and package manifests are the
first-hand sources for their respective facts.
