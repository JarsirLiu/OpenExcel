# Current API

> Status: Current
>
> Source: route modules under `packages/server/src/modules/*/api/routes.ts`.
> Request schemas and response details belong to those files; this page is an
> endpoint map, not a second API specification.

All resource APIs are under `/api`. Except for authentication entrypoints,
resource access is checked against the current user and workspace scope. Chat
uses `application/x-ndjson`, not SSE.

## Health and authentication

```text
GET  /api/health
GET  /api/auth/me
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/logout-all
```

## Workspaces

```text
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:publicId
PATCH  /api/workspaces/:publicId
DELETE /api/workspaces/:publicId
```

## Workbook and Sheet structure

```text
GET    /api/workspaces/:workspacePublicId/workbooks
POST   /api/workspaces/:workspacePublicId/workbooks
GET    /api/workspaces/:workspacePublicId/workbooks/reference-candidates
GET    /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId
GET    /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/structure
PATCH  /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId
POST   /api/workspaces/:workspacePublicId/workbooks/import
POST   /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/sheets
DELETE /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/sheets/:sheetId
DELETE /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId
GET    /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/template
```

The workbook import endpoint can return HTTP 201 while reporting optional
features that were detected but are not modeled by the editor. Each uploaded
workbook may include `warnings` with a stable `feature` and `count`; these
warnings do not prevent sheet and supported-object import. Structural XLSX
errors and safety-limit violations still return an error response.

## Sheet content

```text
GET   /api/workspaces/:workspacePublicId/sheets/:sheetId
PATCH /api/workspaces/:workspacePublicId/sheets/:sheetId
PATCH /api/workspaces/:workspacePublicId/sheets/:sheetId/name
```

The Sheet content PATCH accepts a `SheetCommand`. A successful response
returns the command result; it does not return a complete snapshot to the
browser.

## Charts

```text
GET    /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/charts
POST   /api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/charts
PATCH  /api/workspaces/:workspacePublicId/charts/:chartId
DELETE /api/workspaces/:workspacePublicId/charts/:chartId
```

## Sessions, Runs, and chat

```text
GET    /api/workspaces/:workspacePublicId/sessions
POST   /api/workspaces/:workspacePublicId/sessions
DELETE /api/workspaces/:workspacePublicId/sessions/:sessionPublicId
PATCH  /api/workspaces/:workspacePublicId/sessions/:sessionPublicId
GET    /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/messages
GET    /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/context-usage
POST   /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/cancel
POST   /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/recover
DELETE /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId
POST   /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/undo-latest
POST   /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/title
POST   /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/chat
```

Chat responses include `X-OpenExcel-Run-Id` and one JSON Agent event per line.
The Web parser is at `packages/web/src/features/chat/transport/chatEventStream.ts`.
