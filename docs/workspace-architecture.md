# Workspace Architecture Specification

This document defines the long-term boundary for OpenExcel workspaces. It is the source of truth for how a workspace, workbook, sheet, session, and chat must relate to each other.

## Goal

One workspace contains one active Excel workbook and the conversations that belong to it. All workbook edits, chat context, reference suggestions, undo actions, and tool execution must stay inside the active workspace.

## Hard Rules

1. A workspace is a first-class entity.
2. Every session belongs to exactly one workspace.
3. Every workbook belongs to exactly one workspace.
4. Every sheet belongs to exactly one workbook, and therefore one workspace.
5. No API, tool, or UI flow may read, create, delete, or update data across workspaces.
6. Chat context must only include sheets from the active workspace.
7. Reference candidates must only include workbooks and sheets from the active workspace.
8. Cache keys on the client must be scoped by `workspaceId`.

## Recommended Domain Model

- `Workspace`: top-level container for the user’s working area.
- `Workbook`: the spreadsheet attached to the workspace.
- `Sheet`: editable worksheet data inside the workbook.
- `Session`: conversation history for the workspace.
- `AgentRun`: one chat execution.
- `AgentStep`: reasoning, tool call, tool result, or final output within a run.

For the current product shape, it is acceptable to start as “one workspace, one workbook”, but the schema should still allow multiple workspaces.

## Recommended Directory Layout

Use a directory structure that makes workspace ownership visible:

```text
packages/
├── server/
│   └── src/
│       ├── infra/
│       ├── middleware/
│       ├── modules/
│       │   ├── workspaces/
│       │   │   ├── routes.ts
│       │   │   ├── service.ts
│       │   │   ├── repository.ts
│       │   │   └── query.ts
│       │   ├── workbooks/
│       │   │   ├── routes.ts
│       │   │   ├── service.ts
│       │   │   ├── repository.ts
│       │   │   └── query.ts
│       │   ├── sheets/
│       │   └── sessions/
│       └── shared/
├── web/
│   └── src/
│       ├── app/
│       ├── api/
│       └── features/
│           ├── workspace/
│           ├── workbook/
│           ├── session/
│           └── chat/
├── core/
└── agent/
```

### Directory Rules

- `modules/workspaces` owns workspace creation, loading, membership, and scope checks.
- `modules/workbooks` owns workbook structure inside one workspace.
- `modules/sheets` owns sheet content mutations only.
- `modules/sessions` owns chat, run history, title generation, and undo coordination.
- `web/features/workspace` owns the workspace shell and workspace switching.
- `web/features/workbook` owns workbook and sheet UI.
- `web/features/session` owns the session list and session-scoped actions.
- `web/features/chat` owns the chat composer, transcript, and reference UI.

## API Boundary

Prefer workspace-scoped endpoints for all workspace-owned data:

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/:workspaceId`
- `GET /api/workspaces/:workspaceId/workbooks`
- `POST /api/workspaces/:workspaceId/workbooks`
- `GET /api/workspaces/:workspaceId/workbooks/reference-candidates`
- `GET /api/workspaces/:workspaceId/sessions`

Session-specific actions may still use session routes, but the server must resolve and verify the session’s `workspaceId` before doing any work:

- `POST /api/workspaces/:workspaceId/sessions/:sessionId/chat`
- `POST /api/workspaces/:workspaceId/sessions/:sessionId/title`
- `POST /api/workspaces/:workspaceId/sessions/:sessionId/runs/undo-latest`

Any workbook or sheet mutation must verify that the target record belongs to the active workspace before proceeding.

Workspace creation is a provisioning flow. A new workspace should create its first workbook, first sheet, and a starter session together in one transaction.

## Server Responsibilities

- Load the workspace first.
- Resolve the workspace from session or workbook before chat execution.
- Build chat context from the active workspace only.
- Load workbook/sheet reference data from the active workspace only.
- Reject cross-workspace access with a clear 404 or 403.
- Keep routes thin; put ownership checks in service helpers or repository guards.

## Frontend Responsibilities

- Load one active workspace as the shell for the page.
- Render chat, workbook, and reference UI from that workspace only.
- Invalidate caches per `workspaceId`.
- Never reuse workbook or reference data from another workspace.
- Treat workspace switching as a full scope switch, not a visual toggle.

## Data Flow

1. User opens a workspace.
2. Frontend loads the workspace-scoped workbook and sessions.
3. Chat composer requests reference candidates for that workspace only.
4. Chat runs resolve the session’s workspace before building model context.
5. Workbook and sheet updates stay inside the same workspace.
6. Undo restores snapshots only for that workspace.

## Migration Order

1. Add a `Workspace` table and `workspaceId` foreign keys.
2. Scope `Workbook`, `Sheet`, and `Session` by workspace.
3. Add workspace-scoped queries and routes.
4. Make chat context and reference candidates workspace-aware.
5. Update the web shell to load and cache by workspace.
6. Remove any remaining global workbook/session queries.
7. Remove any silent current-workspace fallbacks and default workspace IDs.

## Definition of Done

The architecture is correct only when:

- opening a workspace never shows another workspace’s workbook, sheets, or sessions
- chat can only reference sheets from the active workspace
- workbook delete/create/update cannot affect another workspace
- reference suggestions are workspace-local
- undo and tool execution are workspace-local
- the server rejects any cross-workspace record access
