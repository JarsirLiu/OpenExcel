# Current Agent Runtime

> Status: Current
>
> Source: `packages/agent/src/runtime/`, `packages/agent/src/session/`, and
> `packages/server/src/modules/sessions/`.

## Current chat flow

1. The Server validates the session and workspace scope.
2. Under the session lock, the Server acquires a Run lease and writes the canonical user turn first.
3. The Server builds workspace context, tool definitions, tool context, and result budgets.
4. `@openexcel/agent`'s `AgentRunner` assembles the workspace context and tool catalog, then calls `runAgentLoop`.
5. The Agent loop calls the model, validates tool input, executes tools through the injected `ToolExecutor`, and publishes provider-neutral Agent events.
6. The Server persistence barrier and idempotent tool executor persist events and tool results, allowing a recoverable Run to continue.
7. The Server finalizer converges the Run state. Events are also sent to the current Web reader through the NDJSON stream.

## Responsibility boundaries

- The Agent knows about models, prompts, transcripts, context budgets, compaction, events, and generic tool ports.
- The Server decides resource authorization, concrete workbook/Sheet/Chart tools, Prisma persistence, and HTTP transport.
- The Web submits chat requests, reads events, and renders messages and tool results.
- Title generation lives in the Server session application and is not part of the Agent-loop core.

## Tool execution

The Server obtains concrete tools from `serverToolRegistry`, validates input and
execution context, invokes the tool, validates output, and converts it to
model-safe JSON. The Agent adapter does not own Excel-specific tool logic.

`ToolResultBudget` limits total output and per-tool output. `readSheetData`
uses a paged budget. Each `prepareStep` uses the budget to determine the tools
available for that step.

## Events and connections

Current events cover Run, step, message, reasoning, tool, and context-compaction
lifecycle stages. Server event persistence is independent of the HTTP
subscriber. Closing a browser connection cancels the reader but does not
directly terminate the server Run. An explicit cancellation request triggers
Run cancellation.

## Context compaction

The Agent currently provides token estimation and observation, window trimming,
summary generation, transcript safety boundaries, a checkpoint store,
compaction success/failure events, and context checkpoints for recovery. The
default compaction strategy is defined in
`packages/agent/src/runtime/context/compaction/types.ts`.

## Run states

```text
running -> completed | cancelled | failed | persistence_failed | recovery_required
recovery_required -> completed | abandoned
completed | cancelled | failed -> reverted
```

Terminal states include `completed`, `cancelled`, `failed`,
`persistence_failed`, `recovery_required`, `abandoned`, and `reverted`.

## Code entrypoints

- Agent facade: `packages/agent/src/runtime/loop/agentRunner.ts`
- Agent loop: `packages/agent/src/runtime/loop/agentLoop.ts`
- Generic contracts: `packages/agent/src/runtime/contracts.ts`
- Context compaction: `packages/agent/src/runtime/context/compaction/`
- Server orchestration: `packages/server/src/modules/sessions/chat/orchestration.ts`
- Server event bridge: `packages/server/src/modules/sessions/chat/agentEventStream.ts`
- Run persistence: `packages/server/src/modules/sessions/runs/`
