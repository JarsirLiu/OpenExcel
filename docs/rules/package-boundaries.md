# Package Boundary Rules

> Status: Rule

## Dependency direction

- `core` does not depend on `agent`, `server`, or `web`.
- `agent` does not depend on HTTP, Fastify, Prisma, React, or concrete storage.
- `server` may depend on `agent` and `core`, but must not reimplement the Agent loop or Excel conversion.
- `web` communicates with the Server through the API and does not import server internals.

## Where new code belongs

- Pure spreadsheet/Excel behavior, chart models, coordinate conversion, and schemas: `core`.
- Model calls, prompts, transcripts, context, retries, compaction, and generic tool adaptation: `agent`.
- Routes, authorization, databases, file storage, concrete tool execution, Run orchestration, and session orchestration: `server`.
- React, browser events, API clients, editors, layout, message presentation, and local UI state: `web`.

## Server layers

- `api`: parse input, call application services, and map errors to HTTP.
- `application`: coordinate one use case or a tightly related group of use cases.
- `domain`: define domain contracts and expected errors.
- `infrastructure`: adapt Prisma, file storage, and external technologies.
- `tools`: adapt concrete AI tool input/output without copying domain rules.
- `middleware`: resolve users, resource scope, and request context.

Do not put business rules back into routes. Repositories must not construct
HTTP responses.

## Web state

Each data source must have one authoritative state owner. Keep workbook
documents, chat/session state, layout state, and editor view models separate.
Do not hide a broken mutation or layout boundary behind a full reload.
