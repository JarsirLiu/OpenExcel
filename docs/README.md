# OpenExcel Documentation

> Status: Current
>
> Runtime facts live under `current/`. Mandatory engineering behavior lives
> under `rules/`.

## Fast path for AI agents

1. Read this file and the [repository map](repository-map.md).
2. Read the relevant documents under `current/` and `rules/` for the task.
3. Read the nearest `AGENTS.md` for the files being changed.
4. Verify specific behavior against source code and tests. Do not treat design,
   proposal, or issue documents as current implementation.
5. Follow the [change workflow](rules/change-workflow.md) and update affected
   documentation when the implementation changes.

## Document categories

| Directory | Purpose | Read by default |
| --- | --- | --- |
| `current/` | Runtime facts verified by current code or tests | Yes |
| `rules/` | Engineering constraints that currently apply | Yes |
| `design/` | Discussed designs that are not fully implemented | No |
| `proposals/` | Future plans, roadmaps, and migrations | No |
| `issues/` | Problem records | No |

## Find documentation by task

| Task | Read first |
| --- | --- |
| Find a code entrypoint or package owner | [repository-map.md](repository-map.md) |
| Change package boundaries or cross-package data flow | [current/architecture.md](current/architecture.md), [rules/package-boundaries.md](rules/package-boundaries.md) |
| Change Agent execution, streaming, events, retries, or recovery | [current/agent-runtime.md](current/agent-runtime.md) and the relevant package `AGENTS.md` |
| Change Sheet writes, revisions, or synchronization | [current/spreadsheet-sync.md](current/spreadsheet-sync.md) |
| Change an AI tool | [current/tools.md](current/tools.md), [architecture/tools/README.md](architecture/tools/README.md) |
| Change an API, database model, or resource authorization | [current/api.md](current/api.md), [current/data-model.md](current/data-model.md), and `packages/server/AGENTS.md` |
| Change the Web editor, charts, or layout | [current/architecture.md](current/architecture.md), [rules/web-ui.md](rules/web-ui.md), and `packages/web/AGENTS.md` |
| Change user-visible copy, locale handling, or errors shown in Web | [current/i18n.md](current/i18n.md), [rules/i18n.md](rules/i18n.md), and `packages/web/AGENTS.md` |
| Change tests | [rules/testing.md](rules/testing.md) |
| Decide how to approach a change or apply developer preferences | [rules/agent-behavior.md](rules/agent-behavior.md) |

## Authority order

1. The user's current task and the applicable `AGENTS.md`.
2. Documents in `current/` marked as current implementation.
3. Engineering rules in `rules/`.
4. Source code and tests as evidence for specific behavior.
5. Non-current material in `design/`, `proposals/`, and `issues/`.

When documentation, source code, and tests disagree, use the implementation
as evidence. Never turn a future plan into a statement about the current
runtime.

## Current documentation

- [Repository map](repository-map.md)
- [Current architecture](current/architecture.md)
- [Current data model](current/data-model.md)
- [Current API](current/api.md)
- [Current Agent runtime](current/agent-runtime.md)
- [Current Sheet synchronization](current/spreadsheet-sync.md)
- [Current AI tools](current/tools.md)
- [Current internationalization](current/i18n.md)

## Engineering rules

- [Agent behavior and engineering judgment](rules/agent-behavior.md)
- [Package boundaries](rules/package-boundaries.md)
- [Testing](rules/testing.md)
- [Tool authoring](rules/tool-authoring.md)
- [Web and UI](rules/web-ui.md)
- [Internationalization](rules/i18n.md)
- [Change workflow](rules/change-workflow.md)

## Isolated material

Unfinished designs live under [design](design/) and [proposals](proposals/).
Problem records live under [issues](issues/). These directories are outside the
default AI context unless a task explicitly requires them.
