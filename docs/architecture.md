# OpenExcel Architecture

> This document defines the long-term architecture of OpenExcel.
> It is the source of truth for package boundaries, ownership, and data flow.

## 1. Goals

OpenExcel is a spreadsheet workbench with AI-assisted conversation. The project must support:

- Excel workbook editing
- AI chat with spreadsheet tools
- Independent session management
- Session title generation as a separate capability
- Stable streaming UX
- Future expansion to more tools, more session types, and more execution modes

The architecture must optimize for:

- Low coupling between chat and workbook UI
- High cohesion inside each package
- Clear ownership of state and side effects
- Compatibility with chat/completions style models
- Incremental evolution without rewriting the whole app

## 2. Core Principles

### 2.1 Core logic stays pure

All spreadsheet transformations, delta handling, import/export logic, and schema conversion belong in `packages/core`.

This package must not know about:

- HTTP
- React
- Database
- SSE or WebSocket
- AI model providers

### 2.2 Agent logic is headless

Agent execution, session context, compaction, and tool registry belong to an agent layer.

This layer must not know about:

- UI component trees
- React state
- DOM events
- Presentation details

Session title generation is a session API/service concern in `packages/server`, not an agent concern.

### 2.3 Server is an adapter

`packages/server` owns API routing, persistence, auth, and streaming transport.

The server should coordinate services, not hold application logic in route handlers.

### 2.4 Web is a composition layer

`packages/web` owns layout, feature composition, and user interaction.

UI components should be thin. They should render state and dispatch actions, not embed workflow logic.

The web layer is also the main stability boundary for user experience.
It must make cross-feature interference visible and prevent it by design.

### 2.5 Session title is independent from chat

Title generation must be a separate API and a separate service path.

It must not:

- block chat streaming
- be hidden inside the chat completion flow
- depend on SSE completion order
- force the chat request to wait for title generation

If title generation fails, the fallback title is the first user message, truncated to a short length.

### 2.6 Use chat/completions compatibility only

The model integration must stay compatible with chat/completions style providers.

Do not switch the project to the OpenAI `responses` protocol unless the provider layer is explicitly redesigned for it.

## 3. Target Package Layout

The long-term package layout should look like this:

```text
packages/
├── core/          # Excel core library, stable and framework-free
├── agent/         # AI agent runtime, sessions, tools, compaction
│   ├── session/   # session storage and history
│   ├── compaction/# context compression
│   ├── tools/     # Excel tool definitions
│   └── runtime/   # execution environment abstraction
├── server/        # API layer, persistence, auth, streaming transport
└── web/           # front-end, layout, feature composition, local UI state
```

### 3.1 `packages/core`

Responsibilities:

- Convert Excel formats and internal grid data
- Normalize sheet deltas
- Parse workbook metadata
- Export and import workbook contents
- Provide shared types and validation helpers

### 3.2 `packages/agent`

This package is the ideal long-term home for AI behavior.

Responsibilities:

- Session model and session context assembly
- Tool registry for spreadsheet actions
- Agent execution loop
- Context compaction
- Runtime abstraction for future environments

### 3.3 `packages/server`

Responsibilities:

- REST endpoints
- SSE or streaming transport
- Database persistence
- Session, run, and step records
- Workbook and sheet persistence
- Session title generation
- Authentication, if needed

Server code may depend on `agent`, but should not duplicate agent logic.

#### 3.3.1 Recommended server directory layout

```text
packages/server/src/
├── app.ts                 # Fastify bootstrap and plugin registration
├── index.ts               # process entrypoint
├── config.ts              # env parsing and runtime config
├── db.ts                  # Prisma client and DB wiring
├── logger.ts              # request logging and server logging helpers
├── shared/                # server-wide shared helpers
│   ├── errors/            # typed errors, error mapping, error helpers
│   ├── http/              # response helpers, route adapters, stream helpers
│   ├── auth/             # auth primitives shared by modules
│   ├── validation/       # request schema helpers and parsing
│   └── utils/            # generic utilities that do not belong to a module
├── infra/                 # technical integrations used by modules
│   ├── ai/               # model config, provider adapters, title model setup
│   ├── auth/             # password hashing, token/session cookie, OAuth hooks
│   ├── storage/          # file/blob helpers if we add local or remote storage
│   ├── streaming/        # SSE / response piping primitives
│   └── observability/    # metrics, tracing, structured logging glue
├── middleware/           # request-scoped middleware and guards
│   ├── auth.ts           # populate current user / session principal
│   ├── requireAuth.ts    # enforce signed-in access
│   ├── requireRole.ts    # workspace/admin role checks
│   └── requestContext.ts # request id, actor id, tenant id attachment
├── modules/              # business modules, split by domain
│   ├── auth/
│   │   ├── routes.ts     # login/logout/session refresh endpoints
│   │   ├── service.ts    # auth flows and session issuance
│   │   ├── repository.ts # user/session/token persistence
│   │   ├── policy.ts     # password, MFA, lockout, invitation rules
│   │   ├── dto.ts        # request/response shapes
│   │   └── types.ts      # auth module types
│   ├── users/
│   │   ├── routes.ts     # user profile and admin user endpoints
│   │   ├── service.ts    # profile, status, account lifecycle
│   │   ├── repository.ts # user persistence
│   │   └── types.ts
│   ├── workspaces/
│   │   ├── routes.ts     # future org/workspace boundaries
│   │   ├── service.ts    # workspace creation, membership, tenant scoping
│   │   ├── repository.ts # workspace and membership persistence
│   │   └── types.ts
│   ├── sessions/
│   │   ├── routes.ts     # session CRUD, chat, title, undo endpoints
│   │   ├── service.ts    # session orchestration and use-case composition
│   │   ├── query.ts      # session read models and list/detail queries
│   │   ├── transcript.ts # stored message history read/write
│   │   ├── title.ts      # title generation and fallback handling
│   │   ├── undo.ts       # undo-latest logic
│   │   ├── repository.ts # session/run/step persistence
│   │   └── types.ts      # session domain DTOs and contracts
│   ├── runs/
│   │   ├── repository.ts # run and step persistence helpers
│   │   └── types.ts
│   ├── workbooks/
│   │   ├── routes.ts     # workbook upload, export, create, delete endpoints
│   │   ├── service.ts    # workbook import/export and workbook-level use cases
│   │   ├── repository.ts # workbook persistence
│   │   └── types.ts
│   └── sheets/
│       ├── routes.ts     # sheet CRUD and patch endpoints
│       ├── service.ts    # sheet update/delete orchestration
│       ├── repository.ts # sheet persistence
│       └── types.ts
└── tests/                # cross-module integration tests and HTTP tests
```

This tree is intentionally more explicit than the current codebase.
It is meant to support future multi-user, workspace scoping, auth, and role checks without forcing a redesign later.

The important long-term rule is:

- `modules/*` own business use cases
- `middleware/*` own request-scoped security and context
- `infra/*` own technical integrations
- `shared/*` only contains cross-cutting helpers that do not belong to a specific module

For multi-user support, the ownership chain should become:

- user
- workspace or tenant
- session
- run
- step

That means the server should eventually treat `workspaceId` and `ownerUserId` as first-class scoping fields on session/workbook records, not as ad hoc filters added later.

### 3.4 `packages/web`

Responsibilities:

- Page shell and routing
- Workbook workspace UI
- Chat UI
- Session list UI
- Import preview dialogs
- Local interaction state

The web package should not own business rules such as:

- how a title is generated
- how a run is persisted
- how tool output is parsed for storage
- how sheet deltas are normalized

## 4. Domain Model

### 4.1 Workbook

Workbook is the spreadsheet container.

It owns:

- workbook metadata
- sheet collection
- sheet ordering
- import/export state

### 4.2 Sheet

Sheet is the editable spreadsheet surface.

It owns:

- cell data
- merge data
- style and config data
- sheet-level import/export representation

### 4.3 Session

Session is a conversation container.

It owns:

- session name
- conversation history
- current context reference
- run history

Session is not the UI itself.
Session is not the workbook itself.
It is a persistent conversation boundary.

### 4.4 Run

Run is one completed or in-progress agent execution.

It owns:

- input text
- output text
- model metadata
- start/end timestamps
- error and abort state
- step history

### 4.5 Step

Step is an observable part of a run.

It may represent:

- reasoning
- tool call
- tool output
- final answer
- error

### 4.6 Title

Title is a derived session attribute.

It should be treated as a side effect owned by the session API/service layer:

- generated after chat completion
- persisted independently
- safe to fail
- replaceable by fallback logic

## 5. Current Implementation Map

The repository already contains most of the necessary building blocks, but some of them are still colocated in the wrong layer.

### 5.1 `packages/core`

Current files such as:

- `src/chat/sheetChange.ts`
- `src/chat/sheetCoordinates.ts`
- `src/excel/*`
- `src/exporter/*`
- `src/importer/*`

should remain framework-free and continue to act as shared primitives.

### 5.2 `packages/server`

Current session-related files:

- `src/session/service.ts`
- `src/session/routes.ts`
- `src/session/title.ts`
- `src/session/context.ts`
- `src/session/tools/*`

represent the agent/server boundary today.

Long term, these should move toward a cleaner split:

- `agent` owns model/tool/session semantics
- `server` owns request handling and persistence

Session title generation remains in `server`, because it is a session API capability rather than an agent primitive.

### 5.3 `packages/web`

Current UI files:

- `src/components/Workbench.tsx`
- `src/components/ChatInterface.tsx`
- `src/components/ExcelWorkspace.tsx`
- `src/components/ChatSidebar.tsx`
- `src/hooks/useWorkbench.ts`
- `src/hooks/useSheetPatchSync.ts`
- `src/features/workbook/WorkbookWorkspace.tsx`
- `src/features/workbook/useWorkbookWorkspace.ts`
- `src/features/workbook/ExcelGrid.tsx`
- `src/features/workbook/useExcelGridWorkspace.ts`

show the current coupling pressure.

These files should be split by feature boundaries rather than by “one big page component”.

## 6. Web Architecture Rules

### 6.1 Shell and features

The web app should be structured as:

- `App` owns only the top-level shell
- `Workbench` owns layout composition
- `features/chat` owns chat workflow and message rendering
- `features/workbook` owns workbook editing and import/export UI
- `features/session` owns session list and title display

### 6.1.1 Recommended web directory layout

```text
packages/web/src/
├── app/                # top-level bootstrap and shell composition
├── features/
│   ├── chat/           # chat panel, session list, title, streaming
│   ├── workbook/       # workbook editor, sheet tabs, import/export
│   └── session/        # session service hooks and session UI
├── components/
│   ├── layout/         # reusable layout primitives
│   └── ui/             # small shared UI widgets
├── hooks/              # shared React hooks with clear scope
├── stores/             # UI-only client state
├── api/                # HTTP client and typed server adapters
└── utils/              # pure helpers for the web layer
```

The current `components/` folder is acceptable as a transitional state,
but feature boundaries should be the long-term structure.

### 6.2 Recommended component split

Chat UI should eventually be split into:

- `MessageList`
- `MessageItem`
- `ToolCallDisplay`
- `StreamingIndicator`
- `InputEditor`

Workbook UI should eventually be split into:

- `WorkbookSwitcher`
- `ExcelWorkspace`
- `ExcelGrid`
- `ImportPreviewDialog`

Workbook UI should also separate behavior from rendering:

- `useWorkbookWorkspace` owns workbook list, switching, import preview, and sheet list derivation
- `useExcelGridWorkspace` owns persistence, export, delete, and sheet activation sync
- `ExcelGrid` should render the spreadsheet and toolbar, but not own workbook data fetching

### 6.3 State ownership

Keep three kinds of state separate:

- Server state: sessions, messages, workbooks, sheets, runs
- UI state: panel open/close, selection, expanded sections, local editor state
- Derived state: streaming flags, title fallback text, patch previews

Do not store unrelated server state in the same component just because they render side by side.

### 6.4 Web stability boundaries

The following boundaries must remain explicit:

- Chat state must not own workbook state
- Workbook state must not own session state
- Excel grid persistence must not live in the layout shell
- Title refresh must not force a chat rerender path
- Session list refresh must not reset the workbook view
- Tool output parsing must not be repeated in multiple components
- Local editor state must not be the source of truth for persisted messages

If a feature needs to cross these boundaries, it must do so through:

- a dedicated API call
- a small shared hook
- a typed event/callback
- or a cache refresh on the relevant resource only

### 6.5 Web validation points

The front-end is where most visible bugs appear, so the web layer should define clear validation points:

1. Session title rendering
   - When `/api/sessions/:id/title` succeeds, the visible title must update.
   - The update must survive a page refresh.

2. Chat streaming
   - A running chat must not block workbook interactions that are unrelated to the current run.
   - A stopped or failed run must not leave the UI in a permanent streaming state.

3. Workbook patching
   - A sheet delta should update only the affected workbook/sheet state.
   - If a delta patch fails, fall back to a full workbook refetch.
   - Saving a sheet should not reintroduce workbook-level state coupling.

4. Sheet preview and import
   - Import preview state must be isolated from the active workbook state.
   - Cancelling an import must not mutate the current workbook.

5. Session switching
   - Switching sessions must not leak previous session messages or open states.
   - The chat panel should reset only session-scoped state, not workbook-scoped state.

6. Tool result rendering
   - Tool call cards, preview cards, and reasoning blocks must be derived from message parts.
   - Rendering should not depend on incidental side effects in parent containers.

### 6.6 Web testing strategy

The web layer should be validated at three levels:

- Unit tests for pure helpers and patch logic
- Component tests for chat/session/workbook isolation
- Integration tests for title refresh, streaming, and session switching

If a bug affects two panes at once, treat it as a boundary bug and add a regression test at the boundary component, not only in a leaf component.

## 7. Data Flow

### 7.1 Workbook editing flow

1. User edits sheet content in the workbook area.
2. Web emits a workbook delta or full-sheet update.
3. Server persists the change.
4. Web refreshes only the affected workbook or sheet.

### 7.2 Chat flow

1. User sends a chat message.
2. Web posts the chat request to the server.
3. Server creates a run and streams the assistant response.
4. Server persists run and step data.
5. Web renders streaming messages and tool output.

### 7.3 Title flow

1. Chat finishes successfully.
2. Web calls the title endpoint separately.
3. Server generates a title.
4. Server persists the title update.
5. Web refreshes session state or updates cache.

Title generation must never block chat completion.

### 7.4 Undo flow

1. User requests undo for the latest run.
2. Server restores the stored sheet snapshots.
3. Web refreshes workbook state.

Undo is a workbook-side capability, not a chat rendering concern.

## 8. API Boundaries

The API surface should stay explicit.

### 8.1 Workbook APIs

- `GET /api/workbooks`
- `GET /api/workbooks/:id`
- `POST /api/workbooks/upload`
- `POST /api/workbooks/:id/upload`
- `POST /api/workbooks/:id/sheets`

### 8.2 Sheet APIs

- `PATCH /api/sheets/:id`
- `DELETE /api/sheets/:id`

### 8.3 Session APIs

- `GET /api/sessions`
- `POST /api/sessions`
- `DELETE /api/sessions/:id`
- `PATCH /api/sessions/:id`

### 8.4 Chat APIs

- `GET /api/sessions/:sessionId/messages`
- `GET /api/sessions/:sessionId/runs`
- `POST /api/sessions/:sessionId/chat`
- `POST /api/sessions/:sessionId/runs/undo-latest`

### 8.5 Title APIs

- `POST /api/sessions/:sessionId/title`

Title must remain a separate endpoint.

## 9. Server Execution Rules

### 9.1 Chat transport

The chat API may use SSE or streamed response piping.

The transport layer should only carry the chat run. It should not become a hidden place for title generation or session refresh logic.

### 9.2 Persistence

Persist:

- session metadata
- messages
- run metadata
- step records
- sheet snapshots for undo

Persisting a title is a separate write path from persisting the chat run.

### 9.3 Model usage

The model adapter should be provider-agnostic as long as it remains compatible with chat/completions style input and output.

Do not make UI code depend on provider specifics.

## 10. Failure Policy

### 10.1 Title generation failure

If model-based title generation fails:

- use the first user message
- truncate to a short length
- persist the fallback title

### 10.2 Chat failure

If the chat run fails:

- mark the run as error or aborted
- keep the session usable
- do not block future messages

### 10.3 Workbook failure

If workbook refresh or delta patching fails:

- reload the current workbook from the server
- avoid partially mutating unrelated UI state

## 11. Stability Rules

These rules are non-negotiable for future work:

1. Chat and title generation are separate operations.
2. Workbook state and session state must not be owned by one component.
3. UI components should not directly encode persistence logic.
4. Server routes should stay thin.
5. `core` stays pure and framework-free.
6. Model integrations stay on chat/completions unless a deliberate migration is approved.
7. Any new feature must declare its owner package before implementation.

## 12. Migration Plan

The architecture should evolve in steps.

### Phase 1: Split web features

- Break `ChatInterface` into smaller components
- Isolate session list/title UI
- Separate workbook UI from chat UI state
- Introduce a clear client-state boundary for session-scoped and workbook-scoped data
- Add focused tests for title refresh, session switching, and sheet patch sync

### Phase 2: Extract agent layer

- Move session context, tool registry, and compaction into `packages/agent`
- Keep session title generation in `packages/server` as a dedicated session service
- Keep server as an adapter over the agent layer

### Phase 3: Harden state boundaries

- Treat server state and UI state separately
- Use cache refresh or optimistic updates instead of deep prop chains
- Reduce parent-container refreshes that reset unrelated child state
- Ensure title updates only revalidate session data, not the entire workbench

### Phase 4: Expand runtime support

- Add runtime abstractions for alternate execution environments
- Keep the web app unchanged while the execution backend evolves

## 13. Definition of Done

The architecture is considered aligned when:

- workbook edits do not disturb chat session state
- chat streaming does not wait on title generation
- title generation can fail independently
- title generation stays in the session service layer, not the agent layer
- UI components are small and feature-scoped
- server routes are thin and predictable
- core spreadsheet logic remains reusable outside the web app
- a title update visibly changes the current session name without a full page reload
- switching chat sessions does not reset the active workbook
- an Excel patch failure does not break the chat panel
- local UI state cannot corrupt persisted session or workbook state

## 14. Summary

OpenExcel should grow into a layered system:

- `core` for spreadsheet primitives
- `agent` for AI/session/runtime behavior
- `server` for transport and persistence
- `web` for interaction and composition

The most important architectural rule is simple:

> Chat, title, and workbook are related, but they are not the same thing.

Keep them connected through explicit APIs and events, not through accidental coupling.
