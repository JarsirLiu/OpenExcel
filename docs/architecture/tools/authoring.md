# Tool Authoring Guide

Use this guide when adding or changing an Excel tool. Start with the smallest
complete vertical slice and preserve the existing tool name and semantics
unless the change is an intentional contract migration.

## 1. Decide the boundary

Before editing code, classify the behavior:

- Spreadsheet conversion, value semantics, range parsing, or pure projection:
  `packages/core`.
- Generic model adaptation, validation plumbing, result limits, or Agent
  lifecycle: `packages/agent`.
- Authorization, workbook/sheet access, transactions, idempotency, mutation,
  and persistence: `packages/server`.
- Tool progress and result display: `packages/web`.

If the feature crosses layers, define a narrow contract in Core first and keep
each layer responsible for only its own part. Read [Current Architecture](../../current/architecture.md)
and [Current Agent Runtime](../../current/agent-runtime.md) before changing shared events or runtime
behavior.

## 2. Define the canonical contract

Add the tool to `packages/core/src/tools/excelToolContract.ts` with:

- a stable name and concise model-facing description;
- an input schema that makes required scope explicit;
- an output schema that describes success and expected failure data;
- only the fields the model needs for the next decision.

Derive the model definition and capability catalog from the Core registry. Do
not define a second schema in Agent or Server. Keep dates, formulas, ranges,
and other spreadsheet semantics explicit in the contract; do not make the
model calculate storage representations such as Excel serial dates.

For large data, return a compact rectangular projection with a clear range and
use a separate, on-demand object or metadata read. Do not return a verbose
JSON record for every cell by default.

## 3. Implement the server executor

Create the concrete executor in the owning server module's `tools/` directory
and bind it with `defineServerTool("toolName", ...)`.

The executor must:

- validate the authorized workspace, workbook, and sheet scope;
- enforce the operation's resource and size limits;
- perform mutations through the owning application/core boundary;
- use the tool call identity for idempotency where the operation has side
  effects;
- commit workbook changes, undo state, tool bookkeeping, and the successful
  structured result according to the run persistence rules;
- return a typed, model-readable error for expected failures.

Keep route handling, model-loop control, and UI state out of the executor.
Register the executor in the owning module manifest and the session tool
registry. A Core contract without a manifest entry is not executable; a
manifest entry without a Core contract is invalid.

## 4. Preserve lifecycle behavior

The Agent emits `tool.started` as soon as it observes `tool-input-start` or a
complete `tool-call`, before slow construction, validation, authorization, or
execution. The event is a progress fact, not proof that a side effect was
committed.

The executor or runtime must produce one matching `tool.finished` for every
started call. The finished event must contain either a structured `output` or
an `error`, never both. Schema errors, authorization failures, business
validation failures, and execution failures are tool results the model can
correct from; they must not silently leave a pending tool or fail the whole
conversation. Cancellation and persistence failure follow the terminal rules
in [Current Agent Runtime](../../current/agent-runtime.md).

## 5. Verify the change

Add focused tests for the contract and the executor. At minimum, cover:

- valid input and the expected structured output;
- invalid model parameters and the model-readable error;
- authorization or missing-resource failure;
- idempotent replay for side-effecting calls;
- the started/finished lifecycle on success and failure;
- result size or pagination behavior for large output.

Then run the narrowest relevant package tests, typecheck, and `git diff --check`.
If the change crosses a package boundary, update [Current Architecture](../../current/architecture.md).
If it changes loop, event, retry, persistence, or recovery semantics, update
[Current Agent Runtime](../../current/agent-runtime.md) as well.
