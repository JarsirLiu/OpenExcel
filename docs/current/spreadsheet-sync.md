# Current Sheet Synchronization

> Status: Current
>
> Source: `packages/core/src/sheet-sync/`, the Server Sheet application and
> infrastructure, and Web synchronization tests.

## Single write path

```text
Web save or Server AI tool
  -> SheetCommand
  -> executeSheetCommandInTransaction
  -> core.applySheetMutation or replaceSnapshot
  -> conditional Sheet update + SheetMutationReceipt
```

Server routes, AI tools, and Web hooks must not implement separate Sheet write
algorithms.

## Command shape

`SheetCommand` has two formal shapes:

- `mutation`: applies a local `SheetMutation`.
- `replaceSnapshot`: replaces a complete sparse `SheetSnapshot`.

Both carry `mutationId`, `sheetId`, and `baseRevision`. Core owns pure
transformation. The Server owns workspace scope, transactions, revisions, and
receipts. The Web owns editor state and save scheduling.

## Concurrency and idempotency

1. Validate the command schema and confirm that the Sheet belongs to the workspace.
2. If the `mutationId` already exists and the command hash matches, return the original receipt result, including its original `baseRevision`, `revision`, mutation, and summary. Receipts do not store a post-mutation snapshot; a replay therefore has no snapshot preview. The current Sheet is not substituted into a replayed result.
3. If the same `mutationId` has a different payload, return an idempotency conflict.
4. If the current revision differs from `baseRevision`, return a revision conflict.
5. On success, increment the revision once and save the mutation receipt.

For `write` mutations, operations within one command are applied in array order;
when ranges overlap, later operations overwrite earlier operations. Separate
commands are serialized by the Server mutation path. Different workspaces use
independent queues.

Change summaries are bounded projections: the cell count is complete, while
`changedRanges` contains at most 20 compressed ranges and carries
`omittedRangeCount` and `truncated` when more ranges exist. Preview data is
also bounded to 50 rows by 32 columns.

When a `writeCells` result exceeds the model-result budget, the Server returns
the bounded summary and revision fields with `delta: null` and without a
preview. The Web treats this as an authoritative refresh signal and reloads
the current workbook; it does not reconstruct the omitted delta.

The Sheet repository only performs database reads and writes. It does not
rebuild an Excel calculation engine or derive filter, sort, or formula
dependencies from a mutation.

## Data and coordinates

- Persistence and FortuneSheet use zero-based `r/c` coordinates.
- AI tools and chat previews use one-based row/column numbers and A1 references.
- `packages/core/src/chat/sheetCoordinates.ts` and `packages/core/src/chat/sheetGeometry.ts` are the conversion boundary.
- `uploadedData` is the Sheet snapshot source. `dateValues` is a derived projection for `readSheetData`, not a second persisted truth.
- Chart data references and placement belong to `ChartSpec` and must not be implicitly changed by ordinary Sheet content writes.

## Web synchronization behavior

- The Web workbook document is the browser's authoritative state for the current workbook.
- Sheet saves are debounced per Sheet; the current scheduler defaults to 500 ms.
- A revision change cancels pending saves that are no longer applicable.
- Workbook and Sheet requests use request generations and `AbortController` to ignore stale responses.
- Workbook switching keeps the old document visible until the new document is ready; on failure, the old document remains usable and retryable.

## Code entrypoints

- Core command: `packages/core/src/sheet-sync/sheetCommand.ts`
- Core mutation: `packages/core/src/sheet-sync/applySheetMutation.ts`
- Server application: `packages/server/src/modules/sheets/application/executeSheetCommand.ts`
- Server receipt: `packages/server/src/modules/sheets/infrastructure/sheetMutationReceiptRepository.ts`
- Web queue: `packages/web/src/features/sync/sheetSaveQueue.ts`
- Web scheduler: `packages/web/src/features/sync/sheetSaveScheduler.ts`
