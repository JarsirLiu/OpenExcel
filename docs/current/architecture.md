# Current Architecture

> Status: Current
>
> Evidence: package manifests, package entrypoints, server composition in
> `packages/server/src/app.ts`, and current tests.

## System shape

OpenExcel is a pnpm monorepo with four packages: a React/Vite Web app, a
Fastify Server, a framework-free Core package, and a headless Agent runtime.
The browser reaches the Server through HTTP APIs and an NDJSON event stream.
The Server owns authorization, persistence, concrete tool execution, and run
orchestration. The Agent owns model calls and the generic Agent loop. Core
provides spreadsheet and Excel domain behavior.

## Current responsibilities

| Package | Owns | Does not own |
| --- | --- | --- |
| `@openexcel/core` | Excel import/export, FortuneSheet conversion, Sheet mutations, chart models, and AI tool contracts | HTTP, React, Prisma, or model calls |
| `@openexcel/agent` | Model factory, system prompts, context, transcripts, Agent loop, events, retries, compaction, and tool adaptation | HTTP, Prisma, concrete workbook writes, or UI |
| `@openexcel/server` | Fastify routes, user/workspace authorization, Prisma, sessions/Runs, chat streams, concrete tool execution, and import/export orchestration | React, Excel conversion rules, or Agent loop semantics |
| `@openexcel/web` | Routes, API clients, workspace, sessions, chat, editor, charts, and local UI state | Prisma, Agent loop, server persistence, or Excel domain rules |

## Runtime data flow

### Workbooks and Sheets

```text
Web API client -> Server resource access -> application service
  -> repository / Prisma -> serialized workbook or Sheet snapshot
  -> Web workbook document / FortuneSheet adapter
```

The Server passes uploaded Excel files to Core for import and stores the raw
file as an `UploadAsset`. Structured workbook and Sheet data is persisted in
the database. The Server calls Core to generate XLSX exports.

### Chat and Agent Runs

```text
Web chat request -> Server session route -> session/run lease
  -> canonical user turn -> @openexcel/agent AgentRunner
  -> Server concrete tool executor -> persisted events and finalization
  -> NDJSON reader in Web
```

Disconnecting the browser only cancels that event-stream subscription. A Run
is cancelled through the explicit cancel API and the Agent abort signal.

## Domain ownership

- A Workspace organizes the Workbooks and Sessions a user can access.
- A Workbook owns its Sheet collection, order, source assets, and Chart collection.
- A Sheet owns its cell snapshot, merges, configuration, revision, and mutation receipts.
- A Chart is persisted as Core's `ChartSpec`; the Web ECharts configuration is not the source of truth.
- A Session owns the message catalog and Agent Runs. A Run owns steps, events, tool executions, checkpoints, and undo snapshots.
- Session title generation is a separate Server session-application capability, not an Agent-loop responsibility.

## Server module boundaries

`modules/*/api` handles HTTP input and output. `application` coordinates use
cases. `domain` defines domain contracts and expected errors. `infrastructure`
handles Prisma and storage. `tools` exposes concrete use cases to the Agent.
`middleware` resolves the current user and workspace/resource scope. `infra`
contains technical integrations.

Some historical compatibility code remains, but new features should follow
these boundaries and keep business rules out of route handlers.

## Outside the current architecture

Target directories, migration phases, unimplemented multi-instance designs,
and future object models do not belong in this document. They must be explicitly
kept under `docs/design/` or `docs/proposals/` and must not be used as evidence
for current implementation.
