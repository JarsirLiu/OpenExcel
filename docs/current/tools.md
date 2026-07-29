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
- `findSheetCells` returns matching A1-range summaries. Read the data separately when content is needed.
- `writeCells`, `clearCells`, `mergeCells`, and `unmergeCells` use the SheetCommand write boundary.
- A single `writeCells` call can write at most 10,000 cells.
- `readSheetObjects` currently accepts `charts`, `filters`, `tables`, and `pivotTables`; exact support is defined by Core projections and tests.
- Chart tools write the persisted `ChartSpec`; they do not use ECharts options as the domain model.
- Tool outputs must pass schema validation and be converted to model-safe JSON.

## Code entrypoints

- Core contract: `packages/core/src/tools/excelToolContract.ts`
- Core catalog: `packages/core/src/tools/catalog.ts`
- Server registry: `packages/server/src/modules/sessions/chat/toolRegistry.ts`
- Sheet executors: `packages/server/src/modules/sheets/tools/`
- Workbook executors: `packages/server/src/modules/workbooks/tools/`
- Chart executors: `packages/server/src/modules/charts/tools/`
