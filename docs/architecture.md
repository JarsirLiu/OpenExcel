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

Spreadsheet primitives, delta handling, export logic, and shared schema conversion belong in `packages/core`.
Workbook file parsing is owned by `packages/core`. The server stores the original upload, invokes
the FortuneExcel-backed `.xlsx` adapter or the SheetJS-style `.xls/.csv` adapter, validates the
resulting import DTO, and persists it transactionally. `packages/web` only uploads the original
file and refreshes the workbook list.

This package must not know about:

- HTTP
- React
- Database
- SSE or WebSocket
- AI model providers

Spreadsheet format adapters use the shared FortuneSheet conversion layer in `core`. That layer owns
alignment, wrapping, borders, colors, scalar values, and formula semantics; the ExcelJS exporter
consumes the same helpers in reverse. No adapter may define a second mapping for `ht`, `vt`, `tb`,
`ct`, or formula prefixes.

Workbook view metadata follows the same boundary. Excel `autoFilter` ranges are converted at the
shared import boundary into the zero-based `filter_select` range used by FortuneSheet; ExcelJS
export converts that range back to an Excel A1 range. The browser does not participate in parsing.
The XLSX path performs ZIP preflight checks for entry count and declared uncompressed sizes before
FortuneExcel or optional metadata parsing runs. These limits belong to the core parser because
multipart request limits only protect the compressed HTTP body.

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
- Export workbook contents and define import DTOs
- Provide shared types and validation helpers
- Define framework-free chart models, cell references, anchors, and chart command contracts

Chart data is a separate domain from the FortuneSheet view model. `packages/core` owns the
stable `ChartSpec` contract and Excel-compatible logical references. `packages/web` may render a
chart through ECharts or another renderer, but renderer options and instances are never persisted
as the source of truth. `packages/server` owns chart use cases and persistence, while the Excel
format adapter owns OOXML chart and drawing import/export.

Chart implementation follows one round-trip path: define and validate the core `ChartSpec`, write
it to OOXML and verify that Excel can reopen the result, read existing OOXML charts back into the
same model, then connect persistence, API, AI tools, and web rendering. Rendering is not considered
complete until an imported or AI-created chart survives export without losing its chart, drawing,
or relationship parts.

The current FortuneSheet `chart` configuration field is a compatibility projection only. New
features must not depend on its `any[]` shape. Charts use stable workbook and sheet identities,
not sheet names, so same-named sheets in different workbooks remain unambiguous.

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

Uploaded workbook files are stored as immutable source assets. In local development the default
root is `.data/storage`; production may replace the local storage adapter with S3, MinIO, or
another object store through `OPENEXCEL_STORAGE_ROOT`. The database stores only asset metadata and
the storage key, never the XLSX binary. Import requests use `multipart/form-data` and contain only
the original file; the server owns the file-to-domain import conversion. Asset metadata is created
in `UPLOADING` state before the object is written, becomes `READY` after the object hash and size
are recorded, enters `IMPORTING` through an atomic claim before parsing, and becomes `ACTIVE` only
in the same transaction that attaches it to imported workbooks. Failed imports become `ORPHANED`,
so a failed physical delete never loses the durable record needed for retry. A background asset
worker atomically claims bounded batches with a lease, skips active imports, reclaims expired
import leases, deletes storage objects idempotently, and removes metadata only after storage
deletion succeeds.
Unreferenced active assets and interrupted uploads are reclaimed by the same worker after their
retention window; request handlers never perform storage cleanup.

The server's database layer should be selectable at startup by configuration.
The current implementation can keep multiple Prisma clients available and pick one from `DATABASE_PROVIDER` and `DATABASE_URL` when the process starts.
That gives us restart-based switching between database sources without runtime hot-swapping.
Schema changes must land through explicit Prisma migrations, not runtime `db push`, so each provider can apply the same reviewed history in a controlled way.

Server code may depend on `agent`, but should not duplicate agent logic.

#### 3.3.1 Recommended server directory layout

```text
packages/server/src/
├── app.ts                 # Fastify bootstrap and plugin registration
├── index.ts               # process entrypoint
├── config.ts              # env parsing and runtime config
├── shared/                # server-wide shared helpers
│   ├── errors/            # typed errors, error mapping, error helpers
│   ├── http/              # response helpers, route adapters, stream helpers
│   ├── auth/             # auth primitives shared by modules
│   ├── validation/       # request schema helpers and parsing
│   └── utils/            # generic utilities that do not belong to a module
├── infra/                 # technical integrations used by modules
│   ├── db.ts              # Prisma client and DB wiring
│   ├── ai/               # model config, provider adapters, title model setup
│   ├── auth/             # password hashing, token/session cookie, OAuth hooks
│   ├── storage/          # file/blob helpers if we add local or remote storage
│   ├── streaming/        # SSE / response piping primitives
│   └── observability/
│       └── logger.ts      # request logging and server logging helpers
├── middleware/           # request-scoped middleware and guards
│   ├── auth.ts           # populate current user / session principal
│   ├── requireAuth.ts    # enforce signed-in access
│   ├── requireRole.ts    # workspace/admin role checks
│   └── requestContext.ts # request id, actor id, tenant id attachment
├── modules/              # business modules, split by domain
│   ├── auth/
│   │   ├── api/          # HTTP routes and response mapping
│   │   ├── application/  # login, register, logout, current-user use cases
│   │   ├── domain/       # auth errors and module contracts
│   │   └── infrastructure/ # Prisma, password, token, cookie adapters
│   ├── users/
│   │   ├── routes.ts     # user profile and admin user endpoints
│   │   ├── service.ts    # profile, status, account lifecycle
│   │   ├── repository.ts # user persistence
│   │   └── types.ts
│   ├── workspaces/
│   │   ├── api/          # workspace HTTP routes
│   │   ├── application/  # workspace use cases
│   │   ├── domain/       # workspace errors and contracts
│   │   └── infrastructure/ # Prisma and initial-resource provisioners
│   ├── sessions/
│   │   ├── api/          # session CRUD, chat, title, undo HTTP routes
│   │   ├── application/  # session queries, transcript, title, and use cases
│   │   ├── domain/       # session errors and contracts
│   │   ├── infrastructure/ # session persistence and per-session locking
│   │   ├── chat/         # SSE and Agent orchestration boundary
│   │   └── runs/         # run, step, snapshot, and undo persistence
│   ├── runs/
│   │   ├── repository.ts # run and step persistence helpers
│   │   └── types.ts
│   ├── workbooks/
│   │   ├── api/          # workbook and sheet-structure HTTP routes
│   │   ├── application/  # workbook and sheet-structure use cases
│   │   ├── domain/       # workbook creation rules and errors
│   │   ├── infrastructure/ # Prisma and workbook transactions
│   │   └── tools/        # Agent workbook tool adapters
│   ├── assets/
│   │   ├── application/  # upload staging and background cleanup use cases
│   │   ├── domain/       # asset state, storage, and repository ports
│   │   └── infrastructure/ # object storage and asset metadata persistence
│   └── sheets/
│       ├── api/          # sheet read and patch HTTP routes
│       ├── application/  # sheet query and content/name update use cases
│       ├── domain/       # sheet change and tool-domain helpers
│       ├── infrastructure/ # Sheet persistence
│       └── tools/        # Agent sheet tool adapters
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

The current implementation follows that direction with a cookie-backed email/password session identity:

- each browser gets an opaque session token stored in an HttpOnly cookie
- the server resolves it to a current user at request time
- registration or login only provisions the authentication session
- an explicit authenticated bootstrap command provisions the user's private workspace
- workspace, workbook, sheet, and session reads are filtered by the current user

This keeps the SQLite development path usable for multi-user demos without changing the workbook model or exposing internal sheet identifiers as a permission boundary, while leaving room for password reset, logout-all, and future SSO-style auth later.

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

Spreadsheet coordinates use one explicit boundary. FortuneSheet and persisted `uploadedData` use
0-based coordinates (`r=0,c=0` is A1); agent tools and chat previews use Excel's 1-based visual
coordinates. The core chat coordinate and geometry modules own conversion between these
representations, including merge ranges and A1 references. Server tools must not infer or remove a
header row, and `readSheet` reports the actual visual row numbers. `firstRowValues` is raw row-one
data only and is never treated as an implicit table-header contract.

### 5.2 `packages/server`

Authentication and workspace boundaries have completed the first application-layer extraction:

- `src/modules/auth/api/routes.ts` owns HTTP validation, Cookie handling, and response mapping.
- `src/modules/auth/application/*` owns authentication use cases without Fastify dependencies.
- `src/modules/auth/domain/*` owns auth contracts and predictable errors.
- `src/modules/auth/infrastructure/*` owns Prisma persistence, password hashing, and session-cookie primitives.
- `src/modules/workspaces/api/routes.ts` owns workspace HTTP adapters.
- `src/modules/workspaces/application/*` owns workspace use cases and bootstrap orchestration.
- `src/modules/workspaces/domain/*` owns workspace errors and contracts.
- `src/modules/workspaces/infrastructure/*` owns Prisma queries, resource-group transactions, and example provisioning.
- `src/modules/workbooks/api/*` owns workbook HTTP adapters, including nested sheet-structure endpoints.
- `src/modules/workbooks/application/*` owns workbook import/export, creation/deletion, and sheet creation/deletion use cases.
- `src/modules/workbooks/domain/*` owns workbook creation rules and predictable errors.
- `src/modules/workbooks/infrastructure/*` owns workbook persistence and cross-workbook/sheet transactions.
- `src/modules/assets/application/*` owns upload staging, activation, and background cleanup.
- `src/modules/assets/domain/*` owns asset state and storage/repository ports; workspaces and
  workbooks do not perform storage cleanup or write asset lifecycle fields directly.
- `src/modules/assets/infrastructure/*` owns object storage and upload-asset metadata persistence.
- `src/modules/sheets/api/*` owns Sheet content and name HTTP adapters.
- `src/modules/sheets/application/*` owns Sheet query and content/name update use cases.
- `src/modules/sheets/infrastructure/*` owns Sheet persistence and workspace-scoped access.
- `src/modules/sessions/api/*` owns session HTTP adapters and SSE response handling.
- `src/modules/sessions/application/*` owns session directory queries, message history, title, and use cases.
- `src/modules/sessions/domain/*` owns predictable session errors.
- `src/modules/sessions/infrastructure/*` owns session persistence and per-session locking.
- `src/modules/sessions/chat/*` owns the Agent/SSE orchestration boundary.
- `src/modules/sessions/runs/*` owns run, step, snapshot, and undo behavior.

The sessions domain remains intentionally transitional. Its `routes.ts`, `service.ts`, and
`repository.ts` files will be extracted later using the same dependency direction.

Current session-related files:

- `src/modules/sessions/api/routes.ts`
- `src/modules/sessions/application/*`
- `src/modules/sessions/infrastructure/*`
- `src/modules/sessions/chat/*`
- `src/modules/sessions/runs/*`
- `src/modules/sheets/tools/*`

represent the agent/server boundary today.

Long term, these should move toward a cleaner split:

- `agent` owns model/tool/session semantics
- `server` owns request handling and persistence

Session title generation remains in `server`, because it is a session API capability rather than an agent primitive.
Sheet mutation tools now live under `src/modules/sheets/tools/*`, which is a better fit for the domain than the old session-tools location.

Workbook structure operations remain in `workbooks`, even when their URLs are nested under a workbook:
workbook creation, import/export, deletion, and sheet creation/deletion belong to the workbook boundary.
The `sheets` module owns Sheet content reads, cell updates, and name updates. This keeps structural
changes separate from incremental cell mutations.

Workspace entry loads directory data first. Workbook list and session list endpoints return metadata;
the current workbook content is loaded as part of the workspace route data, and session messages are
loaded when a conversation is selected, paginated from the newest messages backward.
The workspace always starts with an in-memory draft conversation. A conversation Session is created
only after the user sends the first message; opening a workspace, creating a workspace, and clicking
"new conversation" do not write an empty Session row.

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
- `useExcelGridWorkspace` owns persistence, delete, and sheet activation sync
- `ExcelGrid` should render the spreadsheet and toolbar, but not own workbook data fetching

Sheet persistence has one canonical cell model. `uploadedData` contains every real visible cell,
including table headers; `columns` contains column layout metadata such as widths and must not be
converted into cells by the web editor. The editor is a pure view/interaction adapter: loading a
sheet must not add rows or shift cell coordinates, and saving a sheet must not persist presentation-
only data. Template provisioning is responsible for materializing template headers into
`uploadedData` before the sheet is stored.

Workbook export has one explicit source:

- The sidebar download uses the server export endpoint and persisted workbook data. The export
  adapter consumes the same stored FortuneSheet cell/config model used by the editor, including
  imported worksheet view metadata, and writes a standard ZIP-compressed `.xlsx`. ExcelJS may be
  used for cell values, styles, worksheet metadata, and other features it can represent, but it is
  not the source of truth for charts. The OOXML format adapter writes chart XML, drawing XML, and
  their relationship parts from the persisted chart domain model, and preserves required source
  package parts for features not yet represented by the domain model. The `.xlsx` import adapter
  maps worksheet view metadata and chart/drawing parts into the same persisted domain before
  export, so export does not need to guess or hardcode workbook objects.

Browser download mechanics are shared in `features`/`shared` helpers; Excel generation remains
outside UI components.

### 6.3 State ownership

Keep three kinds of state separate:

- Server state: sessions, messages, workbooks, sheets, runs
- UI state: panel open/close, selection, expanded sections, local editor state
- Derived state: streaming flags, title fallback text, patch previews

Do not store unrelated server state in the same component just because they render side by side.

The workspace route is the source of truth for the selected workspace. The sidebar dispatches
navigation intents; it does not mutate a second active-workspace state. The workspace route loader
seeds the selected workspace's workbook catalog and current workbook, while the workbook data hook
owns subsequent workbook mutations and refreshes. Route hydration must be scoped by `workspaceId`
and must not reset a ready workbook to a loading state.

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

### 7.1.1 Authentication and workspace bootstrap flow

1. Registration or login validates credentials and atomically creates the user and `AuthSession`.
2. The server sets the opaque `openexcel_session` cookie and returns the current user.
3. The web app calls `POST /api/workspaces/bootstrap`.
4. The bootstrap use case provisions the initial workspace, workbook, and sheets in one idempotent transaction. It does not create a conversation `Session`.
5. The web app navigates to the protected workbench route.
6. The route loader reads `GET /api/workspaces`, then loads workbook metadata and conversation-session metadata for the selected workspace.

`AuthSession` is the login identity. `Session` is the persisted conversation resource under a workspace. Login and workspace bootstrap must never create a conversation session.

`GET /api/workspaces` is a read-only query. Initialization is never hidden inside a list request.

### 7.2 Chat flow

1. Entering a workspace opens a new in-memory draft conversation. The persisted session list is history and is not automatically selected.
2. User sends a chat message from the draft. Web posts the transcript to `sessions/draft/chat` with an idempotency key; the server creates the persisted `Session`, stores the initial user transcript and starts the stream in one application use case. The initial session name is a deterministic fallback derived from the first user message.
3. The agent removes empty placeholders and compacts the recent contiguous transcript to the configured context budget. The default model input budget is 180,000 tokens, with 16,000 tokens reserved for the response.
   It also keeps only the latest 20 complete user turns by default (`MODEL_MAX_CONVERSATION_TURNS`); turn trimming happens before token trimming, so an assistant tool call and its result are not split across the window.
   Each user message sent to the model is independently capped at 16,000 tokens (`MODEL_MAX_USER_INPUT_TOKENS`). Only the model-facing copy is truncated; the complete user message remains in the persisted transcript.
4. Server creates a run and streams the assistant response.
5. Server persists the complete transcript, run, and step data; compaction only affects the model request and does not remove history from the session.
6. Web renders streaming messages and tool output.

Sheet and workbook mentions use the lightweight `@openexcel/chat-contracts` protocol and an AI SDK `data-chat-reference` message part. The web editor only
extracts stable workbook or Sheet IDs; it does not serialize TipTap nodes or rely on display names.
The server resolves those IDs against the current workspace and replaces the payload with authoritative
workbook/Sheet metadata. The agent converts the resolved data part into model-facing identity text,
while the persisted/UI message keeps the user-visible text separate from that hidden context. This
keeps editor, resource authorization, and model prompt formatting in separate ownership boundaries.

Tool results are processed at one run-scoped boundary before they are returned to the model. The default shared result budget is 32,000 tokens per run, each result is capped at 8,000 tokens, and `readSheet` has a 24,000-token sub-budget. A result larger than its remaining allowance is structurally compacted, retaining scalar metadata and representative array items. When no allowance remains, the wrapper returns a normal `truncated` result without executing the underlying tool; on the next model step, exhausted tools are removed from `activeTools`, allowing the model to finish without an error or an unbounded tool loop. These limits are configured with `MODEL_TOOL_RESULT_BUDGET_TOKENS`, `MODEL_TOOL_RESULT_MAX_TOKENS`, and `MODEL_READ_SHEET_BUDGET_TOKENS`.

Spreadsheet reads are bounded at the tool boundary. A default `readSheet` call returns an overview of the whole Sheet (dimensions, column profiles, numeric statistics, and representative samples) without returning all raw cells. Explicit `mode=range` calls return up to approximately 4,000 grid cells and expose the next row or column through `hasMoreRows`, `hasMoreCols`, and the range in the response. This lets the model understand a large Sheet before requesting a focused range and keeps repeated analysis from filling the context with an unbounded tool result.

### 7.3 Title flow

1. The session service observes that the first transcript has been persisted.
2. The server schedules title generation independently of the chat response.
3. Server generates a title and persists it only while the session still has its initial title.
4. Web refreshes session metadata or updates its session cache.

Title generation must never block chat completion.
The title endpoint remains available for explicit retry or manual client actions, but the initial chat flow does not depend on a mounted chat component to request a title.

### 7.4 Undo flow

1. A run that modifies a workbook saves pre-mutation Sheet snapshots and becomes the session's single undo checkpoint only after it finishes.
2. Starting another chat turn clears that Session's prior checkpoint. A later mutation invalidates only Runs that captured the touched Sheet, including Runs still in progress; unrelated Sheets and newly uploaded workbooks do not affect it.
3. User requests undo only while the session still points to that checkpoint.
4. Server restores the stored Sheet snapshots, removes workbook structures created by that run, clears the checkpoint, and trims the corresponding chat turn.
5. Web refreshes workbook and session metadata.

Undo is a workbook-side capability, not a chat rendering concern. It is intentionally a one-shot operation: it never searches older runs after a checkpoint has been invalidated.

## 8. API Boundaries

The API surface should stay explicit.

### 8.0 Authentication and bootstrap APIs

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/workspaces/bootstrap`
- `GET /api/workspaces`

The bootstrap command is authenticated and idempotent. The workspace list endpoint is read-only and must not create application data.

### 8.1 Workbook APIs

- `GET /api/workspaces/:workspaceId/workbooks`
- `GET /api/workspaces/:workspaceId/workbooks/:id`
- `POST /api/workspaces/:workspaceId/workbooks`
- `POST /api/workspaces/:workspaceId/workbooks/import`

  Accepts `multipart/form-data` with exactly one original `file` field. The server stores the file
  as an immutable source asset, parses `.xlsx`, `.xls`, or `.csv` through the shared core importer,
  validates the resulting domain DTO, and persists the workbook transactionally. The response is
  an array of created workbook summaries. No client-generated workbook JSON is accepted by this
  endpoint.
- `POST /api/workspaces/:workspaceId/workbooks/:id/upload`
- `POST /api/workspaces/:workspaceId/workbooks/:workbookId/sheets`
- `DELETE /api/workspaces/:workspaceId/workbooks/:workbookId/sheets/:sheetId`

### 8.2 Sheet APIs

- `PATCH /api/workspaces/:workspaceId/sheets/:id`
- `GET /api/workspaces/:workspaceId/sheets/:id`

### 8.3 Session APIs

- `GET /api/workspaces/:workspaceId/sessions`
- `POST /api/workspaces/:workspaceId/sessions/draft/chat`
- `DELETE /api/workspaces/:workspaceId/sessions/:id`
- `PATCH /api/workspaces/:workspaceId/sessions/:id`

### 8.4 Chat APIs

- `GET /api/workspaces/:workspaceId/sessions/:sessionId/messages`
- `GET /api/workspaces/:workspaceId/sessions/:sessionId/runs`
- `POST /api/workspaces/:workspaceId/sessions/:sessionId/chat`
- `POST /api/workspaces/:workspaceId/sessions/:sessionId/runs/undo-latest`

### 8.5 Title APIs

- `POST /api/workspaces/:workspaceId/sessions/:sessionId/title`

Title must remain a separate endpoint.

### 8.6 Workspace Context APIs

- `GET /api/workspaces/:workspaceId/workbooks/reference-candidates`

This endpoint backs `@` mention suggestions in the chat composer.
It should load on demand instead of being fetched during workbook bootstrap, so ordinary workbook open/delete flows stay fast.

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

### 11.1 Resource context and request lifecycle

The web workbench treats `workspaceId` as the resource context boundary. Session
state and workbook state are scoped to that context and are remounted with a
`workspaceId` key when the active workspace changes. A child component must not
reuse a session or workbook response from another workspace.

All asynchronous reads that can cross a workspace or workbook switch must use
both protections:

- an `AbortController` to cancel work that is no longer relevant;
- a monotonically increasing request generation to discard a response that was
  already returned after the context changed.

The server run lifecycle has the opposite ordering requirement: transcript
persistence must complete before a run becomes terminal. Failed and aborted
streams may persist only the cleaned client transcript; they must not persist an
empty assistant placeholder or an incomplete assistant turn. This prevents a
new run from observing a run that is marked finished while the previous stream
is still writing its history.

Undo is available only through persisted run effects and must be treated as a
workbook mutation operation. A failed run without snapshots or structural
effects is not an undo candidate. A session may expose at most one current
undo checkpoint. Starting a new turn clears that Session's checkpoint; a
mutation from elsewhere invalidates a checkpoint candidate only when it
touches one of its captured Sheets, even if that Run has not finished yet.

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
