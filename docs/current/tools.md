# Current AI Tools

> Status: Current
>
> Source: Core `excelToolSpecs` and the Server manifests. The source schemas,
> not this summary, define exact input and output shapes.

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
- `findSheetCells`
- `readSheetObjects`
- `writeCells`
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
- `readSheetData` returns a two-dimensional values projection, derived date values, formula patterns, formula errors, merge information, and an optional continuation.
- `findSheetCells` returns matching A1-range summaries in pages. When `nextOffset` is not null, pass it back as `offset` to read the next page. Read the data separately when content is needed.
- `writeCells`, `clearCells`, `mergeCells`, and `unmergeCells` use the SheetCommand write boundary.
- A single `writeCells` call can write at most 10,000 cells.
- `readSheetObjects` currently accepts `charts`, `filters`, `tables`, and `pivotTables`; exact support is defined by Core projections and tests. Chart summaries are paged with `offset`, `limit`, and `nextOffset`.
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
