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

Tool persistence mode is explicit in the server registry. Read tools claim their
tool-call ledger row in a short transaction, execute without a database
transaction, and persist completion or failure in a separate short write.
Mutation tools keep the claim, concrete database mutation, and ledger completion
in one transaction so a committed mutation always has a completed receipt.
SQLite write transactions are serialized by a process-local server gate; this
supports the local single-process deployment model but does not coordinate
multiple server processes. PostgreSQL is required for multi-instance operation.

Every registered tool declares its own per-call result policy: a maximum
model-visible size and a tool-owned model projection function. The generic
Agent budget adapter only invokes that policy and verifies the resulting size;
it never truncates arbitrary tool JSON. The projection is validated against
the tool output schema before the result is committed to the tool ledger.

There is no shared result quota, per-turn result quota, or cumulative
`readSheetData` budget. Repeated calls remain available. A model step may issue
at most 10 tool calls, and no more than 10 may be active concurrently. The
system prompt tells the model to split larger batches, and the Agent adapter
enforces the same limit: calls after the first 10 in a step receive a
model-visible `rate_limit` ToolError and do not enter the executor. They still
produce the normal tool lifecycle and tool-call/tool-result pairing, so the
model can retry them after the batch finishes.

Large tools must page or otherwise reduce their own domain result;
`readSheetData` shrinks one page to its own per-call limit and returns a
continuation for the next call. `findSheetCells`, `readSheetObjects`, and
`listCharts` return bounded pages with `nextOffset`. `createChart` bounds its
data-quality diagnostic indexes and series summary while preserving counts and
truncation markers. If a tool cannot produce a valid bounded result, it returns
a structured tool error instead of silently corrupting its result shape.

Tool result limits are not model context limits. A result limit protects one
tool response and prevents a single read from flooding the next model request.
Conversation growth is handled by the context window and compaction system
described below.

### Tool call lifecycle

The Agent exposes one provider-neutral lifecycle for every model tool call:

| Event | Meaning | Required timing |
| --- | --- | --- |
| `tool.started` | The Agent has observed a tool name and call id. This is a progress fact, not proof of execution or a committed mutation. | Emit from the earliest provider stream marker (`tool-input-start`, `tool-input-available`, or complete `tool-call`). The execution adapter is only a fallback. |
| `tool.finished` with `outcome: "completed"` | The executor returned a model-safe output. | Emit after execution and output validation, before the next model step can consume the result. |
| `tool.finished` with `outcome: "failed"` | The call reached a terminal error outcome. | Emit exactly once, with a structured `error`. The `source` identifies `adapter`, `provider`, `reconciliation`, or `terminal`. |

The `toolCallId` is the lifecycle identity. Repeated provider chunks,
reconciliation, retries, and stream callbacks must converge on one start and
one finish for that id. `tool.finished` contains exactly one terminal outcome:
`output` or `error`, never both.

The Web can render a pending tool immediately after `tool.started`, even while
the model is still streaming a large argument object. It must not infer that a
mutation has committed from this event.

### Tool failures and model continuation

Only explicitly classified tool failures are returned from the Agent tool
adapter as a normal model-visible result:

```json
{
  "isError": true,
  "error": {
    "kind": "business_failed",
    "message": "...",
    "details": {},
    "retryable": false
  }
}
```

The AI SDK therefore records a tool result for the original call and can start
the next model step. The model receives the exact structured error and can
correct its input, choose another tool, or explain the limitation. Tools must
use a typed `ToolError` such as `ToolInputValidationError`, `ToolBusinessError`,
or `ToolNotFoundError` for this path.

An unknown exception is not a model-visible tool failure. The Agent records a
failed lifecycle event with `kind: "internal_error"` and rethrows the original
exception so the Run becomes diagnosable. This prevents programming bugs and
infrastructure failures from being silently presented as recoverable business
errors.

Provider stream protocol errors follow the same boundary. A recognized tool
event with a missing required field raises `AgentProtocolError`; it is not
silently ignored. Reconciliation may close the Web's pending tool state with a
`source: "reconciliation"` failure, but a missing tool result then aborts the
Run. That lifecycle event is not a substitute for a model tool result.
The same rule applies when the provider invokes its final callback while any
tool call is still pending: the Agent emits a terminal lifecycle failure to
close the Web state, then raises `AgentProtocolError` and marks the Run failed.
The terminal lifecycle event is diagnostic UI state only; it never authorizes
the model loop or transcript projection to continue as if a tool result existed.

Every persisted assistant tool part must therefore end in one of two
model-valid states: `output-available` with `output`, or `output-error` with
`input` and `errorText`. If the durable event log ends after `tool.started`,
the recovery projector closes the part as `output-error` (using `{}` when the
input was never persisted). On the next turn, the AI SDK can convert this
assistant tool part into the required tool-call/tool-result pair. This is a
history repair for protocol validity, not a claim that the model received a
successful result or that the mutation committed.

Cancellation, event persistence failure, tool execution ledger failure, and
unrecoverable model protocol failures are different boundaries. They may stop
the Run because continuing would lose ordering, durability, or a valid model
conversation. In particular, a failure while recording a failed tool must not
be downgraded to an ordinary tool error.

## Events and connections

Current events cover Run, step, message, reasoning, tool, and context-compaction
lifecycle stages. Server event persistence is independent of the HTTP
subscriber. Closing a browser connection cancels the reader but does not
directly terminate the server Run. An explicit cancellation request triggers
Run cancellation.

### Next-turn availability after failure

A tool business failure ends neither the Run nor the conversation: the
structured tool result is returned to the model and the model may continue the
same Run. An infrastructure failure may terminate the current Run as
`failed` or `recovery_required`, depending on whether the durable boundary is
known. In both cases, the Run finalizer must release the session lease in its
`finally` path.

The next user turn is blocked only while the session has a live, unexpired
lease for a `running` Run. Terminal Run status, including `failed` and
`recovery_required`, must not by itself block a new turn. If lease release is
also unavailable because the database is down, the lease expires and the
recovery worker or the next acquisition attempt can reclaim it; this is a
temporary infrastructure outage, not a permanent conversation lock.

## Context compaction

The Agent's model-input budget is calculated as:

```text
input budget = context window - output reserve - fixed model context
fixed model context = system prompt + active tool definitions
model input = fixed model context + selected transcript/messages
```

The initial transcript trim includes the system prompt and the model-facing
tool schemas. Per-step token observations use the provider's confirmed input
token count when available and estimate changes from the complete context
shape, including the active tool schemas. These observations are diagnostic
and drive compaction; they do not cap the number of conversation turns or tool
calls in a Run.

Conversation history is persisted independently of model context selection.
The context window selects as many complete recent turns as fit after fixed
context and output reservation. Automatic compaction summarizes older turns
when the configured trigger is reached. Context trimming or compaction never
deletes the canonical transcript from the database and is not a history
retention policy.

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
