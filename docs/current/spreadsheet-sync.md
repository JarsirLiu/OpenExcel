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
- `replaceChunks`: replaces only the submitted SheetChunk payloads and config.

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

Mutation inputs are not rejected based on a fixed cell or chunk count. Normal
spreadsheet actions such as clearing a large area or pasting a large range must
remain valid. Overlapping operations keep their ordered overwrite semantics and
are not scanned for overlap just to calculate a limit. Resource protection
belongs in the chunk execution path and transport-level request handling, not
in a user-visible spreadsheet size cap.

The Server maps mutation areas to chunk rectangles and queries continuous areas
with chunk row/column bounds. Disjoint areas are queried in bounded batches to
avoid constructing a SQL predicate for every cell. Clear and unmerge commands
only rewrite chunks that already exist; write commands create the chunks needed
by the written area.

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
- `SheetChunk` is the only persisted Sheet content source. API `uploadedData` and `merges` fields are derived views assembled from chunks; `dateValues` is a derived projection for `readSheetData`. Content reads require the chunk relation explicitly; missing or malformed chunk/config payloads fail instead of being treated as an empty Sheet.
- Chart data references and placement belong to `ChartSpec` and must not be implicitly changed by ordinary Sheet content writes.
- Internal FortuneCell formulas always use a leading `=`. `calcChain` is a
  runtime-derived editor cache rebuilt from the actual Sheet id and current
  formula cells; persisted legacy chain entries are not authoritative.

## Web synchronization behavior

- The Web workbook document is the browser's authoritative state for the current workbook.
- Sheet saves are debounced per Sheet; the current scheduler defaults to 500 ms.
- Normal Web edits are submitted as `mutation` commands containing the cell
  changes found by comparing the post-calculation `onChange` snapshot with the
  previous editor snapshot. `onOp` supplies changed-cell coordinates and
  identifies structural or non-cell operations; it is not authoritative for
  values because FortuneSheet may omit formula-dependent cells from the
  operation list. The adapter therefore observes the direct cells plus the
  existing formula cells, so recalculated formula caches are included without
  scanning or materializing the complete Sheet for ordinary edits. Each
  changed cell carries its complete FortuneCell value, including formula,
  cached value, display value, and formatting. Sheet-level configuration changes
  are included in the same patch when possible. The browser retains the
  complete current Sheet so FortuneSheet and charts always read one document,
  while the Server applies those cell patches transactionally to the affected
  persisted chunks. Bulk or structural operations use `replaceChunks` with
  only changed 256×256 chunks and the current Sheet config.
- FortuneSheet is the interactive calculation authority in the browser. Its
  recalculated formula cells, including cached `v`/`m` values and the `f`
  expression, are copied into the browser workbook document before the sparse
  mutation is scheduled. Charts read that current document data and therefore
  update without waiting for the Server.
- When a committed AI Sheet mutation arrives and the workbook still contains
  unloaded Sheets, the Web loads the complete workbook into the existing
  FortuneSheet instance before running the mutation and full recalculation.
  This is required for cross-Sheet formula dependencies; it does not change
  the lazy-loading behavior of ordinary workbook navigation.
- The Server persists the browser-submitted recalculated cells transactionally;
  it does not recalculate formulas. After a successful save, the Sheet
  revision advances and a reload reads the persisted formula cache back into
  the browser document.
- AI Sheet mutation previews display formula text directly for formula cells;
  they do not wait for or imply a server-side calculated cache value.
- Revision conflicts rebase local cell changes against the remote snapshot at
  cell granularity, preserving remote changes to untouched cells. Structural
  or large replacement operations remain chunk-based and are retried from the
  rebased snapshot rather than blindly replacing an entire remote chunk.
- Failed saves retain their pending batch and retry with bounded exponential
  backoff. A save callback may explicitly mark a revision conflict as handled
  while it fetches and rebases the remote Sheet.
- Workbook or Sheet lifecycle changes initialize the affected save baseline;
  refreshing content for an existing Sheet does not cancel its pending saves.
  Remote workbook and Sheet snapshots are merged with the document's unpersisted
  local changes before they replace the editor document. Save acknowledgements
  clear only the local change versions included in that request.
- Workbook and Sheet requests use request generations and `AbortController` to ignore stale responses.
- Workbook switching keeps the old document visible until the new document is ready; on failure, the old document remains usable and retryable.

## Code entrypoints

- Core command: `packages/core/src/sheet-sync/sheetCommand.ts`
- Core mutation: `packages/core/src/sheet-sync/applySheetMutation.ts`
- Server application: `packages/server/src/modules/sheets/application/executeSheetCommand.ts`
- Server receipt: `packages/server/src/modules/sheets/infrastructure/sheetMutationReceiptRepository.ts`
- Web document/chunk serializer: `packages/web/src/features/sync/sheetChunkSnapshot.ts`
- Web save coordinator: `packages/web/src/features/sync/sheetSaveCoordinator.ts`
- Historical formula repair: `pnpm --filter @openexcel/server db:repair-formulas`
