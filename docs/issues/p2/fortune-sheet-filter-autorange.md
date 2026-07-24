# FortuneSheet 单元格筛选自动扩展

- **优先级**：P2
- **状态**：延期
- **范围**：FortuneSheet 筛选核心与公开 API
- **记录时间**：2026-07-19

OpenExcel 使用 FortuneSheet 原生筛选能力。用户先选中完整的矩形数据区域，再通过工具栏或右键菜单创建筛选；筛选条件、隐藏行、`filter` 和 `filter_select` 均由 FortuneSheet 管理，工作表保存时继续由 OpenExcel 持久化，Excel 导入导出继续使用 `filter_select`。

FortuneSheet `1.0.4` 在只有一个活动单元格时，只能根据当前行生成初始列范围，不能像 Luckysheet 一样自动向下扩展到当前连续数据区域。这个行为属于电子表格组件的筛选核心，不是 OpenExcel 的 Excel 导入适配逻辑。

后续应在项目维护的 FortuneSheet fork 中增加正式的 `createFilter(range?)` API，并将连续数据区域推断放在 FortuneSheet 核心内部。OpenExcel 只传递选区并保存组件产生的筛选状态，不再依赖 CSS 选择器、菜单显示文本或事件时序。

## 验收条件

- 单元格、空行、空列分隔的多个数据区域不会互相包含；
- 单元格、单行选区和完整矩形选区的筛选范围规则有明确测试；
- 筛选条件、隐藏行和 `filter_select` 在保存、重新加载和 XLSX round-trip 后一致；
- OpenExcel 不包含独立筛选计算器或筛选创建 DOM 事件适配器。
