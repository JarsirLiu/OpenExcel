# Server Agent Notes

This file is the working guide for any AI or maintainer editing `packages/server`.
Read it together with [docs/architecture.md](../../docs/architecture.md) before making changes.

## 1. What this package owns

`packages/server` is the adapter layer for OpenExcel.

It owns:

- HTTP routes and request/response shaping
- streaming transport for chat
- database persistence
- session, run, step, workbook, and sheet orchestration
- session title generation
- authentication and authorization, when introduced

It must not own:

- spreadsheet core transforms
- UI concerns
- React state
- DOM logic
- provider-specific model details beyond what is needed to call the agent

## 2. Current source layout

The current codebase is still transitional. The important source areas are:

- `src/app.ts` - Fastify composition and plugin registration
- `src/index.ts` - process entrypoint
- `src/config.ts` - environment parsing and runtime config
- `src/infra/database/` - Prisma client wiring (`db.ts`), config (`databaseConfig.ts`), schema management (`prismaDatabase.ts`), and Prisma type re-exports (`prismaTypes.ts`)
- `src/infra/observability/logger.ts` - logging helpers
- `src/middleware/requestContext.ts` - Fastify request augmentation and `requireCurrentUser` helper
- `src/modules/sessions/*` - session chat, history, title, transcript, and session orchestration
- `src/modules/sessions/chat/*` - chat streaming and workspace-context assembly
- `src/modules/sessions/runs/*` - run persistence and undo logic
- `src/modules/workbooks/*` - workbook orchestration and query entrypoints
- `src/modules/workbooks/import/*` - workbook upload and import helpers
- `src/modules/workbooks/export/*` - workbook export helpers
- `src/modules/workbooks/create/*` - workbook sheet creation helpers
- `src/modules/workbooks/delete/*` - workbook deletion helpers
- `src/modules/sheets/*` - sheet patching and AI tool adapters
- `src/shared/utils/*` - shared server-side helpers

`dist/` and `node_modules/` are build artifacts and dependency output.
Do not edit them manually.

## 3. Long-term direction

The long-term server shape should move toward:

- thin route handlers
- domain-focused modules
- small services that compose use cases
- repository files that only talk to Prisma
- request middleware for auth and request context
- infra modules for AI, auth, storage, and streaming helpers

Recommended future shape:

- `src/modules/auth`
- `src/modules/users`
- `src/modules/workspaces`
- `src/modules/sessions`
- `src/modules/runs`
- `src/modules/workbooks`
- `src/modules/sheets`
- `src/middleware`
- `src/infra`
- `src/shared`

Do not force this restructure all at once.
Prefer incremental extraction from the current `session`, `workbook`, and `sheet` folders.

## 4. Rules for every change

### 4.1 Keep routes thin

Route files should:

- validate and normalize input
- call a service
- map service errors to HTTP responses
- never contain core business logic

If route code starts branching on business rules, move that rule into a service or policy helper.

### 4.2 Keep persistence in repositories

Repository files should:

- call Prisma
- contain query helpers and transaction helpers
- not know about HTTP
- not know about UI
- not construct response objects

### 4.3 Keep service files focused

Service files should:

- orchestrate a single use case or a small set of related use cases
- coordinate repositories, agent calls, and helper functions
- own fallback logic when that fallback is part of the use case

If a service becomes a grab-bag, split it by use case.

### 4.4 Keep title generation separate from chat

Session title generation is a separate capability.

Do not:

- hide title creation inside the chat stream
- make chat wait for title creation
- couple title persistence to SSE completion order

If title generation fails, fall back to the first user message or another short safe title.

### 4.5 Keep agent logic out of server-only helpers

`packages/agent` owns the AgentRunner, model/session execution semantics, tool-call protocol, context
compaction, retry/backoff policy, and stop conditions. `packages/server` owns authorization, persistence,
concrete workbook/sheet/chart tool execution, and HTTP/stream transport.
`packages/server` may call into `@openexcel/agent`, but should not reimplement agent semantics.

If a helper is about:

- context assembly for the model
- transcript reconstruction
- tool catalog shape
- model retry/backoff or tool-loop control

then check whether it belongs in `agent` instead of `server`.

## 5. Multi-user and authentication rules

The codebase is currently close to a single-user or global-session shape.
Future multi-user work should be designed in from the start.

### 5.1 Scope should become explicit

Eventually these entities should be scoped by `userId`, `workspaceId`, or both:

- sessions
- workbooks
- sheets
- runs
- uploads
- titles

Do not rely on implicit global queries once auth exists.

### 5.2 Add auth at the boundary

When auth lands:

- populate the current principal in middleware
- keep auth checks out of route bodies as much as possible
- centralize role checks in helpers such as `requireAuth` and `requireRole`
- avoid sprinkling user lookup logic across services

### 5.3 Prefer workspace-first thinking

If the project adds teams, orgs, or shared workspaces:

- model the workspace boundary explicitly
- scope session and workbook access by workspace membership
- keep user ownership separate from workspace membership

### 5.4 Database changes should anticipate ownership

When adding new Prisma models or columns, consider fields like:

- `ownerUserId`
- `workspaceId`
- `createdByUserId`
- `updatedByUserId`
- `tenantId` if needed later

Only add what the current feature needs, but avoid designs that make later scoping impossible.

## 6. Streaming and run handling

Chat streaming has a few important invariants:

- the server owns persisted run records, while `packages/agent` owns the in-memory AgentRunner lifecycle
- step/event persistence is a durability barrier; a failed save must stop further model/tool execution and
  put the run into a diagnosable persistence-failed state before any recoverable stream continues
- run finalization should happen even on abort or error
- canonical user-message persistence happens before model execution
- server persistence callbacks receive authoritative Agent events; the browser transcript is never authoritative

If you change streaming behavior:

- keep explicit cancellation separate from HTTP connection detachment
- keep finalization idempotent
- keep transcript persistence separate from run status updates

## 7. Undo and snapshot rules

Undo is a workbook-side capability, but it is currently coordinated from session flow.

When touching undo:

- preserve snapshot restore correctness
- do not silently delete snapshots before restore completes
- keep cleanup/pruning separate from restore
- do not couple undo behavior to title generation or chat rendering

## 8. Workbook and sheet rules

Workbook code should focus on:

- import/export
- workbook creation and deletion
- sheet creation
- template export

Sheet code should focus on:

- fetching a sheet
- updating a sheet
- deleting a sheet

Do not move spreadsheet core transforms into server if they already belong in `@openexcel/core`.

## 9. Error handling rules

- Use typed or at least clearly named errors for predictable failures.
- Map errors to HTTP status codes at the route boundary.
- Keep service errors consistent and user-facing where appropriate.
- Prefer returning `null` or a small result object for expected not-found cases.
- Throw only for exceptional or unrecoverable paths.

## 10. Testing expectations

See [docs/testing-guidelines.md](../../docs/testing-guidelines.md) for the full specification.

Before landing server changes, update or add tests for the changed behavior.

### 10.1 Test framework and file placement

- Framework: **Vitest** (use `vitest --run` to execute).
- Test file naming: `*.test.ts` (not `.spec.ts`).
- Test file placement: **co-located next to the source file**. Tests live in the same directory as the code they test (e.g., `src/infra/database/databaseConfig.test.ts` for `databaseConfig.ts`).
- Exception: cross-cutting integration or E2E tests may live under `src/tests/`.

### 10.2 Test structure and naming

- Use `describe` / `it` blocks (imported explicitly from `vitest`, even though `globals: true` is common).
- Outer `describe("ModuleName")`, inner `describe("function name or scenario")`.
- `it` descriptions use present tense verbs: `it("should do something")`, `it("handles edge case")`.
- Prefer Arrange-Act-Assert layout with blank-line separation.

### 10.3 Coverage and focus

```typescript
import { describe, expect, it } from "vitest";
import { myFunction } from "../my-module.js";

describe("myFunction", () => {
  it("should return expected result", () => {
    expect(myFunction(input)).toBe(expected);
  });
});
```

- Focus tests on the **service boundary** (not on tiny helpers or implementation details).
- Critical areas: title generation, chat streaming/abort, session history, workbook import/export, sheet update/delete, undo restore.
- Use `expect().toBe()`, `.toEqual()`, `.toContain()`, `.rejects.toThrow()` for assertions.

### 10.4 Mocking patterns

- Prefer hand-rolled mock objects with `vi.fn()` over auto-mocking.
- Use `vi.mock()` + `vi.hoisted()` sparingly, only for module-level mocking when necessary.
- For environment variable tests, save/restore `process.env` in `try/finally` (or use `vi.stubEnv`/`vi.unstubEnv`).

### 10.5 Temporary test data

- Use `os.tmpdir()` + random suffix for temp directories; clean up in `afterEach`/`afterAll`.
- Avoid sharing mutable state between test cases — use `beforeEach` to reset state.

### 10.6 Test scripts

- `pnpm --filter @openexcel/server test` — runs `vitest run`.
- Coverage is not enforced, but consider adding `--coverage` for critical modules.

## 11. Safe change checklist

Before modifying server code, ask:

- Does this belong in `server`, `agent`, or `core`?
- Is the route still thin after the change?
- Did I introduce business rules into a handler?
- Did I accidentally couple title generation to chat streaming?
- Did I add any global query that will break once auth exists?
- Did I update tests or document why tests are not needed?

## 12. Current practical commands

Common package-level commands:

- `pnpm --filter @openexcel/server test`
- `pnpm --filter @openexcel/server build`
- `pnpm --filter @openexcel/server dev`
- `pnpm --filter @openexcel/server db:migrate`

## 13. When in doubt

If a change seems to require a wide redesign:

- keep the public API stable first
- isolate the new behavior in a small module
- move logic out of routes before changing data flow
- preserve the current runtime behavior unless the user asked for a breaking change

The guiding principle is incremental improvement, not rewrite.
