# Current Data Model

> Status: Current
>
> Source: `packages/server/prisma/schema.prisma`. The Prisma schema is the
> authority for fields, relations, indexes, and provider-specific details.

## Persistent objects

| Object | Purpose | Main relationships |
| --- | --- | --- |
| `User` | Login identity | Owns `Workspace` and `AuthSession` |
| `AuthSession` | Server session represented by a cookie | Belongs to `User`; can be revoked or expire |
| `Workspace` | User resource boundary | Owns `Workbook`, `UploadAsset`, and `Session` |
| `UploadAsset` | Original upload metadata and lifecycle | May be referenced by a `Workbook`; file content lives in storage |
| `Workbook` | Workbook container | Belongs to `Workspace`; owns `Sheet` and `Chart` |
| `Sheet` | Editable spreadsheet surface | Belongs to `Workbook`; has a revision and mutation receipts |
| `SheetMutationReceipt` | Idempotency receipt for a Sheet command | Belongs to `Sheet`; unique by `mutationId` |
| `Chart` | Persisted chart definition | Belongs to a `Workbook` and its host `Sheet` |
| `ChartMutationReceipt` | Idempotency receipt for a chart mutation | Unique by `mutationId` |
| `Session` | Session catalog and chat container | Belongs to `Workspace`; may reference the active `Sheet` |
| `AgentRun` | One model/tool execution | Belongs to `Session`; contains steps, events, tools, and snapshots |
| `AgentRunCheckpoint` | Run and context checkpoint | One-to-one with `AgentRun` |
| `AgentStep` | Observable Run step | Belongs to `AgentRun` |
| `AgentEvent` | Ordered, persistable event | Belongs to `AgentRun`; unique by event id |
| `AgentToolExecution` | Concrete tool execution state | Belongs to `AgentRun` |
| `AgentRunSheetSnapshot` | Sheet snapshot for undo/recovery | Belongs to an `AgentRun` |
| `AgentRunChartSnapshot` | Chart snapshot for undo/recovery | Belongs to an `AgentRun` |
| `AgentRunChartSnapshotSheet` | Sheet involved in a chart snapshot | Belongs to a chart snapshot |

## Resource scope

The current user is resolved from a cookie. Workspace, workbook, and session
resources are then resolved from their public IDs. Server repository queries
must include workspace scope; internal auto-increment IDs are not an
authorization boundary.

## Database and files

- The supported database providers are SQLite and PostgreSQL. The default local database is selected by `DATABASE_PROVIDER` and `DATABASE_URL`; development defaults to SQLite.
- SQLite is intended for local or single-process deployments. The server serializes its application-owned SQLite writes in process and configures WAL, busy timeout, and bounded transaction waits. This is not a cross-process lock.
- PostgreSQL is the supported multi-user and multi-instance deployment database; its database transactions and run-lease compare-and-set operations provide cross-instance coordination.
- Prisma schema changes require an explicit migration. Do not use runtime `db push`.
- `UploadAsset.storageKey` points to local storage or the configured storage adapter.
- Local default data lives under `.data/`; Docker uses a persistent volume.
- The generated Prisma client is under `packages/server/prisma/generated/`; do not edit it manually.
