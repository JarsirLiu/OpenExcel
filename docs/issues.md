# Engineering Issues

## XLSX 解析入口重复加载

- **状态**：暂缓处理
- **范围**：`packages/web/src/features/workbook/import/fortuneExcelAdapter.ts`
- **发现提交**：`e937423 feat(excel): preserve worksheet auto-filters`

### 问题

当前 `.xlsx` 导入流程由两条独立解析链组成：

```text
fortuneExcelAdapter
  ├─ xlsxFilterAdapter
  │    └─ file.arrayBuffer() + JSZip.loadAsync()
  └─ FortuneExcel
       └─ file.arrayBuffer() + JSZip.loadAsync()
```

`@corbe30/fortune-excel` 的公开导入 API 能解析单元格、样式、公式和合并信息，但不返回
`autoFilter`。因此当前 Web 适配层额外解析一次 XLSX，只为读取筛选范围。

### 影响

- 同一个文件被读取并解压两次；
- 导入时 CPU 消耗和内存峰值增加；
- 大文件导入更容易造成浏览器卡顿或内存压力；
- XLSX 安全限制分散在外层元数据解析器，主解析器没有共享同一套解压限制；
- 解析职责分散，后续容易出现元数据与单元格数据不一致。

### 暂缓原因

本问题暂不改动现有导入链路，避免为了消除重复加载而引入更大的格式兼容风险。特别是：

- 不通过深层 import 使用 FortuneExcel 的内部实现；
- 不在 Web 层继续增加兼容或兜底分支；
- 不在未验证样式、公式、合并和筛选保真度前替换现有 XLSX 解析器。

### 后续处理方向

后续若重新处理，应先完成基准文件和性能测试，再选择一种单一解析链：

1. 使用一个能够同时返回单元格、样式、公式、合并和 `autoFilter` 的公开解析 API；或
2. 使用 `xlsx-js-style` 单次读取 XLSX，并由项目内独立适配层统一转换为 FortuneSheet 数据。

最终验收标准：

- 一个 XLSX 只调用一次 `arrayBuffer()`；
- 一个 XLSX 只执行一次 ZIP 加载；
- 多工作表的 `autoFilter` 不串表；
- 样式、公式、合并和筛选信息均有导入回归测试；
- ZIP 条目数、解压大小等安全限制位于统一解析入口。
