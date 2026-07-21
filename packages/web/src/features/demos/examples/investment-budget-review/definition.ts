import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });

export const investmentBudgetReviewDemo = createAnalysisScenario({
  id: "investment-budget-review",
  marketing: {
    category: "财务",
    marketingTitle: "投资预算审查",
    summary: "逐项重算工程预算和资金来源，识别超预算项目、账面差异与资金缺口。",
    coverImage: "/demo-covers/investment-budget.webp",
    coverAlt: "工程人员在施工现场讨论项目计划",
    proofMetric: "6 个项目 · 逐项重算",
    featuredOrder: 12,
    theme: "sand",
  },
  workspaceId: -120,
  workspaceName: "投资分析演示",
  sessionName: "投资核算审核 Demo",
  prompt:
    "请审核投资估算表，逐项重算建筑、设备、安装和其他费用的合计，核对资金来源是否覆盖投资总额，并生成核算复核表，标记所有差异和风险。",
  workbookName: "产业园投资估算审核",
  sourceSheets: [
    {
      name: "投资估算",
      columns: ["编号", "项目", "建筑工程费", "设备购置费", "安装工程费", "其他费用", "账面合计"],
      rows: [
        demoRow(
          "A01",
          "土建工程",
          money(3200000),
          money(0),
          money(280000),
          money(120000),
          money(3600000),
        ),
        demoRow(
          "A02",
          "生产设备",
          money(0),
          money(4850000),
          money(420000),
          money(80000),
          money(5350000),
        ),
        demoRow(
          "A03",
          "环保设施",
          money(460000),
          money(760000),
          money(160000),
          money(50000),
          money(1430000),
        ),
        demoRow(
          "A04",
          "仓储物流",
          money(1280000),
          money(620000),
          money(90000),
          money(60000),
          money(2100000),
        ),
        demoRow(
          "A05",
          "信息化系统",
          money(0),
          money(980000),
          money(180000),
          money(140000),
          money(1300000),
        ),
        demoRow("A06", "预备费", money(0), money(0), money(0), money(640000), money(640000)),
      ],
    },
    {
      name: "资金来源",
      columns: ["资金来源", "金额", "计划占比"],
      rows: [
        demoRow("企业自筹", money(6200000), demoCell(0.42, { numberFormat: "0.00%" })),
        demoRow("银行贷款", money(6800000), demoCell(0.46, { numberFormat: "0.00%" })),
        demoRow("专项补助", money(1500000), demoCell(0.12, { numberFormat: "0.00%" })),
      ],
    },
  ],
  resultSheet: {
    name: "核算复核",
    columns: ["编号", "项目", "账面合计", "重算合计", "差异", "审核结论"],
    rows: [
      demoRow("A01", "土建工程", money(3600000), money(3600000), money(0), resultCell("通过")),
      demoRow("A02", "生产设备", money(5350000), money(5350000), money(0), resultCell("通过")),
      demoRow("A03", "环保设施", money(1430000), money(1430000), money(0), resultCell("通过")),
      demoRow(
        "A04",
        "仓储物流",
        money(2100000),
        money(2050000),
        money(-50000),
        resultCell("合计多计 50,000", "danger"),
      ),
      demoRow("A05", "信息化系统", money(1300000), money(1300000), money(0), resultCell("通过")),
      demoRow("A06", "预备费", money(640000), money(640000), money(0), resultCell("通过")),
      demoRow(
        "TOTAL",
        "投资总额",
        money(14420000),
        money(14370000),
        money(-50000),
        resultCell("资金来源覆盖，结余 130,000", "warning"),
      ),
    ],
  },
  analysisSteps: [
    {
      id: "read-budget",
      title: "读取投资估算",
      assistantText: "我先读取投资估算的分项结构，逐行识别建筑、设备、安装、其他费用和账面合计。",
      toolInput: "读取「投资估算」A1:G7，识别各费用列和账面合计",
      toolOutput: "读取 6 个投资项目，账面投资总额 14,420,000 元",
      activeSheet: "投资估算",
      highlight: "A1:G7",
    },
    {
      id: "recalculate-totals",
      title: "逐项重算合计",
      assistantText:
        "逐项重算后，仓储物流的四项费用合计应为 205 万元，但账面记录为 210 万元，存在 5 万元差异。",
      toolInput: "重新计算每行 C:F 的加总，并与 G 列账面合计比较",
      toolOutput: "A04 仓储物流重算 2,050,000 元，账面 2,100,000 元，多计 50,000 元；其余项目一致",
      activeSheet: "投资估算",
      highlight: "C2:G7",
    },
    {
      id: "review-funding",
      title: "核对资金来源",
      assistantText:
        "资金来源合计 1450 万元，可以覆盖重算后的 1437 万元投资额，预计结余 13 万元；计划占比加总为 100%。",
      toolInput: "读取「资金来源」A1:C4，核对金额合计、占比和投资覆盖情况",
      toolOutput: "资金来源合计 14,500,000 元，占比 100%；覆盖重算投资额后结余 130,000 元",
      activeSheet: "资金来源",
      highlight: "A1:C4",
    },
  ],
  writeTitle: "生成核算复核表",
  writeAssistantText: "我已生成逐项目核算复核表，明确列出账面金额、重算金额、差异和审核结论。",
  writeToolInput: "将逐项重算结果和资金覆盖结论写入「核算复核」A2:F8",
  writeToolOutput: "写入 7 条核算结论，标记 1 项金额差异和 1 项资金结余提示",
  verifyAssistantText:
    "复核表包含全部 6 个项目和总计行，5 万元账面差异及 13 万元资金结余均已正确记录。",
  verifyToolOutput: "6 个项目全部写入；差异合计 -50,000 元；资金来源结余 130,000 元",
  finalText:
    "投资核算审核完成：发现仓储物流项目多计 5 万元，修正后投资总额为 1437 万元，资金来源能够覆盖并结余 13 万元。",
});
