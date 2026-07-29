# Tool System Architecture

This directory is the source of truth for designing and adding spreadsheet
tools. It describes the boundaries between the shared contract, Agent runtime,
server execution, and web projection. It does not replace the detailed
protocol documents:

- [Current Architecture](../../current/architecture.md) defines current package boundaries.
- [Current Agent Runtime](../../current/agent-runtime.md) defines event ordering, tool lifecycle,
  persistence barriers, cancellation, and recovery.
- [Current AI Tools](../../current/tools.md) defines the current model-facing
  data contracts and tool list.

## Layers

```text
packages/core/src/tools
  canonical tool name, description, input schema, output schema, catalog
          |
          v
packages/agent/src/runtime/tools
  generic model adapter, input validation, result budgeting, tool events
          |
          v
packages/server/src/modules/*/tools
  authorization, resource scope, idempotency, transaction, side effect
          |
          v
packages/web/src/features/chat
  event projection and presentation only
```

The dependency direction is one-way. Core does not know about Agent, server,
database, or React. Agent does not know about Excel persistence or HTTP. The
server owns concrete execution and authoritative results. Web never executes a
tool or invents a result.

## Documents

- [Tool Authoring](authoring.md) - the implementation workflow and review
  checklist for a new or changed tool.

## Non-negotiable rules

1. A tool has one canonical contract in `packages/core/src/tools/excelToolContract.ts`.
2. Server implementations bind that contract with `defineServerTool`; they do
   not redeclare a competing schema.
3. Every registered Core tool must have exactly one server manifest entry when
   it is executable. Update the registry and manifest tests together.
4. `tool.started` means the Agent observed a tool name and call id. Emit it
   from the earliest provider stream marker, before potentially slow argument
   completion, validation, authorization, or execution. The executor hook is a
   fallback, not the normal start signal.
5. Every started call ends with exactly one `tool.finished`. A completed call
   has `outcome: "completed"` and `output`; a failed call has
   `outcome: "failed"` and `error`. These outcomes are mutually exclusive.
6. Only explicitly classified schema, authorization, business, and execution
   failures are returned to the model as structured tool results. Unknown
   exceptions are recorded for diagnostics and rethrown. Cancellation,
   persistence failure, and unrecoverable protocol failure are separate
   terminal boundaries. If the provider ends a stream with a pending tool,
   close the lifecycle for Web observability but raise a protocol error; never
   treat that terminal event as a model-consumed tool result.
   Persisted tool parts must still be closed as either `output-available` or
   `output-error`; recovery may synthesize the latter for the next transcript
   projection when the event log ends after `tool.started`.
7. Persistence, workbook mutation, and tool execution bookkeeping remain
   server responsibilities. Do not put Prisma or HTTP code in Core or Agent.
8. Keep ordinary results compact. Add object-specific reads or projections for
   optional metadata instead of expanding every cell into a large JSON object.
