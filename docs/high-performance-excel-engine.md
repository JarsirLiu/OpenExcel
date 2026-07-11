
# High Performance Excel Engine Architecture

## Background

OpenExcel 当前已经具备工作区、工作簿、多 Sheet、Excel 导入导出、基础单元格编辑和 AI 工具调用能力。现有 Sheet 内容主要围绕 Fortune Sheet 的 `celldata/config/merges` 格式持久化。

这套方案适合 MVP 和中小型表格，但不适合作为长期 Excel 引擎基础。主要问题包括：

- Sheet 内容偏向整表 JSON 保存，面对大数据量编辑时会产生较高序列化、网络和数据库写入成本。
- 数据格式与 Fortune Sheet 强耦合，后续迁移 Univer 或自研渲染引擎时成本较高。
- 图表、透视表、图片、批注、条件格式等对象没有清晰的持久化位置。
- AI 工具直接操作单元格数据格式时，难以支持稳定的 range patch、撤销、历史记录和协作。
- 公式计算、依赖图、脏单元格重算、透视缓存等能力无法自然扩展。

因此，需要把 OpenExcel 从“表格组件应用”逐步升级为“拥有独立文档引擎的 Excel 工作区”。

## Goals

本次高性能 Excel 引擎重构目标：

- 保留现有业务层模型：Workspace、Workbook、Sheet、Session、AI 对话和权限体系。
- 引入 OpenExcel 自有文档模型，避免长期依赖 Fortune Sheet 内部格式。
- 支持大表按视口加载，而不是整张 Sheet 一次性加载。
- 支持单元格、范围、样式、合并、图表、透视表等对象级别持久化。
- 支持增量编辑操作记录，为撤销、历史、协作和 AI 工具调用提供基础。
- 为后续迁移 Univer 或接入其他渲染器提供 Adapter 层。
- 为公式依赖图、透视表、图表、百万级数据优化预留结构。

## Non Goals

第一阶段不直接完成以下能力：

- 不一次性替换 Fortune Sheet 前端组件。
- 不承诺完整兼容 Excel 原生图表、透视表和宏。
- 不实现完整 Excel 公式计算引擎。
- 不把每个单元格都拆成数据库一行。
- 不做多人实时协同的完整 CRDT/OT 实现。

第一阶段目标是落地高性能文档引擎底座，让现有功能可以逐步迁移。

## Architecture Overview

目标架构：

```text
Workspace / Workbook / Permission / AI Session
                    |
                    v
          OpenExcel Document Service
                    |
                    v
  OpenExcel Document Model + Operation Log
                    |
                    v
        Editor Adapter / Import Export Adapter
                    |
                    v
        Fortune Sheet / Univer / Other Renderer
```

文档层不再直接保存组件私有数据，而保存 OpenExcel 自己的结构：

```text
Workbook
  └─ Sheet
      ├─ SheetChunk[]
      ├─ SheetOperation[]
      ├─ CellStyle[]
      ├─ SheetObject[]
      ├─ FormulaCell[]
      ├─ PivotTable[]
      └─ SnapshotMetadata
```

## Sheet Metadata

现有 `Sheet` 模型应保留，但需要增加文档格式相关字段：

```prisma
model Sheet {
  id               String   @id @default(cuid())
  workbookId       String
  name             String
  order            Int

  documentFormat   String   @default("fortune-celldata-v1")
  documentVersion  Int      @default(1)
  documentRevision Int      @default(0)

  uploadedData     Json?
  config           Json?
  merges           Json?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

字段含义：

- `documentFormat`: 当前 Sheet 内容格式，例如 `fortune-celldata-v1`、`openexcel-document-v1`、`univer-snapshot-v1`。
- `documentVersion`: 文档模型版本，用于后续 schema migration。
- `documentRevision`: 当前 Sheet 最新 revision，用于增量操作、并发校验和快照回放。
- `uploadedData/config/merges`: 第一阶段保留，用于兼容现有 Fortune Sheet 逻辑。

## Chunked Cell Storage

大表不能依赖整表 JSON 覆盖保存。OpenExcel 文档模型应按块保存单元格。

推荐块大小：

```text
128 rows x 64 columns
```

或根据性能测试调整为：

```text
256 rows x 64 columns
```

Prisma 草案：

```prisma
model SheetChunk {
  id        String   @id @default(cuid())
  sheetId   String
  rowBlock  Int
  colBlock  Int

  revision  Int
  codec     String   @default("json-v1")
  data      Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([sheetId, rowBlock, colBlock])
  @@index([sheetId, rowBlock])
  @@index([sheetId, colBlock])
}
```

Chunk 内只保存非空单元格：

```json
{
  "cells": {
    "0,0": { "v": "Name", "t": "s", "s": "style_1" },
    "0,1": { "v": "Sales", "t": "s", "s": "style_1" },
    "1,1": { "v": 1200, "t": "n", "s": "style_2" }
  }
}
```

坐标说明：

- `rowBlock = floor(row / CHUNK_ROW_SIZE)`
- `colBlock = floor(col / CHUNK_COL_SIZE)`
- chunk 内部坐标为局部 row/col offset。

这样读取视口 `A1:Z200` 时，只查询相关 chunks；编辑一个单元格时，只更新对应 chunk。

## Operation Log

所有编辑应先表达为操作，而不是只保存最终 JSON。

```prisma
model SheetOperation {
  id         String   @id @default(cuid())
  workbookId String
  sheetId    String
  revision   Int
  actorId    String?

  type       String
  payload    Json

  createdAt  DateTime @default(now())

  @@unique([sheetId, revision])
  @@index([sheetId, revision])
  @@index([workbookId, createdAt])
}
```

操作示例：

```json
{
  "type": "setRangeValues",
  "range": "A1:D20",
  "values": [
    ["Name", "Jan", "Feb", "Mar"],
    ["East", 120, 180, 220]
  ]
}
```

```json
{
  "type": "mergeCells",
  "range": "A1:D1"
}
```

```json
{
  "type": "createChart",
  "chartId": "chart_01",
  "chartType": "bar",
  "sourceRange": "A1:D20"
}
```

Operation Log 用途：

- 撤销/重做
- 历史记录
- AI 工具调用审计
- 协作同步基础
- Snapshot 回放
- Debug 和数据恢复

## Snapshot Strategy

Operation Log 不能无限增长。系统应定期把操作物化进 chunks。

推荐策略：

```text
revision 1 - 1000       operation log
revision 1000           materialized chunk snapshot
revision 1001 - 1200    new operation log
```

打开 Sheet 时：

```text
load latest materialized chunks
+
replay operations after snapshot revision
```

第一阶段可以同步更新 chunk 和 operation；后续可以引入异步 compaction。

## Cell Style Table

样式不应重复写入每个单元格。Excel 表格样式重复率很高，应引入样式去重表。

```prisma
model CellStyle {
  id         String   @id @default(cuid())
  workbookId String
  hash       String
  data       Json

  createdAt  DateTime @default(now())

  @@unique([workbookId, hash])
  @@index([workbookId])
}
```

单元格只保存 style id：

```json
{
  "v": 1200,
  "t": "n",
  "s": "style_2"
}
```

这样可以显著降低大表数据体积，也方便后续主题、批量样式更新和 Excel 导出。

## Sheet Objects

图表、图片、批注、控件、透视表视图都不应塞进 `celldata`。

```prisma
model SheetObject {
  id        String   @id @default(cuid())
  sheetId   String

  type      String
  position  Json
  data      Json

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([sheetId, type])
}
```

图表示例：

```json
{
  "type": "chart",
  "position": {
    "startRow": 1,
    "startColumn": 6,
    "endRow": 18,
    "endColumn": 14
  },
  "data": {
    "chartType": "bar",
    "source": {
      "type": "range",
      "range": "A1:D20"
    },
    "encoding": {
      "category": "A",
      "series": ["B", "C", "D"]
    },
    "options": {
      "title": "Monthly Sales"
    }
  }
}
```

这使 AI 工具可以通过 `createChart`、`updateChart`、`deleteChart` 操作图表，而不是直接操作前端组件实例。

## Formula Index

公式不应只作为普通字符串处理。至少需要建立公式索引。

```prisma
model FormulaCell {
  id          String @id @default(cuid())
  sheetId     String
  address     String

  formula     String
  ast         Json?
  deps        Json?
  cachedValue Json?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([sheetId, address])
  @@index([sheetId])
}
```

长期目标：

```text
A1 changed
  -> mark dependent formulas dirty
  -> recalculate affected dependency graph only
  -> update cached values
```

第一阶段只建立数据结构，不实现完整公式引擎。

## Pivot Table Model

透视表不是普通单元格结果，需要独立模型。

```prisma
model PivotTable {
  id        String   @id @default(cuid())
  sheetId   String

  source    Json
  rows      Json
  columns   Json
  values    Json
  filters   Json
  layout    Json?
  cache     Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([sheetId])
}
```

示例：

```json
{
  "source": {
    "type": "range",
    "range": "Data!A1:H50000"
  },
  "rows": ["region"],
  "columns": ["month"],
  "values": [
    { "field": "sales", "aggregate": "sum" }
  ],
  "filters": [
    { "field": "year", "op": "=", "value": 2026 }
  ]
}
```

透视图应作为 `SheetObject(type = "chart")`，并通过 `source.type = "pivot"` 引用 `pivotTableId`。

## Document Adapter

前端、AI 工具和导入导出不应直接依赖 Fortune Sheet 数据结构。

应新增统一接口：

```ts
export interface DocumentAdapter {
  readRange(input: ReadRangeInput): Promise<RangeData>;
  writeRange(input: WriteRangeInput): Promise<DocumentMutationResult>;
  clearRange(input: ClearRangeInput): Promise<DocumentMutationResult>;
  mergeCells(input: MergeCellsInput): Promise<DocumentMutationResult>;
  unmergeCells(input: UnmergeCellsInput): Promise<DocumentMutationResult>;
  listObjects(input: ListObjectsInput): Promise<SheetObject[]>;
  createObject(input: CreateObjectInput): Promise<DocumentMutationResult>;
  updateObject(input: UpdateObjectInput): Promise<DocumentMutationResult>;
  deleteObject(input: DeleteObjectInput): Promise<DocumentMutationResult>;
}
```

第一阶段实现：

```text
FortuneDocumentAdapter
OpenExcelDocumentAdapter
```

现有 UI 可以继续使用 Fortune Sheet，但服务端和 AI 工具逐步迁移到 adapter API。

## AI Tool Design

AI 工具不要直接读写 `celldata`。应调用文档级工具：

```text
read_range
write_range
clear_range
merge_cells
create_chart
update_chart
delete_chart
create_pivot_table
```

工具调用结果必须返回：

```json
{
  "workbookId": "...",
  "sheetId": "...",
  "revision": 42,
  "changedRanges": ["A1:D20"],
  "createdObjects": ["chart_01"]
}
```

这样前端可以按 revision 和 changed range 局部刷新。

## Migration Strategy

迁移分阶段进行。

### Phase 1: Engine Foundation

- 增加 Prisma schema：`SheetChunk`、`SheetOperation`、`CellStyle`、`SheetObject`、`FormulaCell`、`PivotTable`。
- `Sheet` 增加 `documentFormat`、`documentVersion`、`documentRevision`。
- 在 `packages/core` 新增 document 模块：
  - address/range parser
  - chunk coordinate utilities
  - operation types
  - chunk apply functions
  - Fortune celldata conversion helpers
- 增加单元测试。

### Phase 2: Compatibility Adapter

- 保留 Fortune Sheet 前端。
- 新增 Fortune -> OpenExcel document 转换。
- 新增 OpenExcel document -> Fortune viewport 转换。
- 新接口优先服务 AI 和后端，不影响现有 UI 可用性。

### Phase 3: Range Patch API

- 新增服务端 range patch 接口。
- 编辑单元格时写入 `SheetOperation`。
- 同步更新 `SheetChunk`。
- 前端避免整表保存。

### Phase 4: Sheet Objects

- 实现图表对象持久化。
- 支持 AI 创建和修改普通图表。
- 图表先在项目内渲染，Excel 原生图表导出作为后续增强。

### Phase 5: Formula and Pivot

- 建立公式索引和脏单元格标记。
- 引入透视表模型。
- 透视图通过 chart object 引用 pivot table。

### Phase 6: Univer Migration Option

如果迁移 Univer，保留 OpenExcel 文档模型，通过 Adapter 转换：

```text
OpenExcel Document Model
        |
        v
Univer Adapter
        |
        v
Univer UI
```

不建议把整个系统直接绑定到 Univer snapshot，除非确定长期依赖 Univer Server。

## Performance Principles

- 只加载视口附近 chunks。
- 单元格编辑使用 range patch。
- 样式去重。
- 图表、图片、透视表作为 Sheet object。
- 公式使用依赖图和 dirty recalculation。
- 操作日志定期合并为 snapshot。
- AI 工具只操作文档 API。
- 导入导出通过 adapter，不直接依赖前端组件格式。

## Acceptance Criteria

第一阶段完成后应满足：

- 现有应用仍可启动。
- 现有 Fortune Sheet 编辑器不被破坏。
- Prisma schema 包含新文档引擎模型。
- core 层可以解析 `A1:D20` 这类范围。
- core 层可以把 row/col 映射到 chunk。
- core 层可以对 chunk 应用 `setCell` / `setRangeValues` 操作。
- 单元测试覆盖 range parser、chunk mapping 和 operation apply。
- 后续图表、透视表、Univer 迁移都有明确扩展点。

## Final Direction

OpenExcel 的长期文档模型应遵循：

```text
Do not persist editor-private data as the source of truth.
Persist OpenExcel document data as the source of truth.
Use editor adapters for Fortune, Univer, or other renderers.
```

当前 `Workbook / Sheet / Session / AI` 业务层可以保留。真正需要升级的是 Sheet 内容层：

```text
from:
  Sheet = Fortune celldata JSON

to:
  Sheet = Chunked Cells + Operation Log + Styles + Objects + Formula Index + Pivot Model
```

后续重构完成的验收标准应该是：
移除 Fortune Sheet 后，数据库中的工作簿数据仍然完整。
AI 工具不再读写 Fortune celldata。
换成 Univer 只需要替换 Adapter。
换成自研组件只需要实现渲染层。
导入导出只是转换，不会成为核心数据源。
组件崩溃或更换不会导致业务数据丢失。