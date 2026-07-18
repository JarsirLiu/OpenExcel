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

### 已有

`packages/core` 已经有以下基础：

- `ChartSpec`、数据区域引用和图表锚点模型；
- 图表新增、修改、删除命令模型；
- 工作簿级 XLSX 导出入口 `workbookToXlsx`；
- 图表、drawing 和 relationship XML 的初步生成器。

### 未完成

当前还不能称为完整的图表功能：

- 数据库没有独立的 Chart 持久化实体；
- 服务端导出仍然传入 `charts: []`；
- AI 工具没有创建、修改、删除图表的入口；
- Web 没有图表状态和渲染层；
- XLSX 导入没有读取 chart、drawing 和关系部件；
- 生成的 OOXML 尚未通过 Excel 实际打开验证；
- `Sheet.config.chart` 仍是旧格式字段，不能作为新功能的数据源。

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

## 4. 交付顺序

必须按以下顺序推进，不跨阶段堆叠临时入口。

### 阶段 A：完成 OOXML 导出闭环

目标：`ChartSpec -> XLSX` 可被真实 Excel 打开。

工作内容：

1. 修正 chart XML 的必需元素和元素顺序；
2. 为柱状、折线、面积、饼图、散点图和组合图分别建立最小合法 XML 模板；
3. 正确生成 worksheet、drawing、chart 三层 relationships；
4. 正确更新 `[Content_Types].xml`；
5. 处理多个 Sheet、多个图表和已有 worksheet relationships；
6. 明确锚点的 0-based 网格坐标和 EMU 偏移规则；
7. 增加真实文件回归测试，而不是只检查字符串存在。

验收：

- Excel 能打开文件且不出现“发现不可读取内容”；
- LibreOffice 能打开文件；
- 图表位置、标题、类型和数据引用正确；
- 没有图表的工作簿导出行为不改变。

### 阶段 B：建立 Chart 持久化

目标：图表成为 Workbook 下的独立持久化对象。

建议数据边界：

```text
Chart
  id / publicId
  workbookId
  sheetId
  order
  spec JSON
  createdAt / updatedAt
```

`spec` 写入前必须通过 core 的 `parseChartSpec`。数据库只负责保存经过校验的领域数据，不能保存未经约束的前端对象。

必须提供：

- 按 Workbook 查询图表；
- 按 Chart ID 查询并校验工作区归属；
- 新增、更新、删除图表；
- 删除 Workbook 时级联删除图表；
- 删除 Sheet 时拒绝或按明确规则处理仍引用该 Sheet 的图表；
- Chart 与 Sheet 的索引。

所有写入都必须进入 Workbook/Sheet 现有事务边界，不能由前端直接写数据库结构。

### 阶段 C：接入真实导出

目标：导出使用数据库中的真实图表。

导出流程：

```text
server export use case
  -> 查询 Workbook、Sheet、Chart
  -> 组装 core XlsxWorkbookInput
  -> workbookToXlsx
  -> 返回下载流
```

必须移除固定的 `charts: []`。server 只负责把持久化领域对象转换为 core 输入，不能处理 XML。

导出器要继续保留未建模但必须保留的 package 部件，避免为了写入图表而丢失其他 Excel 对象。

### 阶段 D：接入 AI 图表工具

目标：AI 通过正式工具创建图表，而不是输出一段 JSON 或修改 Sheet 配置。

第一批工具：

- `createChart`：根据 Workbook/Sheet 和数据区域创建图表；
- `updateChart`：更新标题、类型、系列或锚点；
- `deleteChart`：删除指定图表；
- `listCharts`：读取当前 Workbook/Sheet 的图表摘要。

工具规则：

- 参数使用 Excel 视觉坐标，行列从 1 开始；
- server 工具边界统一转换为 core 的 0-based 坐标；
- 数据区域必须引用真实 Sheet ID；
- 创建前校验范围存在、类型匹配、系列长度一致；
- 写入返回 Chart ID、图表摘要和可用于前端刷新的变更信息；
- 图表变更纳入现有 AI run 快照和一次性撤销规则。

AI 工具只负责请求图表用例，不能自己生成 OOXML，也不能直接操作 ECharts。

### 阶段 E：接入 Web 渲染

目标：前端能在工作表上看到并操作服务端保存的图表。

建议状态流：

```text
GET workbook
  -> sheets + charts
  -> workbook workspace state
  -> chart overlay renderer
```

Web 负责：

- 根据 `ChartSpec` 创建 ECharts 实例；
- 将单元格范围解析为当前数据快照；
- 计算图表在网格中的视觉位置；
- 处理选中、移动、缩放和删除交互；
- 通过 API/AI 变更服务端状态；
- 工作簿刷新后销毁旧实例并重建投影。

Web 不负责：

- 持久化 ECharts option；
- 生成 OOXML；
- 通过 Sheet 配置伪造图表；
- 让本地渲染实例成为数据源。

第一版渲染只覆盖 `ChartSpec` 已支持的基本图表类型。主题、动画和 tooltip 属于派生渲染配置，不写入 Chart 事实模型。

## 5. XLSX 图表导入

图表导入必须在 core 内完成，并复用统一的 XLSX ZIP 安全预检。

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

对于当前 `ChartSpec` 暂不支持的 Excel 图表特性，必须明确采用以下策略之一：

- 完整建模并 round-trip；
- 以受控的原始 OOXML package part 保存并原样保留；
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

## 9. 当前执行顺序

当前只按以下顺序推进：

1. 修正并验证 `ChartSpec -> XLSX`，直到 Excel 可打开；
2. 建立 Chart 持久化和 Workbook 查询契约；
3. 让真实导出读取持久化 Chart；
4. 接入 `createChart/updateChart/deleteChart/listCharts` AI 工具；
5. 接入 Web 图表渲染和交互；
6. 实现 XLSX 图表导入 round-trip；
7. 另行规划 Excel Table、Named Range、PivotTable 等对象。

没有完成前一阶段的验收，不进入下一阶段。
