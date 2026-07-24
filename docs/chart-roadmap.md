# OpenExcel 图表与 Excel 对象路线图

> 本文是图表及相关 Excel 对象的专项设计文档。
> 它不替代 `docs/architecture.md`，也不把图表细节扩散到总架构文档。

## 1. 目标

OpenExcel 的图表能力必须满足以下闭环：

```text
工作表数据
  -> AI 或用户创建 ChartSpec
  -> 服务端校验并持久化
  -> Web 渲染
  -> XLSX OOXML 导出
  -> Excel 重新打开
```

导入方向也必须回到同一个领域模型：

```text
XLSX chart/drawing/rels
  -> core OOXML 解析器
  -> ChartSpec
  -> 服务端持久化
  -> Web 渲染 / AI 查询 / XLSX 导出
```

验收标准不是“ZIP 中存在几个 XML 文件”，而是：

- OpenExcel 创建的图表能被 Excel 和 LibreOffice 打开；
- 导入的图表再次导出后仍保留图表、绘图区、锚点和关系部件；
- AI 创建的图表和用户创建的图表使用同一套数据模型和持久化路径；
- 前端渲染配置变化不会改变 XLSX 的事实来源；
- 工作簿和 Sheet 使用稳定 ID，不使用 Sheet 名称作为对象身份。

## 2. 当前状态

### 已完成

`packages/core` 已经有以下基础：

- `ChartSpec`、数据区域引用和图表锚点模型；
- 图表新增、修改、删除命令模型；
- 工作簿级 XLSX 导出入口 `workbookToXlsx`；

- 图表、drawing 和 relationship XML 的生成器；
- 独立的 Chart 持久化实体和工作簿级真实导出；
- `createChart`、`updateChart`、`deleteChart`、`listCharts` AI 工具及图表撤销快照；
- 基于 `ChartSpec` 的 Web 网格覆盖层、插入入口和锚点交互；
- 基础 XLSX chart、drawing 和 relationship 导入，以及导入批次内的 Sheet key 映射；
- 对当前模型不支持的图表类型和展示属性的显式拒绝；
- Web 与 XLSX 导出共用图表调色板；多系列图表的图例固定在顶部，数据标签默认关闭；
- core 阶段的图表数量和系列数量限制。

### 当前限制与剩余验证

- 生成的 OOXML 尚未通过 Excel 和 LibreOffice 实际打开验证；
- `Sheet.config.chart` 仍是旧格式字段，不能作为新功能的数据源；
- 导入只覆盖 `ChartSpec` 已建模的图表类型和展示属性，不支持的内容必须继续拒绝导入。

AI 或用户图表变更完成后，Web 会通过工作簿刷新契约重新读取 ChartSpec。网格内覆盖层只维护当前交互状态，服务端 ChartSpec 仍是唯一事实来源。

任何“生成一个独立样例文件”的代码都不属于产品能力，样例只能用于格式适配器测试。

## 3. 领域边界

### 3.1 ChartSpec 是唯一领域模型

图表事实数据只允许使用 `ChartSpec` 表达。它至少包含：

- 图表稳定 ID；
- Workbook ID；
- 所属 Sheet ID；
- 图表类型；
- 标题；
- 图表锚点；
- 一个或多个数据系列；
- 每个系列的名称、分类区域和数值区域；
- 组合图每个系列的具体类型。

`ChartSpec` 必须保持与渲染器无关，不包含 ECharts 实例、DOM 引用、组件状态或主题对象。

当前领域契约明确规定：单个数据系列只能引用一行或一列；分类区域和值区域长度必须一致；
多系列图表必须共享同一个分类区域；饼图只能有一个系列；组合图当前只允许柱形、折线和
面积系列。违反这些规则的对象在 `core` 校验阶段拒绝，不由 Web 或导出器猜测含义。

图表依赖由 `core` 的 `chartDependencySheetIds` 统一计算，数据读取由 `resolveChartData`
统一完成。server 的 `ChartMutationService` 是 API、AI 和未来用户操作的唯一写入口，并负责
旧/新图表依赖并集、持久化和撤销快照；工具和路由只负责协议转换。

### 3.2 四层职责

```text
core
  ChartSpec、引用、命令、校验、OOXML 导入导出

server
  Chart 用例、权限、事务、持久化、AI 工具执行、API

web
  图表状态投影、ECharts 渲染、交互和用户操作

agent
  工具契约、参数说明、模型可调用能力，不直接访问数据库或 DOM
```

禁止：

- 把图表塞回 `Sheet.config.chart` 作为新数据源；
- 在 Web 层直接拼 XML；
- 在 server route 中解析或修改 XML；
- 用 ECharts option 作为持久化格式；
- 为导入、AI 创建和用户创建分别设计三套图表结构；
- 用 Sheet 名称替代 Workbook/Sheet ID。

## 4. 当前交付边界

图表已经沿着同一条领域路径接入：`ChartSpec` 是唯一事实模型，server 负责持久化和授权，
AI 与 Web 都通过图表用例读写，core 负责 OOXML 导入导出。ECharts option、DOM 状态和
`Sheet.config.chart` 都不是持久化来源。

当前仍需保持的边界：

- 生成的 XLSX 必须通过 Excel 和 LibreOffice 实际打开验证；
- 不支持的 OOXML 图表特性必须显式拒绝，不能静默丢失；
- 图表引用始终使用稳定的 Workbook/Sheet 身份和 `ChartSpec` 引用模型；
- Excel Table、Named Range、PivotTable、图片等对象按独立对象域处理，不能并入 `ChartSpec`。

## 5. XLSX 图表导入

图表导入必须在 core 内完成，并复用统一的 XLSX ZIP 安全预检。当前已支持
`bar`、`line`、`area`、`pie`、`scatter` 和由柱形/折线/面积组成的 `combo`。
为保证 `ChartSpec -> XLSX` 不改变图表语义，导入会拒绝堆叠/百分比堆叠分组、横向条形图、第二坐标轴组合图、引用单元格的动态图表标题，以及尚未建模的图例、系列样式、数据标签和坐标轴展示属性。
当前导出器和导入器仅对以下受控展示属性保持兼容：多系列非饼图的顶部图例、按共享调色板生成的系列颜色，以及关闭的数据标签。这些属性不是 `ChartSpec` 的独立持久化字段；重新导出时由 core 根据图表类型和系列顺序重建。其他图例位置、可见数据标签、任意系列/坐标轴样式仍会被拒绝，不能静默丢失。
导入结果使用导入批次内的 `sheetKey`，server 在创建 Sheet 后于同一事务映射为数据库 ID。

解析路径：

```text
workbook.xml / workbook.xml.rels
  -> Sheet ID 与 Sheet 名称映射
worksheet.xml / worksheet rels
  -> drawing 关系
drawing.xml / drawing rels
  -> 图表锚点与 chart part
chart*.xml
  -> ChartSpec
```

导入时不能把 Sheet 名称直接写入永久引用。解析器可以使用导入批次内的临时 Sheet key，server 创建 Sheet 后必须在同一事务中完成 key 到数据库 ID 的映射。

导入结果必须扩展为工作簿级 DTO：

```text
ImportedWorkbookInput
  sheets
  charts
```

对于当前 `ChartSpec` 暂不支持的 Excel 图表特性，当前导入采用“拒绝导入”策略；后续
只有在完成领域建模和 round-trip 测试后才能放开：

- 完整建模并 round-trip；
- 导入时报告不支持并阻止产生静默丢失。

不能静默删除图表或关系部件。

## 6. 透视表、Excel Table 等对象

这些对象不是 Chart 的子类型，也不能塞进 `ChartSpec`。应按独立对象域处理。

建议对象域：

```text
WorkbookObject
  - Chart
  - ExcelTable
  - PivotTable
  - Drawing / Image
  - NamedRange
```

当前阶段只完成 Chart。其他对象按以下顺序单独立项：

1. 先定义对象的 core 领域模型和 OOXML parts；
2. 明确能否在 Web 中编辑；
3. 建立导入、持久化、导出 round-trip；
4. 再接 AI 工具。

优先级建议：

1. Excel Table：对数据区域、筛选和结构化引用最有直接价值；
2. Named Range：可作为 AI 和图表引用的稳定语义边界；
3. PivotTable：依赖缓存定义、缓存记录、布局和刷新语义，复杂度高，不能用普通表格 JSON 冒充；
4. 图片和其他 Drawing：需要独立资产存储和 package part 保留策略。

在没有为这些对象定义专门的 round-trip 方案前，不承诺“尽量支持”而静默丢失。

## 7. 测试与质量门槛

每个阶段都要有可重复测试：

### Core

- ChartSpec 校验测试；
- 每种图表类型的 OOXML 生成测试；
- 多图表、多 Sheet、组合图测试；
- XML namespace 和 relationships 完整性测试；
- XLSX package 结构测试；
- Excel/LibreOffice 实际打开验证；
- XLSX 图表导入和导出 round-trip 测试。

### Server

- Chart repository 工作区隔离测试；
- Chart 用例权限、事务和输入校验测试；
- 导入创建 Workbook/Sheet/Chart 的原子性测试；
- AI 工具调用和撤销快照测试；
- 导出查询真实 Chart 的集成测试。

### Web

- Workbook API 类型包含 charts；
- 图表渲染生命周期测试；
- 切换 Workbook/Sheet 时不会残留旧图表；
- AI 创建图表后刷新得到同一 Chart ID；
- 删除和撤销后图表投影正确消失或恢复。

## 8. 明确禁止的做法

- 不在 `Sheet.config.chart` 上继续扩展新功能；
- 不建立独立的“演示图表生成器”代替真实 Workbook 流程；
- 不在 server route 中拼接或修改 XML；
- 不让 ECharts option 成为数据库 schema；
- 不为了兼容旧字段增加双轨读写；
- 不在没有验证 Excel 打开的情况下宣布导出完成；
- 不把透视表、Excel Table 和图表混成一个通用 JSON 补丁对象；
- 不静默丢弃尚未支持的 OOXML 部件。
