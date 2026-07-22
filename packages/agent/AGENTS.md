# Agent Layer Notes

This file is the working guide for any AI or maintainer editing `packages/agent`.
Read it together with [docs/agent-loop.md](../../docs/agent-loop.md) and
[docs/architecture.md](../../docs/architecture.md) before making changes.

`docs/agent-loop.md` is the detailed source of truth for Agent behavior. The
architecture document only defines stable package boundaries.

## 1. What this package owns

`packages/agent` is the headless AI execution layer.

It owns:

- model factory helpers
- prompt assembly
- model-facing workspace context assembly from server-provided authorized data
- canonical transcript normalization/reconstruction helpers
- tool schema and tool catalog definitions
- AgentRunner and the complete model/tool execution loop
- context compaction, token budgets, retry/backoff policy, and stop conditions
- provider-neutral Agent events and stream adapters

It must not own:

- HTTP routes
- database persistence
- Prisma access
- UI logic
- session title persistence
- auth, cookies, or request middleware
- page state or React state

## 2. Current source layout

The current codebase is intentionally small and focused:

- `src/index.ts` - public exports for the package
- `src/model.ts` - model factory helpers
- `src/prompt/systemPrompt.ts` - system prompt construction
- `src/session/context.ts` - workspace context assembly for model input
- `src/session/transcript.ts` - transcript helpers
- `src/tools/*` - tool schema, catalog, and Excel tool definitions
- `src/runtime/streamChat.ts` - streaming execution wrapper

Tests currently live next to the implementation files.

## 3. Public API discipline

`src/index.ts` is the stable public surface of this package.

When adding a new capability, ask first:

- does this belong in the public API?
- can it stay internal until a real caller needs it?
- will exporting it now make the package harder to evolve?

Prefer keeping the public surface small. If something is only used by the server, do not export it just because it exists.

## 4. Core boundaries

### 4.1 Model helpers

`model.ts` should only translate package config into language model instances.

Keep it provider-focused and small.

Do not add:

- server config loading
- environment parsing
- persistence
- HTTP-specific concerns

### 4.2 Prompt assembly

Prompt files should build the instructions that the model receives.

Keep prompts:

- deterministic
- easy to test
- independent of server transport

Avoid mixing prompt text with persistence or UI behavior.

### 4.3 Session context helpers

`session/context.ts` should only build a compact model-facing description of the workspace.

It should not:

- fetch HTTP data
- talk to Prisma
- know about auth
- know about UI components

If the model needs more context, add it as a small data-shaping helper here or in a nearby file, but keep the helper pure.

### 4.4 Transcript helpers

Transcript helpers should only translate stored run data into model-ready chat history.

They should not become a second persistence layer.

### 4.5 Tool schema and catalog

The `tools/` folder defines the AI-visible spreadsheet tool surface.

Rules:

- keep tool schemas strict and explicit
- keep tool names stable once they are used by the server
- prefer adding a new tool over silently changing the meaning of an existing one
- do not leak transport or route details into tool definitions

If a tool needs a server-side implementation, the server remains responsible for executing it.
Agent should only define the AI-facing contract and the execution wrapper.

### 4.6 Streaming execution

`runtime/streamChat.ts` is the execution wrapper around the AI SDK.

It should:

- validate messages
- build the model call
- run the complete model/tool loop
- apply retry/backoff and stop policies
- invoke injected tool executors and event sinks
- return provider-neutral events or a UI-message stream adapter for the server to pipe

It should not:

- persist runs
- write transcripts
- update titles
- know about Fastify or response objects
- execute concrete Prisma-backed workbook, sheet, or chart tools

## 5. Relationship to `packages/server`

`packages/server` may depend on this package.
`packages/agent` must not depend on `packages/server`.

The direction should stay one-way:

- server authorizes resources, prepares canonical messages and runtime ports
- agent performs the complete model-facing Agent loop
- server executes injected concrete tools and persists authoritative events/results

If a helper starts importing database code, HTTP code, or route code, it is in the wrong package.

## 6. Title generation rule

Title generation is not an agent-owned feature in this repository.

The agent package may provide a model factory that can be used for a title model, but:

- title persistence belongs in `packages/server`
- title routing belongs in `packages/server`
- title fallback policy belongs in the session service layer

Do not move title orchestration into `packages/agent` unless the architecture doc is updated first.

## 7. Stability rules for changes

Before changing code, check these constraints:

- keep agent logic headless
- keep helpers pure where possible
- keep exports minimal
- keep tool names and schemas stable unless there is a deliberate migration
- keep model-facing text deterministic and testable
- keep runtime abstractions generic enough for future environments

If a change would make the package depend on server state or UI state, stop and refactor the boundary instead.

## 8. Tests

Add or update tests when changing:

- model factory behavior
- prompt text or prompt structure
- workspace context formatting
- transcript conversion
- tool catalog/schema shape
- streaming wrapper behavior

Prefer tests that lock down observable behavior instead of implementation details.

## 9. Safe change checklist

Before editing agent code, ask:

- Is this pure and headless?
- Does it belong in agent instead of server?
- Will this stay stable for model callers?
- Did I accidentally add persistence or HTTP concerns?
- Did I change a public export in `src/index.ts`?
- Did I update tests for the behavior I changed?

## 10. Practical commands

Common package-level commands:

- `pnpm --filter @openexcel/agent test`
- `pnpm --filter @openexcel/agent build`
- `pnpm --filter @openexcel/agent typecheck`

## 11. When in doubt

If the change seems to require more than one layer:

- keep the model-facing logic in `agent`
- keep persistence and routing in `server`
- keep spreadsheet primitives in `core`
- preserve current behavior first, then refactor gradually

The guiding principle is: agent is the brain, not the database or the web server.
