# Color Tooling Design

> Status: Draft
>
> This document describes future work. It is not current runtime behavior.
> Current behavior and code ownership are documented in
> [Current Color and Style Tooling](../current/color-tools.md).

## Goals

The color tooling should let a model reliably answer and execute requests such
as:

- find cells with a user-described fill or font color;
- distinguish direct formatting from an effective conditional-format color;
- apply or clear fill and font colors without changing values or formulas;
- preserve workbook colors across import and export;
- keep all mutations transactional, idempotent, undoable, and revision-aware.

The model should consume structured style facts. Screenshot vision or OCR is not
the source of truth for Excel cell formatting.

## Proposed Ownership

```text
Core color model and conversion
  -> Core style projection and SheetChange format mutation
  -> Core canonical tool contract
  -> Server authorization, transaction, persistence, undo, and executor
  -> Web committed-delta projection and editor document
  -> Agent generic adaptation and deterministic prompt guidance
```

The dependency direction remains the existing one. No Prisma or provider logic
belongs in Core, and no style state belongs in Agent or Web-only stores.

## Theme-Aware Import

### Proposed flow

```text
XLSX bytes
  -> read xl/theme/theme1.xml
  -> build workbook-scoped theme palette
  -> parse cell style color references
  -> resolve effective direct color with tint
  -> persist effective display color plus original color reference
```

### Proposed modules

- Add a Core importer module such as
  `packages/core/src/importer/xlsxTheme.ts` for reading `theme1.xml`.
- Extend the existing color owner at
  `packages/core/src/excel/fortuneStyle.ts` rather than adding a second
  converter.
- Pass a workbook-scoped theme context into the existing import functions in
  `packages/core/src/importer/spreadsheetFileImporter.ts`.
- Keep `packages/core/src/importer/sheetJsStyle.ts` responsible only for
  normalizing the external style shape.

### Color identity

The persisted style representation should distinguish effective display color
from source identity. A possible shape is:

```ts
type FortuneColorReference =
  | { kind: "rgb"; argb: string }
  | { kind: "theme"; index: number; tint?: number }
  | { kind: "indexed"; index: number };

type FortuneCellValue = {
  bg?: string;
  fc?: string;
  bgRef?: FortuneColorReference;
  fcRef?: FortuneColorReference;
};
```

`bg` and `fc` are the resolved values used by FortuneSheet, Web, and model
projections. `bgRef` and `fcRef` preserve the Excel source semantics for
round-trip export. If a user explicitly sets a new RGB color, the corresponding
source reference should be replaced by an RGB reference.

The exact persisted shape must be finalized before implementation. It should be
backward-compatible with existing SheetChunk JSON and must not duplicate color
conversion rules.

### Theme tests

Add fixtures covering:

- default theme and custom theme;
- `accent1` through `accent6`;
- `theme + tint`;
- indexed colors;
- direct RGB colors unaffected by theme;
- export and re-import with equal effective colors;
- preservation of theme references when the exporter supports them.

## Proposed Model Read Surface

Extend the existing `readSheetData` contract with a bounded style operation or
an equivalent dedicated Core projection. Prefer an explicit operation so normal
range reads remain compact:

```json
{
  "sheetId": 1,
  "operation": "styles",
  "range": "A1:Z200"
}
```

Proposed output:

```json
{
  "mode": "styles",
  "range": "A1:Z200",
  "styleGroups": [
    {
      "range": "B2:B20",
      "fill": "#FFF2CC",
      "fontColor": "#7F6000",
      "name": "light yellow",
      "count": 19,
      "source": "direct"
    }
  ],
  "continuation": null
}
```

Implementation locations:

- Add the contract in `packages/core/src/tools/excelToolContract.ts`.
- Add a compact style grouping projection beside
  `packages/core/src/sheetTools/sheetDataProjection.ts` and
  `packages/core/src/sheetTools/sheetDataPresentation.ts`.
- Reuse `packages/core/src/sheetTools/sheetCellQuery.ts` for exact search.
- Execute through `packages/server/src/modules/sheets/tools/readSheetData.ts`.
- Keep the Server result budget bounded and preserve continuation semantics.

Color names must be a deterministic Core alias table, not a prompt-only list.
Exact RGB values returned by the workbook should always be included. A fuzzy
nearest-color match may be presented as a suggestion, but should not silently
select a custom workbook color.

## Proposed Model Write Surface

Add a separate `formatCells` tool. Do not extend `writeCells`, whose current
contract is content-only.

Proposed input:

```json
{
  "sheetId": 1,
  "operations": [
    { "range": "B2:B20", "fill": "#F4CCCC" },
    { "range": "C2:C20", "fontColor": "#9C0006", "bold": true }
  ]
}
```

Use `null` to clear a directly assigned property. Each operation must preserve
all other value and style fields on the target cells.

Implementation locations:

- Add a `format` mutation variant to
  `packages/core/src/chat/sheetChange.ts`.
- Add format input normalization and application to
  `packages/core/src/sheet-sync/applySheetMutation.ts`.
- Make the change signature include style fields for style mutations.
- Add `formatCells` to `packages/core/src/tools/excelToolContract.ts`.
- Add the Server executor at
  `packages/server/src/modules/sheets/tools/formatCells.ts`.
- Register it in
  `packages/server/src/modules/sheets/tools/manifest.ts` and
  `packages/server/src/modules/sessions/chat/toolRegistry.ts`.
- Reuse `runSheetMutation`, `executeSheetCommandInTransaction`, mutation IDs,
  undo snapshots, revision checks, and `toSheetToolPatchResult`.
- Update the Core-generated capability boundary and Agent system prompt.

## Web Mutation Path

The Web should not create a special style state path. The format mutation should
flow through the existing interfaces:

```text
formatCells result
  -> sheetChangePatchOutputSchema
  -> useSheetPatchSync
  -> onCommittedSheetMutation
  -> patchWorkbookWithDelta / WorkbookDocumentStore
  -> FortuneSheet document
```

Update these locations when the new delta is implemented:

- `packages/web/src/features/chat/hooks/useSheetPatchSync.ts`
  - recognize `formatCells` as a committed Sheet mutation tool;
- `packages/web/src/features/workbook/utils/patchWorkbook.ts`
  - rely on the shared Core mutation application;
- `packages/web/src/features/workspace/WorkbookDocumentStore.ts`
  - keep full cell style fields in the authoritative document;
- `packages/web/src/features/sync/sheetSaveCoordinator.ts`
  - preserve style fields during pending edits and conflict rebase;
- `packages/web/src/features/workbook/editor/sheetMutationFromDiff.ts`
  - continue treating complete cell values as the editor patch boundary.

No new Web style store should be introduced.

## Direct Style vs Effective Style

The first implementation should expose `source: "direct"` and explicitly state
that conditional formatting is not evaluated. A later conditional-format feature
would need its own model:

- parse rules during XLSX import;
- persist rules in the workbook or Sheet model;
- evaluate supported rules against current values;
- expose `effectiveFill` and `effectiveFontColor` separately from direct fields;
- define mutation semantics for rules separately from direct `formatCells`.

Do not claim that `bg` is the final visible color when a conditional-format rule
may override it.

## Execution and Reliability Requirements

`formatCells` must follow the existing tool invariants:

- authorized Sheet/workspace scope;
- stable Core contract and one Server manifest entry;
- bounded operation and result sizes;
- idempotency from `runId` and `toolCallId`;
- one Sheet revision per committed mutation;
- undo snapshot before the mutation is finalized;
- style-only changes included in `changeSummary`;
- replay returns the original receipt result;
- Web receives an authoritative delta or an explicit refresh signal.

## Implementation Order

1. Add theme parsing and tests without changing the AI surface.
2. Add color-reference preservation and export/re-import tests.
3. Add the bounded Core style projection and `readSheetData.styles`.
4. Add color alias parsing and exact/custom-color behavior.
5. Add the Core `format` mutation and style-aware change summary.
6. Add the Server `formatCells` executor and registry entry.
7. Update Web committed-mutation handling and conflict tests.
8. Update capability text, system prompt, current documentation, and tool tests.
9. Add conditional-format support only as a separate feature.

## Verification Matrix

At minimum, test:

- direct RGB import and export;
- custom theme import and export;
- theme tint calculation;
- indexed color conversion;
- style grouping and continuation;
- exact fill/font query;
- Chinese and English color aliases;
- style mutation preserving values and formulas;
- clearing one style property while preserving others;
- idempotent replay and revision conflict;
- undo restore;
- Web delta application and save rebase;
- export/re-import effective color equality;
- explicit behavior when conditional formatting is present.
