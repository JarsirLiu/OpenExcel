# Web Package Notes

This file is the working guide for maintainers editing `packages/web`.
Read it together with [../../AGENTS.md](../../AGENTS.md) and
[docs/current/architecture.md](../../docs/current/architecture.md) before changing the web
application.
For user-visible copy, locale behavior, or API error display, also read
[../../docs/current/i18n.md](../../docs/current/i18n.md) and
[../../docs/rules/i18n.md](../../docs/rules/i18n.md).

## 1. What this package owns

`packages/web` owns the browser application and user interaction layer.

It owns:

- React components, hooks, and browser event handling
- route composition and page-level dependency wiring
- API client calls and transport-state mapping
- chat composition, transcript presentation, and tool-result presentation
- workbook and sheet editor composition
- chart rendering and browser-only chart interaction
- responsive workspace layout, sidebar state, resizing, and viewport measurement
- local UI state such as selection, active sheet, scroll position, and panel state

It must not own:

- Fastify routes, Prisma access, or server persistence
- model execution, prompt construction, or agent-loop policy
- spreadsheet domain rules that belong in `packages/core`
- direct mutation of server state from presentational components
- a second authoritative copy of workbook or sheet data

## 2. Current source layout

- `src/app/` - route definitions, route loaders, application composition, and error boundaries
- `src/api/` - typed HTTP clients and transport contracts; no React or domain orchestration
- `src/features/auth/` - authentication screens and auth-specific actions
- `src/features/workspace/` - workspace catalog, workbook selection, transition state, and workspace shell
- `src/features/session/` - session lifecycle, session history, and session shell composition
- `src/features/chat/` - chat transport, conversation state, composer, context indicators, and message rendering
- `src/features/workbook/` - workbook editor composition, FortuneSheet integration, sheet navigation, and charts
- `src/features/sync/` - browser synchronization and server-to-editor update coordination
- `src/features/demos/` - isolated demo definitions and replay/runtime support
- `src/shared/` - reusable UI, hooks, browser utilities, and low-level helpers with no feature ownership
- `src/styles/` - design tokens and theme styles

Keep implementation and tests co-located. Do not edit `dist/`, `node_modules/`,
or generated dependency output.

## 3. State ownership and data flow

The browser must have one authoritative state path for each concern:

```text
API response
  -> workspace/workbook document state
  -> editor and chart view models
  -> React rendering
```

Use these ownership rules:

- `useWorkbookCatalog` owns the workbook list and workbook selection transition.
- `useWorkbookDocument` owns loading and applying the selected workbook document.
- `useWorkspaceView` composes workspace-facing state and commands; it should not become a second
  repository or a catch-all data store.
- `useWorkspaceState` owns workspace-local UI state, not server workbook contents.
- Sheet cell data belongs to the workbook document/editor state. Sheet mutations must be applied as
  explicit deltas or document updates, not by forcing an unrelated full reload.
- Chart definition, chart placement, and chart render data are separate concerns. Cell changes may
  invalidate chart render data, but must not change chart placement.
- Active sheet identity is represented by a stable sheet id where possible. An array index is only a
  derived navigation value.
- Chat state belongs to the chat/session feature. Workbook components may receive narrow callbacks or
  ports, but must not import chat stores to perform workbook mutations.

Workbook transitions are transactional from the view's perspective: keep the
active document visible while the target document loads, and commit the target
only when its metadata, active sheet, and chart definitions are ready. A failed
transition must leave the active document usable and expose a retry state.

## 4. Feature boundaries

### 4.1 API clients

Files under `src/api/` translate HTTP requests and responses into typed values.
They must not contain component state, layout decisions, or workbook business
rules. Keep error normalization at this boundary or in a small shared HTTP
helper. New errors should preserve `errorCode` and structured `params` for the
UI to translate; do not add localized display sentences to API contracts.

### 4.2 Internationalized UI

Use `@/lib/i18n` and the shared locale resources for new or modified UI copy,
including labels, placeholders, tooltips, dialogs, toasts, and accessibility
names. Do not add fallback sentences to `t()`. Existing hardcoded copy is
migrated incrementally when its file is touched.

### 4.3 Workspace and session

Workspace code selects resources and coordinates lifecycle. Session code owns
conversation lifecycle. Neither should reach into FortuneSheet internals or
calculate chart coordinates.

Page-level components may compose hooks, but keep use-case commands in focused
hooks/services so a component does not own catalog loading, document merging,
chat streaming, and layout calculations at once.

### 4.4 Workbook and Sheet editor

`ExcelGrid` and FortuneSheet adapters are integration boundaries. Keep the
third-party instance isolated behind adapter/hooks. Do not expose FortuneSheet
objects as the application's general workbook state.

Sheet data mutations, workbook structure mutations, chart mutations, and UI
layout mutations are different command types. They may be coordinated by a
use case, but one command must not silently perform another kind of mutation.

### 4.5 Charts

Chart code has three layers:

- chart model: definition, source references, and placement/anchor
- chart data: resolve current sheet values into render data
- chart view: viewport coordinates, ECharts rendering, and pointer interaction

`ChartOverlay` is a view boundary. It must not reload the workbook, decide
server persistence, or directly modify sheet data. Use the single Sheet
viewport adapter for coordinate conversion; do not duplicate row-header,
column-header, scroll, zoom, or sidebar offsets in individual components.

Dragging and resizing may update placement only. Data invalidation may update
render data only. Rendering a changed chart must not recreate the FortuneSheet
instance or reset selection, scroll, or active-sheet state.

### 4.6 Chat and tool results

Chat transport parses server events and presentation components render them.
Tool-result UI should emit typed, narrow navigation/mutation intents. It must
not directly manipulate DOM nodes or reach into editor internals. A sheet
change that can be selected should carry stable workbook/sheet/cell identity so
the editor can perform navigation through its public command boundary.

## 5. Layout rules

The workspace uses one parent layout contract for the left sidebar, editor, and
right chat panel. Sidebar visibility and width are layout inputs; they are not
part of Sheet or chart coordinate calculations.

- Use grid/flex tracks and `min-width: 0`/`min-height: 0` at shrinking layout boundaries.
- The editor viewport must resize from its parent bounds, including after panel drag,
  collapse, and expand operations.
- Keep resize state in the layout hook and expose dimensions through the parent layout;
  do not synchronize width by querying unrelated component DOM nodes.
- Chart overlays must be clipped and positioned relative to the actual Sheet viewport.
- Do not add CSS offsets as a workaround for a missing layout constraint.
- Verify repeated left/right sidebar resize and collapse operations, Sheet switching,
  workbook switching, scrolling, and zooming before changing shared layout code.

## 6. Async and refresh rules

- Ignore stale responses by request generation or resource identity.
- Do not clear the active UI before a replacement resource is ready.
- Separate document refresh, sheet delta application, chart-data invalidation, and layout resize.
- Do not use a full workbook refresh as a side effect of chart dragging, chart rendering,
  or panel resizing.
- Keep effects narrowly scoped and make cleanup explicit for event listeners,
  subscriptions, timers, and third-party instances.
- Do not add compatibility branches or parallel authoritative state to hide a broken boundary;
  fix the owner and the command contract instead.

## 7. Testing and verification

Use Vitest and Testing Library with tests next to the implementation. Prefer
pure tests for coordinate adapters, workbook/sheet identity, chart binding and
data resolution, transition reducers, and resize hooks. Add component tests
when behavior depends on rendered interaction or lifecycle.

Relevant commands:

- `pnpm --filter @openexcel/web typecheck`
- `pnpm --filter @openexcel/web test`
- `pnpm --filter @openexcel/web build`
- `pnpm check` for changes crossing package boundaries
- `git diff --check` for whitespace validation

For layout or editor changes, manual verification is required at desktop and
mobile widths. Test workbook switching, sheet switching, sidebar drag/collapse
cycles, chart drag/resize, Sheet scroll/zoom, and chat tool-result navigation.
Do not start long-running dev servers as part of routine verification unless
the user explicitly asks for them.

## 8. Change checklist

Before submitting a web change, check:

- Is each new state owned by one feature and one hook/store?
- Did the change preserve stable workbook and sheet identity?
- Can a Sheet mutation occur without recreating the editor or moving charts?
- Can a chart placement change occur without refreshing Sheet data?
- Can a workbook transition fail without destroying the active view?
- Are layout dimensions derived from the parent contract rather than offsets?
- Are async responses guarded against stale workbook or sheet identity?
- Are tests added for the observable regression?
- Did a package-boundary change require an update to `docs/current/architecture.md`?

The guiding principle is:

> Data changes affect data consumers, chart commands affect chart model state,
> and layout changes affect view geometry. Connect these through typed commands
> and selectors, not by allowing components to mutate each other's state.
