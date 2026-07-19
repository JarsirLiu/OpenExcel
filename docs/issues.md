# Engineering Issues

## XLSX 解析入口重复加载

- **状态**：已解决
- **范围**：`packages/core/src/importer/spreadsheetFileImporter.ts`
- **发现提交**：`e937423 feat(excel): preserve worksheet auto-filters`

### 问题

历史上的 `.xlsx` 导入流程由两条独立解析链组成：

```text
fortuneExcelAdapter
  ├─ xlsxFilterAdapter
  │    └─ file.arrayBuffer() + JSZip.loadAsync()
  └─ FortuneExcel
       └─ file.arrayBuffer() + JSZip.loadAsync()
```

该问题已经通过移除浏览器解析链、将文件导入收敛到 `core` 的单一项目适配器解决。

### 影响

- 同一个文件被读取并解压两次；
- 导入时 CPU 消耗和内存峰值增加；
- 大文件导入更容易造成浏览器卡顿或内存压力；
- XLSX 安全限制分散在外层元数据解析器，主解析器没有共享同一套解压限制；
- 解析职责分散，后续容易出现元数据与单元格数据不一致。

### 原处理方式

此前暂不改动现有导入链路，原因是：

- 不通过深层 import 使用 FortuneExcel 的内部实现；
- 不在 Web 层继续增加兼容或兜底分支；
- 不在未验证样式、公式、合并和筛选保真度前替换现有 XLSX 解析器。

### 当前实现

当前由 `packages/core/src/importer/spreadsheetFileImporter.ts` 统一调度格式适配器：`.xlsx`
使用 `@corbe30/fortune-excel`，`.xls/.csv` 使用 `xlsx-js-style`；server 负责源文件持久化和
调用，web 不再解析文件。

最终验收标准：

- 一个 XLSX 只由 core 解析入口读取一次；
- 多工作表的 `autoFilter` 不串表；
- 样式、公式、合并和筛选信息均有导入回归测试；
- ZIP 条目数、解压大小等安全限制位于统一解析入口。

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
