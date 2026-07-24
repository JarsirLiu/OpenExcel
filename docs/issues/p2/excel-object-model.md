# Excel Table 与 PivotTable 对象模型

- **优先级**：P2
- **状态**：待处理
- **范围**：XLSX OOXML 导入、持久化、core 对象投影和 AI `readSheetObjects`

当前 `readSheetObjects` 只对图表和筛选提供真实投影。Table 与 PivotTable 尚未形成从 OOXML 导入到存储再到工具读取的完整对象模型，因此调用对应对象类型会明确报告“尚未建模”，不会把缺失对象伪装成空数组。

## 验收条件

- 沿 `WorkbookObjectImporter -> SheetObjectStore -> SheetObjectRepository -> SheetObjectProjection` 建立统一生命周期；
- 覆盖导入、前端展示、AI 读取和 XLSX 导出的一致性测试；
- 完成前不在 `readSheetObjects` 或 FortuneSheet 配置上增加临时字段解析。
