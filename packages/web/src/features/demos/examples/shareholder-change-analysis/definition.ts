import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const shares = (value: number) => demoCell(value, { numberFormat: "#,##0" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.00%" });

export const shareholderChangeAnalysisDemo = createAnalysisScenario({
  id: "shareholder-change-analysis",
  marketing: {
    category: "财务",
    marketingTitle: "股东变更分析",
    summary: "自动匹配两期股东名册，还原新进、退出、增持和减持，以及股权集中度变化。",
    coverImage: "/demo-covers/shareholder-change.webp",
    coverAlt: "商务团队在会议桌旁分析企业资料",
    proofMetric: "两期名册 · 4 类变动",
    featuredOrder: 11,
    theme: "slate",
  },
  workspaceId: -140,
  workspaceName: "股权分析演示",
  sessionName: "股东名单变动分析 Demo",
  prompt:
    "请对比一季度和二季度股东名单，按股东名称匹配持股数量和持股比例，识别新进、退出、增持和减持，生成股东变动明细并总结股权集中度变化。",
  workbookName: "云海股份股东名册",
  sourceSheets: [
    {
      name: "2026Q1股东",
      columns: ["股东名称", "股东类型", "持股数量", "持股比例", "排名"],
      rows: [
        demoRow("云海控股集团", "法人", shares(32000000), percent(0.32), 1),
        demoRow("恒远产业基金", "基金", shares(14500000), percent(0.145), 2),
        demoRow("林泽宇", "个人", shares(8200000), percent(0.082), 3),
        demoRow("启航资本", "基金", shares(6800000), percent(0.068), 4),
        demoRow("周明远", "个人", shares(5100000), percent(0.051), 5),
        demoRow("东湖创投", "法人", shares(4300000), percent(0.043), 6),
      ],
    },
    {
      name: "2026Q2股东",
      columns: ["股东名称", "股东类型", "持股数量", "持股比例", "排名"],
      rows: [
        demoRow("云海控股集团", "法人", shares(32000000), percent(0.32), 1),
        demoRow("恒远产业基金", "基金", shares(16800000), percent(0.168), 2),
        demoRow("林泽宇", "个人", shares(6900000), percent(0.069), 3),
        demoRow("启航资本", "基金", shares(7200000), percent(0.072), 4),
        demoRow("新岭价值基金", "基金", shares(5600000), percent(0.056), 5),
        demoRow("东湖创投", "法人", shares(3600000), percent(0.036), 6),
      ],
    },
  ],
  resultSheet: {
    name: "股东变动明细",
    columns: ["股东名称", "Q1持股", "Q2持股", "数量变动", "比例变动", "变动类型"],
    rows: [
      demoRow(
        "恒远产业基金",
        shares(14500000),
        shares(16800000),
        shares(2300000),
        percent(0.023),
        resultCell("增持"),
      ),
      demoRow(
        "林泽宇",
        shares(8200000),
        shares(6900000),
        shares(-1300000),
        percent(-0.013),
        resultCell("减持", "warning"),
      ),
      demoRow(
        "启航资本",
        shares(6800000),
        shares(7200000),
        shares(400000),
        percent(0.004),
        resultCell("增持"),
      ),
      demoRow(
        "周明远",
        shares(5100000),
        shares(0),
        shares(-5100000),
        percent(-0.051),
        resultCell("退出", "danger"),
      ),
      demoRow(
        "新岭价值基金",
        shares(0),
        shares(5600000),
        shares(5600000),
        percent(0.056),
        resultCell("新进"),
      ),
      demoRow(
        "东湖创投",
        shares(4300000),
        shares(3600000),
        shares(-700000),
        percent(-0.007),
        resultCell("减持", "warning"),
      ),
    ],
  },
  analysisSteps: [
    {
      id: "read-q1-shareholders",
      title: "读取一季度股东",
      assistantText: "我先读取一季度股东名册，建立以股东名称为键的持股数量和比例索引。",
      toolInput: "读取「2026Q1股东」A1:E7，建立一季度股东索引",
      toolOutput: "读取 6 名主要股东；前六名合计持股 70.9%",
      activeSheet: "2026Q1股东",
      highlight: "A1:E7",
    },
    {
      id: "read-q2-shareholders",
      title: "读取二季度股东",
      assistantText:
        "二季度名单同样包含 6 名主要股东，其中出现一家新基金，同时一名个人股东不再位列名单。",
      toolInput: "读取「2026Q2股东」A1:E7，与一季度按股东名称匹配",
      toolOutput: "读取 6 名主要股东；新岭价值基金新进，周明远退出",
      activeSheet: "2026Q2股东",
      highlight: "A1:E7",
    },
    {
      id: "compare-holdings",
      title: "计算持股变动",
      assistantText:
        "匹配后发现两名股东增持、两名减持、一名新进和一名退出；恒远产业基金增持 230 万股最明显。",
      toolInput: "逐名计算持股数量和比例变化，并分类新进、退出、增持、减持",
      toolOutput: "增持 2 名、减持 2 名、新进 1 名、退出 1 名；最大增持 2,300,000 股",
      activeSheet: "2026Q2股东",
      highlight: "A2:E7",
      toolExecutionDuration: 860,
    },
  ],
  writeTitle: "生成股东变动明细",
  writeAssistantText: "我已生成股东变动明细，逐名列出两个季度的持股数量、比例差异和变动类型。",
  writeToolInput: "将发生变化的 6 名股东写入「股东变动明细」A2:F7",
  writeToolOutput: "写入 6 条股东变动记录：增持 2、减持 2、新进 1、退出 1",
  verifyAssistantText:
    "复核完成，所有数量差额和比例差额均与两个季度名册一致，新进和退出记录也已正确补零。",
  verifyToolOutput: "6 条变动记录匹配成功；数量变动与季度差额一致",
  finalText:
    "股东变动分析完成：机构资金整体净增持，恒远产业基金增持最明显；周明远退出、新岭价值基金新进，主要股东结构向机构化小幅变化。",
});
