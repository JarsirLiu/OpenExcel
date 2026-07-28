# AI Spreadsheet Tools Design

> 本文是 AI 电子表格工具的专项设计文档。它定义模型看到的读取契约、工具边界和上下文优化目标；不会把具体实现细节扩散到架构总览。

## 1. 目标

AI 读取 Excel 时，必须同时满足以下目标：

1. **低 token 成本**：常规数据使用紧凑的二维数组，不为每个单元格重复携带坐标和值字段。
2. **语义不丢失**：保留空单元格、数字零、公式、合并区域和 Excel 坐标关系。
3. **按需读取**：数据、单元格查询和 Excel 对象分开读取，模型只获取当前问题需要的信息。
4. **可分页**：大范围读取由工具主动分页，不能由通用结果压缩器随机截断中间数据。
5. **坐标稳定**：所有模型可见坐标使用 Excel 视觉坐标和 A1 范围；不推断或扣除表头行。
6. **职责清晰**：core 负责纯数据投影，server 负责授权和资源读取，agent 负责工具契约，web 只负责展示。
7. **可扩展**：格式、图表、透视表、批注和命名区域按独立对象边界扩展，不修改基础数据契约。
8. **不使用临时兼容层**：新契约一次性替换旧的稀疏数据返回结构，不保留双轨返回格式。

## 2. 读取工具边界

工具按模型要回答的问题划分，而不是按底层数据库字段划分。

```text
readSheetData       数据、公式模式、合并区域
findSheetCells      按值、公式或格式查找单元格
readSheetObjects    图表、筛选、表格、透视表等 Excel 对象
```

工具之间不互相调用。它们共同依赖 `packages/core` 的纯投影模块。

### 2.1 `readSheetData`

这是模型读取表格内容的主工具。默认返回指定区域的二维数据、合并区域和压缩后的公式信息。

示例：

```json
{
  "workbook": { "id": 6, "name": "销售台账" },
  "sheet": { "id": 4, "name": "4月", "sheetNo": 3 },
  "range": "A1:C5",
  "values": [
    ["商品", "数量", "金额"],
    ["可乐", 12, 120],
    ["雪碧", 0, 0],
    ["芬达", 8, 80],
    ["合计", null, 200]
  ],
  "formulaPatterns": [
    {
      "ranges": ["C2:C4"],
      "formulaR1C1": "=RC[-1]*10"
    }
  ],
  "formulaExceptions": [
    {
      "cell": "C5",
      "formula": "=SUM(C2:C4)"
    }
  ],
  "merges": []
}
```

数据规则：

- `values` 是矩形二维数组，数组下标由 `range` 解释；
- 空单元格使用 `null`；
- 数字 `0` 必须保留为 `0`，不能使用空字符串代替；
- 字符串、数字、布尔值保持原始类型；
- 不根据第一行推断表头；
- `values` 使用缓存的公式结果，公式表达式通过 `formulaPatterns` 或 `formulaExceptions` 返回；
- 公式表达式在同一个工具结果中返回，不要求模型额外调用公式工具；
- 如果公式没有缓存结果，`values` 可以是 `null`，但公式表达式仍必须出现在公式元数据中；
- 不把格式、图表或透视表混入数据数组。

#### 公式压缩

工具读取范围内的公式后，按以下规则压缩：

1. 将公式转换为相对当前单元格的 R1C1 表达式；
2. 相同 R1C1 表达式的单元格归为同一模式；
3. 连续的行列区域合并为 A1 范围；
4. 无法归入模式的公式放入 `formulaExceptions`；
5. 公式模式和异常都只覆盖当前读取范围。

例如：

```text
C2 = B2 * 10
C3 = B3 * 10
C4 = B4 * 10
```

只返回一条：

```json
{
  "ranges": ["C2:C4"],
  "formulaR1C1": "=RC[-1]*10"
}
```

公式归一化必须由 core 的纯函数完成，不能在 server 工具中通过字符串替换或正则表达式实现。绝对引用、混合引用、跨 Sheet 引用、结构化引用和数组公式必须保持语义。

#### 合并区域

合并单元格不复制值。只保留左上角锚点，其余覆盖位置仍为 `null`：

```json
{
  "values": [
    ["销售统计", null, null, null]
  ],
  "merges": [
    {
      "range": "A1:D1",
      "anchor": "A1",
      "rowSpan": 1,
      "colSpan": 4
    }
  ]
}
```

如果请求范围只覆盖合并区域的一部分，工具返回完整合并范围，并标记范围被截断；锚点在请求范围外时同时返回锚点值：

```json
{
  "range": "B1:C1",
  "anchor": "A1",
  "anchorValue": "销售统计",
  "clipped": true
}
```

模型和写入工具都必须把覆盖单元格视为合并区域的一部分，只有锚点是可写的数据单元格。

#### 分页

工具按照网格单元格预算限制读取范围。超出预算时返回完整的当前矩形和明确的下一范围：

```json
{
  "range": "A1:Z40",
  "continuation": {
    "requestedRange": "A1:Z80",
    "nextRow": 41,
    "nextCol": 1
  }
}
```

`continuation` 是结构化游标，模型下一次调用时原样传回即可。窄表按完整列宽分页行，超宽表按当前行的列块分页；行和列都超限时仍然保持连续、无重复、无遗漏。不能只返回一个模糊的 `hasMore=true`，也不能由通用预算器保留头尾行后丢弃中间行。

### 2.2 `findSheetCells`

该工具只负责定位，不负责返回单元格内容、完整样式或对象详情。`range` 是可选的 A1 搜索范围；未传时使用 Sheet 的已使用区域。例如用户说“找出绿色的列”：

```json
{
  "sheetId": 4,
  "range": "A1:R100",
  "query": { "style": { "fill": "#92D050" } }
}
```

结果只返回匹配位置和查询原因：

```json
{
  "matches": [
    { "range": "E2:E12", "count": 11, "reason": "fill=#92D050" }
  ]
}
```

后续模型再调用 `readSheetData` 读取这些区域。查询条件可以逐步支持：

- 单元格值或值类型；
- 公式存在、公式模式或精确公式；
- 直接填充色、字体色、加粗、数字格式；
- 多个条件的 AND 组合。

查询规则：

- `valueType: "empty"` 会把范围内未持久化的单元格和值为 `""` 的单元格都视为空，但不会把 `0` 或有公式的单元格视为空；
- 空单元格查询必须使用有界范围，超过查询单元格上限时工具会报错，要求缩小范围，不会静默截断；
- 不在数据值中写入“黄色”“红色”等人为标记；
- 只返回匹配的连续区域或单元格，不返回整张表的样式矩阵；
- 相邻且查询结果相同的单元格合并为一个 A1 范围；
- 颜色值统一为规范化的 RGB/ARGB 表示；
- 直接单元格格式与条件格式分开，不能把条件格式计算出的颜色伪装成直接填充色；
- 查询工具不负责把匹配结果转换成写入操作，写入仍由格式修改工具负责。

### 2.3 `readSheetObjects`

该工具读取 Excel 中不属于普通单元格值的对象。每次调用必须指定 `objectType`，不能默认把所有对象一次性返回：

```json
{
  "sheetId": 4,
  "objectType": "charts"
}
```

返回模型决策所需的对象摘要：

```json
{
  "objects": [
    {
      "kind": "chart",
      "id": "chart-1",
      "type": "bar",
      "title": "销售统计",
      "anchor": "H2:N16",
      "series": [
        {
          "name": "金额",
          "categoryRange": "A3:A12",
          "valueRange": "C3:C12"
        }
      ]
    }
  ],
  "next": null
}
```

`objectType` 的取值包括 `charts`、`filters`、`tables` 和 `pivotTables`。对象工具只返回模型决策所需的摘要，不返回 OOXML、ECharts option 或完整绘图缓存。当前只有图表和筛选已建模；调用 `tables` 或 `pivotTables` 会明确报告尚未建模，不会返回空数组。后续对象类型必须分别拥有导入、存储和 core 投影边界，不能在一个实现文件中合并成通用 JSON。

### 2.4 `createChart` 与图表写入契约

图表写入工具使用独立的 `ChartSpec` 对象，不把图表配置混入单元格数据。`createChart` 的输入至少包含工作簿、Sheet、图表类型、显式锚点和连续数据源范围：

```json
{
  "workbookId": 6,
  "sheetId": 4,
  "type": "bar",
  "title": "销售统计",
  "anchor": {
    "kind": "twoCell",
    "from": { "row": 2, "col": 8 },
    "to": { "row": 16, "col": 14 }
  },
  "sourceRange": {
    "sheetId": 4,
    "startRow": 1,
    "startCol": 1,
    "endRow": 12,
    "endCol": 4
  }
}
```

约束如下：

- `anchor` 必须是扁平对象，不能传字符串范围或嵌套 `oneOf`；`twoCell` 适合随行列布局调整，`oneCell` 和 `absolute` 适合需要固定尺寸的场景；
- 锚点和数据范围的行列号从 1 开始，server 会在进入 core 前转换为 0-based 坐标；图表位置没有随机默认值，调用方必须明确传入锚点；
- `sourceRange` 必须是连续矩形，系统按 Excel 规则将首行作为系列标题、首列作为分类，并生成实际系列引用，不需要传入具体数据值；
- 组合图可以额外传入 `seriesTypes`，每个系列只能是 `bar`、`line` 或 `area`；
- `updateChart` 使用相同的锚点结构，`listCharts` 返回持久化后的锚点和数据引用；图表变更完成后，Web 通过工作簿刷新契约重新读取 ChartSpec。

### 2.5 大型 Sheet 的认知工具

工作簿和 Sheet 的身份清单由会话上下文默认注入，工具不重复提供工作簿目录工具。工具只负责在模型已经知道 `workbookId` 和 `sheetId` 后，按需建立对目标 Sheet 的认知。

对于上万行数据，模型不应该通过连续调用 `readSheetData` 读取整张表。工具分工应当是：

```text
inspectSheet       建立 Sheet 结构画像
findSheetCells     定位值、公式或格式匹配区域
analyzeSheetRange  在 server 侧统计、聚合和审计
readSheetData      读取定位后的少量精确区域
readSheetObjects   读取图表、筛选、表格等对象摘要
```

#### `inspectSheet`

这是只读的 Sheet 结构画像工具，不返回完整二维数据。输入只需要 `sheetId` 和可选的 `include` 项：

```json
{
  "sheetId": 4,
  "include": ["schema", "samples", "formulas", "formats", "objects"]
}
```

返回内容包括：

- used range、行列数和数据区域候选；
- 表头候选及其置信信息；
- 文本、数字、日期、公式和混合列的类型摘要；
- 前几行、后几行和非空样本；
- 公式数量、公式模式和公式异常数量；
- 空值、错误值和重复值统计；
- 主要数字格式、表头格式和格式区域；
- 合并、筛选、图表、表格和透视表的对象摘要。

它只返回统计、样本和引用，不返回完整单元格矩阵。画像必须带有 `sheetId` 和 `revision`，模型不能把旧 revision 的画像用于写入决策。

#### `analyzeSheetRange`

这是 server 侧分析工具，不把原始大范围数据传给模型。输入包含 `sheetId`、A1 `range`、分析操作、分组列、值列和结果上限。初始操作建议包括：

- `summary`：行数、列数、数值统计、空值率和错误值；
- `distinct`：去重值及频次；
- `group`：按列分组聚合；
- `top` / `bottom`：最大或最小的前 N 项；
- `formulaAudit`：公式覆盖率、模式和异常；
- `nulls` / `errors`：空值和错误位置摘要。

分析结果必须返回结果范围、数据 revision、使用的列和是否截断，不返回没有边界的巨大数组。分析工具只读，不负责写入、格式化或生成图表。

#### `findSheetCells` 的分页约束

`findSheetCells` 继续作为定位工具的唯一契约，不另起一套功能重复的 `searchSheet` 工具。它必须支持明确的 `limit` 和结构化 `cursor`，并可选返回有限的上下文范围。默认结果不能因为命中数量过大而无限扩张；模型应当先定位，再调用 `readSheetData` 读取具体区域。

### 2.6 工具能力与数据持久化边界

工具不拥有第二份权威 Sheet 数据。持久化和查询分成两个层次：

```text
SheetSnapshot                         权威数据源
  -> SheetReadIndex(sheetId, revision) 可重建的派生读取模型
  -> inspect/find/analyze/read          模型工具查询
```

第一阶段保留现有 Sheet 快照作为权威数据，新增按 `sheetId + revision` 标识的派生读取索引。索引可以包含 used range、区域统计、表头候选、公式索引、文本索引、格式指纹、对象索引和按行块统计。写入或结构变更提交新 revision 后，旧索引失效，新索引可以延迟构建。

索引必须满足以下约束：

- 可以从权威快照完全重建；
- 不参与写入正确性、撤销判断或图表定义持久化；
- revision 不一致时不能返回给模型；
- 索引构建失败不能破坏 Sheet 写入；
- 查询必须有扫描范围、结果上限和取消边界。

如果数据规模继续增长到几十万或百万级单元格，再将单块 JSON 快照演进为按行块或区域块存储。不要直接把每个单元格拆成一条数据库记录；这会放大写入事务、格式维护、合并维护和撤销快照的复杂度。区域块是性能优化，不能成为第二套业务状态。

## 3. 模块职责

```text
FortuneCell / Sheet config / ChartSpec / Excel object state
                         |
                         v
packages/core
  sheetDataProjection       值、公式模式、合并区域、分页
  sheetCellQuery             值/公式/直接格式定位
  sheetObjectProjection      图表、筛选、表格、透视表摘要
  sheetProfileProjection     Sheet 结构、类型、样本和统计摘要
  sheetRangeAnalysis         有界范围的纯统计和聚合
                         |
                         v
packages/server
  授权、读取 Sheet、调用 core 投影、执行工具
  SheetReadIndex 的构建、revision 校验和失效管理
                         |
                         v
packages/agent
  Zod 输入契约、工具目录、模型说明和结果预算
```

约束：

- core 投影函数必须是纯函数，不访问数据库、模型或 React；
- server 不解释 FortuneSheet 原始配置之外的模型语义；
- agent 不访问 Prisma、FortuneSheet 或 OOXML；
- web 只读取工具结果渲染预览，不重新推断公式、坐标或格式；
- 不在一个工具文件中实现数据、查询和对象读取的全部逻辑。

## 4. 上下文优化策略

### 默认结果

工作空间下的工作簿和 Sheet 身份清单由会话上下文默认注入，不属于本专项工具。工具调用只需要引用已经注入的稳定 ID。

默认的精确数据读取只包含：

- Sheet 身份；
- 请求范围；
- 二维 `values`；
- 合并区域；
- 压缩后的公式模式。

单元格查询和图表、筛选、表格、透视表等对象都必须按需读取。

大型 Sheet 的默认认知流程是：

```text
默认上下文：工作簿和 Sheet ID/name
  -> inspectSheet：结构画像、样本和对象引用
  -> findSheetCells：定位值、公式或格式
  -> analyzeSheetRange：服务端统计、聚合或审计
  -> readSheetData：读取少量关键范围
  -> 独立修改工具：执行写入、格式或图表变更
```

模型不应通过分页读取完整 Sheet 来完成常规理解。只有用户明确要求逐行检查、导出或精确核对时，才允许持续消费 `readSheetData` 的 continuation。

### 预算规则

- 工具自身负责把结果限制在可返回的矩形范围内；
- 结果预算器不能对二维数据做头尾抽样或随机删行；
- 大范围结果必须返回明确的 `continuation`；
- 每次分页应保持连续坐标，模型可以无歧义地拼接结果；
- 公式模式、匹配区域和对象摘要优先于重复的逐格元数据；
- 只有模型明确要求精确公式或精确格式时，才返回高密度明细。

### 典型调用流程

```text
“读取销售表”
  -> readSheetData

“找出绿色的商品列并读取数据”
  -> findSheetCells(style)
  -> readSheetData(range)

“检查这一列的公式是否统一”
  -> readSheetData(range)
  -> 查看 formulaPatterns 和 formulaExceptions

“这个 Sheet 有哪些图表和筛选”
  -> readSheetObjects

“理解这个 Sheet 的结构”
  -> inspectSheet

“统计每个部门的金额并找出异常”
  -> inspectSheet
  -> analyzeSheetRange
  -> readSheetData（只读取异常或需要展示的范围）
```

## 5. 验收标准

- 一个普通数据区域的结果主要由二维数组构成，没有逐单元格包装对象；
- 空单元格和合并覆盖单元格不会被误认为数字零或普通数据；
- 公式列使用统一模式时只返回一条模式；
- 公式不统一时只返回必要的异常公式，并支持范围分页；
- 颜色查询不改变 `values` 的类型和值，只返回匹配范围；
- 相同查询结果的连续单元格只返回一个匹配范围；
- 大范围读取不会被通用结果压缩器随机截断；
- 模型可以仅凭 A1 范围、二维数组、公式模式和合并区域准确定位单元格；
- 数据、查询和 Excel 对象模块可以独立测试和演进。
- `inspectSheet` 不返回完整数据矩阵，但能让模型知道目标区域、数据类型、公式、格式和对象摘要。
- 大范围统计在 server/core 侧完成，模型只接收有界的聚合结果。
- `SheetReadIndex` 只能由 `SheetSnapshot + revision` 重建，不能成为第二份权威数据。
- 旧 revision 的画像、索引和分析结果不会被用于新的写入决策。
