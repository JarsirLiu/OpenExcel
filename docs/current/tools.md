# Current AI Tools

> Status: Current
>
> Source: Core `excelToolSpecs` and the Server manifests. The source schemas,
> not this summary, define exact input and output shapes.

For the complete color and style data flow, see
[Current Color and Style Tooling](color-tools.md). Future theme-aware color
resolution and AI style mutation work is tracked in
[Color Tooling Design](../design/color-tools.md).

## Registration

Core defines canonical tool names, descriptions, Zod input/output schemas, and
`needsRunContext` in `packages/core/src/tools/excelToolContract.ts`. The Server
registers concrete executors through these manifests and combines them in
`serverToolRegistry`:

- `workbookToolManifest`
- `excelToolManifest`
- `chartToolManifest`

For each chat Run, the Server derives the Agent-visible definitions and Core
tool catalog from the registry.

## Current tool list

### Workbook

- `createWorkbook`
- `createSheet`

### Sheet

- `readSheetData`
- `readSheetObjects`
- `writeCells`
- `formatCells`
- `clearCells`
- `mergeCells`
- `unmergeCells`

### Chart

- `createChart`
- `updateChart`
- `deleteChart`
- `listCharts`

## Important contracts

- AI tool row and column numbers are one-based. Core owns conversion to Core and persisted grid coordinates.
- `readSheetData` is the unified Sheet read tool. `operation: "overview"` returns a low-token structural summary and a `styleColors` index of direct fill/font colors currently present in the Sheet; use its actual `color` values for a follow-up exact `find` query. `operation: "range"` returns either a compact column-header/row-number layout or the exact two-dimensional projection; `operation: "find"` returns matching A1-range summaries for values, types, formulas, and direct styles. Direct style search compares normalized fill/font color strings, including the small set of supported color aliases, bold, and number formats; it does not resolve approximate colors, workbook themes at query time, or conditional-format effective colors. Compact range reads keep cached values per cell, represent repeated formulas through `formulaPatterns`, and use `annotations` for dates and non-default number formats. Range reads use `continuation`; find reads use `offset` and `nextOffset`.
- `writeCells`, `formatCells`, `clearCells`, `mergeCells`, and `unmergeCells` use the SheetCommand write boundary. `formatCells` only changes direct `bg` and `fc`; a color string sets the property, `null` removes it, and an omitted property is preserved. One call may contain multiple A1-range operations, applied serially in array order; later overlapping operations overwrite earlier values or format properties. `formatCells` accepts color aliases or normalized hexadecimal values and is limited to 10,000 addressed cells per call. Core owns the canonical A1 parser, color normalization, style-preserving mutation, and range validation; the Server passes the parsed operation through to SheetCommand. Web applies the committed delta through the existing workbook document path. `writeCells` remains content-only.
- A single `writeCells` call can write at most 10,000 cells.
- Mutation summaries report the complete `changedCellCount`, but expose at most 20 compressed `changedRanges`. `omittedRangeCount` reports ranges not returned and `truncated` marks an incomplete range list.
- If a `writeCells` or `formatCells` result would exceed its model-result budget, the Server keeps the complete bounded summary and revisions, removes the delta projection, and returns `delta: null`; Web then reloads the current workbook instead of applying a partial delta.
- `readSheetObjects` currently reads the active filter range for a Sheet. Use `listCharts` for workbook chart definitions. Tables and PivotTables are not exposed until they have a complete object model.
- Chart tools write the persisted `ChartSpec`; they do not use ECharts options as the domain model.
- `createChart` supports two mutually exclusive data-source modes:
  - `sourceRange`: a continuous row, column, or rectangular table. For a table, the first row supplies series names and the first column supplies categories.
  - `series`: explicit `categoryRef`, `valueRef`, and optional `name` per series. Use this for non-contiguous columns, independent ranges, or values stored on different Sheets within the same workbook.
- Pie and doughnut charts require one category reference, one value series, and a two-column source table when using `sourceRange`. Scatter charts require an X-axis category reference. Radar charts require a category reference and support multiple value series. Combo charts require an explicit `chartType` of `bar`, `line`, or `area` for every series.
- `createChart` returns optional `dataQuality` diagnostics with missing category/value indexes, non-numeric value indexes, formula cells, and formula cells without a numeric cached value. The chart tool does not evaluate formulas. Large diagnostic lists are bounded and expose truncation markers plus total series counts.
- `listCharts` returns chart specs in bounded pages with `offset`, `limit`, and `nextOffset`; it does not load the entire chart collection into one model result.
- Chart validation no longer removes empty or text-only series from a valid chart spec. It rejects a chart only when no series contains any numeric value, while preserving incomplete references for diagnosis and later refresh.
- Tool outputs must pass schema validation and be converted to model-safe JSON.

## Code entrypoints

- Core contract: `packages/core/src/tools/excelToolContract.ts`
- Core catalog: `packages/core/src/tools/catalog.ts`
- Server registry: `packages/server/src/modules/sessions/chat/toolRegistry.ts`
- Sheet executors: `packages/server/src/modules/sheets/tools/`
- Workbook executors: `packages/server/src/modules/workbooks/tools/`
- Chart executors: `packages/server/src/modules/charts/tools/`
