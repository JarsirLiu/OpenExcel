# Current Color and Style Tooling

> Status: Current
>
> This document records the color-related behavior implemented today. The
> target architecture for theme-aware colors and AI style mutations is in
> [Color Tooling Design](../design/color-tools.md).

## Scope

OpenExcel represents direct cell formatting in the FortuneSheet cell value and
carries it through import, SheetChunk persistence, Web synchronization, and XLSX
export. The AI surface can search direct colors and can set or clear direct
fill/font colors through `formatCells`.

The following concepts are separate:

- `bg`: direct cell fill color.
- `fc`: direct font color.
- `bl`, `it`, `cl`, `un`, `ht`, `vt`, `tb`, `ct`, and `bd`: other direct cell
  formatting fields.
- Theme colors, indexed colors, tint, and conditional formatting: Excel source
  semantics that are only partially represented after import.
- Browser CSS colors and ECharts colors: presentation values, not persisted
  workbook style models.

## Current Capability Matrix

| Capability | Current behavior | Source of truth | Limitation |
| --- | --- | --- | --- |
| Store direct fill/font colors | Supported as `bg` and `fc` | `FortuneCellValue` | No separate color-reference metadata |
| Import direct XLSX/XLS colors | Supported for the imported style shapes | Core importer and style conversion | Theme/indexed/tint values are resolved to direct colors; original references are not retained |
| Persist colors | Supported in SheetChunk JSON payloads | Server SheetChunk | No dedicated style table or style index |
| Read a range with colors | Not exposed in `range` projections | Core sheet projections | Values, formulas, dates, merges, and number-format annotations are exposed instead |
| Find by fill/font color | Supported by `readSheetData` with `operation: "find"` | Core query plus Server read tool | Exact matching after hex/name normalization; no approximate or effective conditional-format matching |
| Write cell contents without changing styles | Supported | `writeCells` and SheetCommand | Content-only by contract |
| AI direct color mutation | Supported for fill/font colors | `formatCells` and the common SheetCommand path | Other styles and conditional-format rules are out of scope |
| Browser edit/save of complete cell styles | Supported through complete cell patches | Web editor diff and Sheet save coordinator | AI external mutation must still use the common Sheet delta path |
| XLSX export of direct colors | Supported as explicit ARGB/style values | ExcelJS exporter | Original theme references are not preserved |
| Conditional-format effective colors | Not supported | No current domain model | Direct color must not be described as final rendered color when conditional formatting exists |

## Canonical Cell Representation

The persisted cell shape is `FortuneCell` plus `FortuneCellValue`:

- [`packages/core/src/excel/celldataUtils.ts`](../../packages/core/src/excel/celldataUtils.ts)
  - `FortuneCell`
  - `FortuneCellValue`
  - `normalizeFortuneCellData`
  - `DEFAULT_FORTUNE_FONT_COLOR`
- [`packages/core/src/excel/fortuneCellValue.ts`](../../packages/core/src/excel/fortuneCellValue.ts)
  - scalar, date, and formula normalization used by reads and writes

`FortuneCellValue` currently stores direct style fields alongside value fields:

```ts
type FortuneCellValue = {
  v: unknown;
  m: string;
  f?: string;
  bg?: string;
  fc?: string;
  bl?: number;
  it?: number;
  cl?: number;
  un?: number;
  ht?: number;
  vt?: number;
  tb?: string;
  ct?: { fa?: string; t?: string; s?: unknown[] };
  bd?: unknown;
};
```

`normalizeFortuneCellData` de-duplicates coordinates, supplies the default
font color for normalized cells, flattens single-run inline strings, and keeps
style fields while normalizing values. It does not resolve workbook themes.

## Color Conversion

The shared conversion owner is:

- [`packages/core/src/excel/fortuneStyle.ts`](../../packages/core/src/excel/fortuneStyle.ts)
  - `ExcelColorInput`
  - `excelColorToFortune`
  - `fortuneColorToArgb`
  - `applyTint` (internal)
  - `normalizeHex` (internal)
  - border and alignment conversions in the same module

The current converter accepts RGB, indexed, theme, and tint fields. The XLSX
import path uses `@corbe30/fortune-excel`, which reads `xl/theme/theme1.xml`
and resolves theme plus tint to direct colors before the cell enters the shared
model. `fortuneStyle.ts` remains the conversion owner for the fallback SheetJS
path and for export normalization.

Do not add another color converter in Server, Agent, or Web. Any future color
normalization, alias handling, theme resolution, or comparison rule belongs at
this Core boundary.

## Import Chain

### XLSX

```text
uploaded bytes
  -> parseSpreadsheetFile
  -> parseXlsxWithFortuneExcel
  -> FortuneExcel transform
  -> readXlsxMetadata
  -> normalizeFortuneSheet
  -> normalizeImportedCelldata
  -> persisted Sheet snapshot/FortuneCellValue with bg/fc
```

Code locations:

- [`packages/core/src/importer/spreadsheetFileImporter.ts`](../../packages/core/src/importer/spreadsheetFileImporter.ts)
  - `parseSpreadsheetFile`
  - `parseXlsxWithFortuneExcel`
  - `readXlsxMetadata`
  - `normalizeFortuneSheet`
  - `normalizeImportedCelldata`
  - `toFortuneValue`
  - `buildSheet`
- [`packages/core/src/importer/sheetJsStyle.ts`](../../packages/core/src/importer/sheetJsStyle.ts)
  - `normalizeSheetJsStyle`
  - `toColor`
  - `toFill`
- [`packages/core/src/excel/fortuneStyle.ts`](../../packages/core/src/excel/fortuneStyle.ts)
  - `excelColorToFortune` is called for font, fill, and border colors

`toFortuneValue` maps font color to `fc` and fill foreground color to `bg`.
For XLSX, display/type metadata is read separately and merged with the
FortuneExcel cell data. For XLS/XLSX-style fallback parsing, `buildSheet` uses
the normalized SheetJS style shape directly. CSV has no cell color source.

### Import Tests

- [`packages/core/src/importer/spreadsheetFileImporter.test.ts`](../../packages/core/src/importer/spreadsheetFileImporter.test.ts)
  - styled XLSX import
  - indexed color import
  - SheetJS style normalization
- [`packages/core/src/excel/fortuneStyle.test.ts`](../../packages/core/src/excel/fortuneStyle.test.ts)
  - RGB, indexed, theme, tint, ARGB, border, and alignment conversions
- [`packages/core/src/excel/celldataUtils.test.ts`](../../packages/core/src/excel/celldataUtils.test.ts)
  - preservation and normalization of direct cell styles

## Persistence Chain

Colors are not stored in a separate database model. They are serialized as part
of each `SheetChunk` payload:

```text
FortuneCell[]
  -> serializeSheetChunks / serializeSheetSnapshot
  -> SheetChunk.payload JSON
  -> snapshotFromSheetChunks / sheetRecordToSnapshot
  -> FortuneCell[] with bg/fc
```

Code locations:

- [`packages/server/prisma/schema.prisma`](../../packages/server/prisma/schema.prisma)
  - `Sheet`
  - `SheetChunk`
  - `SheetMutationReceipt`
- [`packages/server/src/shared/utils/sheetChunks.ts`](../../packages/server/src/shared/utils/sheetChunks.ts)
  - `serializeSheetChunks`
  - `parseSheetChunkPayload`
  - `snapshotFromSheetChunks`
  - `mutationChunkRanges`
- [`packages/server/src/shared/utils/sheetSnapshot.ts`](../../packages/server/src/shared/utils/sheetSnapshot.ts)
  - `sheetRecordToSnapshot`
  - `serializeSheetSnapshot`
- [`packages/server/src/modules/sheets/infrastructure/sheetRepository.ts`](../../packages/server/src/modules/sheets/infrastructure/sheetRepository.ts)
  - authorized Sheet and chunk reads
- [`packages/server/src/modules/sheets/application/executeSheetCommand.ts`](../../packages/server/src/modules/sheets/application/executeSheetCommand.ts)
  - revision, transaction, receipt, and chunk persistence boundary

Adding direct color mutation does not require a Prisma migration if the existing
cell JSON shape remains compatible. It does require updates to the Core mutation
schema, mutation application, result summary, Server tool, and Web delta path.

## Current Read Tools

### Contract

- [`packages/core/src/tools/excelToolContract.ts`](../../packages/core/src/tools/excelToolContract.ts)
  - `sheetCellStyleSchema`
  - `sheetCellQuerySchema`
  - `readSheetDataInputSchema`
  - `excelToolSpecs.readSheetData`
  - `excelToolSpecs.writeCells`
- [`packages/core/src/tools/catalog.ts`](../../packages/core/src/tools/catalog.ts)
  - model-visible catalog generation
- [`packages/core/src/tools/capabilities.ts`](../../packages/core/src/tools/capabilities.ts)
  - current capability boundary

The current `readSheetData` modes are:

- `overview`: structure and formula summary plus `styleColors`, a distinct/count
  index of direct fill and font colors present in the Sheet.
- `range`: compact or exact values, formulas, dates, merges, and number-format
  annotations; fill and font colors are not included.
- `find`: value, type, formula, or direct style search.

### Find Path

```text
model readSheetData(find)
  -> Server readSheetData executor
  -> findSheetForWorkspace
  -> sheetRecordToSnapshot
  -> Core querySheetCells
  -> grouped A1-range matches
```

Code locations:

- [`packages/core/src/sheetTools/sheetCellQuery.ts`](../../packages/core/src/sheetTools/sheetCellQuery.ts)
  - `SheetCellQuery`
  - `normalizeStyleQuery`
  - `matchesValue`
  - `querySheetCells`
  - `SheetCellMatch`
- [`packages/core/src/excel/fortuneStyle.ts`](../../packages/core/src/excel/fortuneStyle.ts)
  - `normalizeColorQuery`
- [`packages/core/src/tools/excelToolContract.ts`](../../packages/core/src/tools/excelToolContract.ts)
  - `sheetCellStyleSchema` accepts color names and normalized hex forms
  - `sheetCellMatchesOutputSchema` exposes the canonical queried `color`
- [`packages/server/src/modules/sheets/tools/readSheetData.ts`](../../packages/server/src/modules/sheets/tools/readSheetData.ts)
  - `readSheetData.execute`
- [`packages/server/src/modules/sheets/infrastructure/sheetRepository.ts`](../../packages/server/src/modules/sheets/infrastructure/sheetRepository.ts)
  - `findSheetForWorkspace`

The current style query compares normalized strings for `bg` and `fc`, and can
also compare `bold` and `numberFormat`. Hex queries accept `#RGB`, `#RRGGBB`,
and ARGB forms. The first color-name vocabulary is deliberately small and
deterministic: Chinese and English red, green, blue, yellow, black, and white.
Aliases are converted to canonical colors in Core before matching. Results are
grouped ranges with a count, a reason, and the canonical `color` when the query
contains one color criterion. Approximate colors, light/dark names, CSS color
names, theme references, and effective conditional-format colors are not
supported.

The intended natural-language flow is two calls: first read `overview`, let the
model choose the matching entry from `styleColors` by its human-readable name,
then pass that entry's exact `color` to `find`. This keeps matching deterministic
without requiring the user to know a hex value. For example, if overview returns
`{ role: "fill", color: "#FFF2CC", name: "浅黄色 (light yellow)", count: 24 }`,
the model should call the existing `find` operation with
`{ style: { fill: "#FFF2CC" } }`. Core compares it with the stored `bg` and
returns the matching ranges plus the canonical `color`. The fixed aliases such
as `黄色` remain available for common exact colors, but a query such as a color
that is merely close to yellow intentionally returns no approximate match in
this phase.

### Range Projection Path

- [`packages/core/src/sheetTools/sheetDataProjection.ts`](../../packages/core/src/sheetTools/sheetDataProjection.ts)
  - `projectSheetData`
  - `parseSheetToolRange`
  - `sheetUsedRange`
- [`packages/core/src/sheetTools/sheetDataPresentation.ts`](../../packages/core/src/sheetTools/sheetDataPresentation.ts)
  - `projectSheetTable`
  - `projectSheetOverview`
  - `SheetTableAnnotation`
- [`packages/server/src/modules/sheets/tools/readSheetData.ts`](../../packages/server/src/modules/sheets/tools/readSheetData.ts)
  - range projection selection and continuation serialization

`SheetTableAnnotation` currently carries formulas, dates, and non-default number
formats. Direct style metadata is intentionally kept out of `range` projections;
the separate `overview.styleColors` index provides the small color catalog needed
before an exact style query.

## Current Write and Clear Boundaries

### Content Write

- [`packages/core/src/chat/sheetChange.ts`](../../packages/core/src/chat/sheetChange.ts)
  - `sheetChangeDeltaSchema`
  - `sheetChangeWriteOperationSchema`
  - `sheetChangeFormatOperationSchema`
  - `sheetChangePatchSchema`
- [`packages/core/src/sheet-sync/applySheetMutation.ts`](../../packages/core/src/sheet-sync/applySheetMutation.ts)
  - `applyWrite`
  - `applyWriteRange`
  - `removeContent`
  - `cellChangeSignature` (format mutations use its direct-color mode)
  - `applySheetMutation`
- [`packages/server/src/modules/sheets/tools/writeCells.ts`](../../packages/server/src/modules/sheets/tools/writeCells.ts)
  - content-only AI executor
- [`packages/server/src/modules/sheets/tools/formatCells.ts`](../../packages/server/src/modules/sheets/tools/formatCells.ts)
  - direct fill/font color executor using the common mutation transaction
- [`packages/server/src/modules/sheets/tools/clearCells.ts`](../../packages/server/src/modules/sheets/tools/clearCells.ts)
  - content clear that preserves non-content style fields
- [`packages/server/src/modules/sheets/tools/runSheetMutation.ts`](../../packages/server/src/modules/sheets/tools/runSheetMutation.ts)
  - transaction, undo snapshot, locking, and abort boundary
- [`packages/server/src/modules/sheets/tools/sheetToolCommand.ts`](../../packages/server/src/modules/sheets/tools/sheetToolCommand.ts)
  - AI mutation idempotency key
- [`packages/server/src/modules/sheets/tools/sheetToolResult.ts`](../../packages/server/src/modules/sheets/tools/sheetToolResult.ts)
  - Sheet command result adaptation

`writeCells` deliberately changes values/formulas only. Do not add style fields
to its write operation while keeping the same name and semantics. `formatCells`
uses a separate `format` mutation kind on the same SheetCommand application and
persistence path. Its first supported fields are `fill` and `fontColor`; each
may be a normalized color string, `null` to remove that direct property, or
omitted to preserve it. The operation schema is strict so unsupported style
fields cannot silently enter the format mutation.

### Style-Only Change Tracking

`applySheetMutation` uses a color-aware mode of `cellChangeSignature` for
`format` mutations. It then includes value, display value, formula, direct fill,
and direct font color, so color-only changes appear in `changedCellCount` and
`changedRanges`. Existing content, merge, and snapshot-replacement summary
semantics remain unchanged.

## Web Synchronization Chain

The browser has one workbook document and applies authoritative Sheet deltas to
it. Direct cell styles already flow through complete cell patches:

```text
FortuneSheet editor snapshot
  -> sheetMutationFromDiff / updateSheetEditorSnapshotFromMatrix
  -> patch mutation containing the complete FortuneCellValue
  -> SheetSaveCoordinator
  -> Server SheetCommand

Committed AI tool event
  -> useSheetPatchSync
  -> onCommittedSheetMutation / onSheetChanged
  -> patchWorkbookWithDelta or WorkbookDocumentStore
  -> editor workbook document
```

Code locations:

- [`packages/web/src/features/workbook/editor/sheetMutationFromDiff.ts`](../../packages/web/src/features/workbook/editor/sheetMutationFromDiff.ts)
  - `createSheetEditorSnapshot`
  - `updateSheetEditorSnapshotFromMatrix`
  - `sheetMutationFromSnapshotDiff`
  - `sheetMutationFromDiff`
- [`packages/web/src/features/sync/sheetSaveCoordinator.ts`](../../packages/web/src/features/sync/sheetSaveCoordinator.ts)
  - local pending cell tracking, conflict rebase, and save requests
- [`packages/web/src/features/sync/useSheetSaveController.ts`](../../packages/web/src/features/sync/useSheetSaveController.ts)
  - API command adapter and committed mutation acceptance
- [`packages/web/src/features/workbook/utils/patchWorkbook.ts`](../../packages/web/src/features/workbook/utils/patchWorkbook.ts)
  - `patchWorkbookWithDelta`
- [`packages/web/src/features/workspace/WorkbookDocumentStore.ts`](../../packages/web/src/features/workspace/WorkbookDocumentStore.ts)
  - browser workbook document and cell patch application
- [`packages/web/src/features/chat/hooks/useSheetPatchSync.ts`](../../packages/web/src/features/chat/hooks/useSheetPatchSync.ts)
  - committed tool event parsing and de-duplication
- [`packages/web/src/features/chat/conversation/ChatPanel.tsx`](../../packages/web/src/features/chat/conversation/ChatPanel.tsx)
  - dispatch of committed sheet mutations from chat events
- [`packages/web/src/features/sync/sheetChunkSnapshot.ts`](../../packages/web/src/features/sync/sheetChunkSnapshot.ts)
  - browser chunk serialization and changed chunk calculation

The Web path does not add a second style store. `formatCells` is recognized by
`useSheetPatchSync`, applied by the shared Core mutation, and sent to the
FortuneSheet editor through its native `setCellFormat` API. The authoritative
workbook document and existing save/rebase path remain unchanged.

## Agent and Model Prompt Boundary

The Agent does not interpret or persist Excel styles. It receives the Core
catalog and adapts generic tools:

- [`packages/core/src/tools/catalog.ts`](../../packages/core/src/tools/catalog.ts)
  - derives model-visible tool definitions
- [`packages/agent/src/runtime/tools/toolAdapter.ts`](../../packages/agent/src/runtime/tools/toolAdapter.ts)
  - generic model tool adapter
- [`packages/agent/src/prompt/systemPrompt.ts`](../../packages/agent/src/prompt/systemPrompt.ts)
  - currently tells the model to use overview, range, and find modes
- [`packages/server/src/modules/sessions/chat/toolRegistry.ts`](../../packages/server/src/modules/sessions/chat/toolRegistry.ts)
  - Server tool registry and manifest composition

Color aliases, theme resolution, style grouping, authorization, and mutation
execution must remain outside the generic Agent adapter.

## Export Chain

```text
SheetChunk payload
  -> sheetRecordToSnapshot
  -> exportWorkbook
  -> workbookToXlsx
  -> writeSheetToWorksheet
  -> applyFortuneCell
  -> ExcelJS style and ARGB output
```

Code locations:

- [`packages/server/src/modules/workbooks/application/exportWorkbook.ts`](../../packages/server/src/modules/workbooks/application/exportWorkbook.ts)
  - workbook export orchestration
- [`packages/core/src/exporter/xlsxWorkbookExporter.ts`](../../packages/core/src/exporter/xlsxWorkbookExporter.ts)
  - `workbookToXlsx`
- [`packages/core/src/exporter/excelJsWorksheet.ts`](../../packages/core/src/exporter/excelJsWorksheet.ts)
  - worksheet and cell iteration
- [`packages/core/src/exporter/excelJsCell.ts`](../../packages/core/src/exporter/excelJsCell.ts)
  - `toFont`
  - `toStyle`
  - `applyFortuneCell`

The exporter currently converts `bg` and `fc` into explicit ARGB values. It does
not preserve the original XLSX theme reference, workbook theme XML, conditional
formatting rule, or table style.

## Current AI Capability Boundary

The authoritative capability text is:

- [`packages/core/src/tools/capabilities.ts`](../../packages/core/src/tools/capabilities.ts)

It states that AI tools can read direct styles through `find` and can modify
direct fill/font colors through `formatCells`; other style and conditional
formatting mutations remain unsupported.

## Development Impact Checklist

When changing direct color recognition or AI color tools, inspect these areas:

1. Core color conversion and cell representation.
2. XLSX import and export, including theme/indexed/tint behavior.
3. SheetChunk serialization and snapshot normalization.
4. Core read projection, query schema, and result-size limits.
5. Core SheetChange schema and `applySheetMutation` signatures.
6. Server tool executor, manifest, registry, authorization, idempotency, undo,
   and result projection.
7. Web delta application, save coordination, conflict rebase, and chat event
   de-duplication.
8. Agent system prompt and Core-generated catalog.
9. Current tool capability documentation.
10. Co-located Core, Server, and Web tests.

## Test Map

- Color conversion: `packages/core/src/excel/fortuneStyle.test.ts`
- Cell normalization: `packages/core/src/excel/celldataUtils.test.ts`
- Import: `packages/core/src/importer/spreadsheetFileImporter.test.ts`
- Style query: `packages/core/src/sheetTools/sheetCellQuery.test.ts`
- Read tool: `packages/server/src/modules/sheets/tools/sheetReadTools.test.ts`
- Content mutation: `packages/core/src/sheet-sync/applySheetMutation.test.ts`
- Server mutation boundary: `packages/server/src/modules/sheets/tools/runSheetMutation.test.ts`
- AI write executor: `packages/server/src/modules/sheets/tools/writeCells.test.ts`
- AI format executor: `packages/server/src/modules/sheets/tools/formatCells.test.ts`
- Export: `packages/core/src/exporter/xlsxWorkbookExporter.test.ts`
- Web format API bridge: `packages/web/src/features/workbook/editor/fortuneSheetMutationBridge.test.ts`
- Web editor style patch: `packages/web/src/features/workbook/editor/sheetMutationFromDiff.test.ts`
- Web delta application: `packages/web/src/features/workbook/utils/patchWorkbook.test.ts`
- Web save/rebase: `packages/web/src/features/sync/sheetSaveCoordinator.test.ts`

Any new AI style tool should add tests for import, exact read, style-only
mutation, value/formula preservation, idempotent replay, undo, revision
conflict, Web delta application, and export/re-import effective color equality.
