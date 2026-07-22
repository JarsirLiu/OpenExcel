# Engineering Issues

## Excel Table 与 PivotTable 对象模型

- **状态**：待处理
- **范围**：XLSX OOXML 导入、持久化、core 对象投影和 AI `readSheetObjects`

当前 `readSheetObjects` 只对图表和筛选提供真实投影。Table 与 PivotTable 尚未形成从 OOXML
导入到存储再到工具读取的完整对象模型，因此调用对应对象类型会明确报告“尚未建模”，不会把
缺失对象伪装成空数组。

后续实现必须沿着 `WorkbookObjectImporter -> SheetObjectStore -> SheetObjectRepository ->
SheetObjectProjection` 建立统一生命周期，并覆盖导入、前端展示、AI 读取和 XLSX 导出的一致性
测试。完成前不要在 `readSheetObjects` 或 FortuneSheet 配置上增加临时字段解析。

## FortuneSheet 单元格筛选自动扩展

- **状态**：延期
- **范围**：FortuneSheet 筛选核心与公开 API
- **记录时间**：2026-07-19

### 当前基本能力

OpenExcel 使用 FortuneSheet 原生筛选能力。用户先选中完整的矩形数据区域，再通过工具栏或
右键菜单创建筛选；筛选条件、隐藏行、`filter` 和 `filter_select` 均由 FortuneSheet 管理，
工作表保存时继续由 OpenExcel 持久化，Excel 导入导出继续使用 `filter_select`。

当前不在 OpenExcel 中通过 DOM 菜单文本监听或额外的全局包围盒算法修改筛选范围。这样可以
避免筛选 UI、筛选计算和持久化形成第二套实现。

### 延期问题

FortuneSheet `1.0.4` 在只有一个活动单元格时，只能根据当前行生成初始列范围，不能像
Luckysheet 一样自动向下扩展到当前连续数据区域。这个行为属于电子表格组件的筛选核心，
不是 OpenExcel 的 Excel 导入适配逻辑。

后续应在项目维护的 FortuneSheet fork 中增加正式的 `createFilter(range?)` API，并将连续
数据区域推断放在 FortuneSheet 核心内部。OpenExcel 只传递选区并保存组件产生的筛选状态，
不再依赖 CSS 选择器、菜单显示文本或事件时序。

### 验收条件

- 单元格、空行、空列分隔的多个数据区域不会互相包含；
- 单元格、单行选区和完整矩形选区的筛选范围规则有明确测试；
- 筛选条件、隐藏行和 `filter_select` 在保存、重新加载和 XLSX round-trip 后一致；
- OpenExcel 不包含独立筛选计算器或筛选创建 DOM 事件适配器。

## Sheet Sync 后续治理

- **状态**：非阻断，按部署规模和数据量处理
- 图表写入、Undo checkpoint 和实际 mutation 仍需收口到同一个事务应用服务，避免异常时状态需要人工排查。
- `withWorkspaceUndoLock` 当前是进程内锁；多实例部署前应替换为数据库锁或分布式锁。
- mutation receipt 需要保留窗口和清理任务；手动快照写入需要增加 celldata、配置和合并数量预算。

这些问题当前不会阻止单实例下的正常编辑、AI 修改或撤销，也不会改变已有的 revision 冲突保护。后续分别通过事务化图表服务、跨实例写入协调和受限的幂等/快照存储策略解决。
