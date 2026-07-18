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
