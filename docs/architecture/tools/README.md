# Tool System Architecture

This directory is the source of truth for designing and adding spreadsheet
tools. It describes the boundaries between the shared contract, Agent runtime,
server execution, and web projection. It does not replace the detailed
protocol documents:

- [Architecture](../../architecture.md) defines durable package boundaries.
- [Agent Loop](../../agent-loop.md) defines event ordering, tool lifecycle,
  persistence barriers, cancellation, and recovery.
- [AI Spreadsheet Tools](../../ai-spreadsheet-tools.md) defines model-facing
  data contracts and token budgets.

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
4. `tool.started` means the Agent observed a call and entered its lifecycle;
   it must be emitted before potentially slow validation or execution.
5. Every started call ends with exactly one `tool.finished`, including schema,
   authorization, business, and execution failures. Expected tool failures are
   returned to the model as structured error results so the loop can continue.
6. Persistence, workbook mutation, and tool execution bookkeeping remain
   server responsibilities. Do not put Prisma or HTTP code in Core or Agent.
7. Keep ordinary results compact. Add object-specific reads or projections for
   optional metadata instead of expanding every cell into a large JSON object.
