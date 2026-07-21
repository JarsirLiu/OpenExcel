import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

export const financialHealthAnalysisDemo = createAnalysisScenario({
  id: "financial-health-analysis",
  marketing: {
    category: "财务",
    marketingTitle: "企业财务健康分析",
    summary: "快速发现现金流、利润与偿债风险，把分散报表变成一张可执行的经营诊断。",
    coverImage: "/demo-covers/financial-health.webp",
    coverAlt: "团队在桌面上讨论财务图表和经营数据",
    proofMetric: "5 类核心指标 · 2 项风险",
    featuredOrder: 3,
    theme: "sage",
  },
  workspaceId: -130,
  workspaceName: "财务分析演示",
  sessionName: "公司财务状况分析 Demo",
  prompt:
    "请分析公司上半年利润表和期末资产负债表，计算收入增长、毛利率、净利率、流动比率和资产负债率，识别经营趋势与财务风险，并生成财务健康诊断表。",
  workbookName: "华辰科技上半年财务报表",
  sourceSheets: [
    {
      name: "月度利润表",
      columns: ["月份", "营业收入", "营业成本", "销售管理费用", "利息费用", "净利润"],
      rows: [
        demoRow("1月", money(3200000), money(2048000), money(720000), money(68000), money(364000)),
        demoRow("2月", money(3380000), money(2129400), money(748000), money(70000), money(402600)),
        demoRow("3月", money(3510000), money(2176200), money(780000), money(72000), money(435600)),
        demoRow("4月", money(3460000), money(2214400), money(806000), money(75000), money(364600)),
        demoRow("5月", money(3720000), money(2306400), money(850000), money(79000), money(484600)),
        demoRow("6月", money(3890000), money(2372900), money(910000), money(84000), money(523100)),
      ],
    },
    {
      name: "资产负债表",
      columns: ["项目", "期初金额", "期末金额"],
      rows: [
        demoRow("流动资产", money(8600000), money(9350000)),
        demoRow("资产总额", money(18200000), money(19800000)),
        demoRow("流动负债", money(5400000), money(6680000)),
        demoRow("负债总额", money(9200000), money(11180000)),
        demoRow("所有者权益", money(9000000), money(8620000)),
      ],
    },
  ],
  resultSheet: {
    name: "财务健康诊断",
    columns: ["指标", "计算结果", "参考区间", "评价", "管理建议"],
    rows: [
      demoRow(
        "收入增长率（1-6月）",
        percent(0.2156),
        ">10%",
        resultCell("良好"),
        "继续巩固高增长客户",
      ),
      demoRow(
        "上半年综合毛利率",
        percent(0.374),
        "35%-45%",
        resultCell("正常"),
        "关注4月成本短期抬升",
      ),
      demoRow("6月净利率", percent(0.1345), ">12%", resultCell("良好"), "控制销售管理费用增速"),
      demoRow(
        "流动比率",
        demoCell(1.4, { numberFormat: "0.00" }),
        ">1.5",
        resultCell("偏低", "warning"),
        "提升短期偿债缓冲",
      ),
      demoRow(
        "资产负债率",
        percent(0.5646),
        "<55%",
        resultCell("偏高", "danger"),
        "压降新增有息负债",
      ),
      demoRow(
        "权益变动",
        percent(-0.0422),
        ">=0",
        resultCell("下降", "danger"),
        "核查分红及资本性支出",
      ),
    ],
  },
  analysisSteps: [
    {
      id: "read-profit-statement",
      title: "读取月度利润",
      assistantText: "我先读取上半年利润表，梳理收入、成本、费用和净利润的月度变化。",
      toolInput: "读取「月度利润表」A1:F7，计算收入、毛利和净利润趋势",
      toolOutput: "上半年收入 21,160,000 元；6月收入较1月增长 21.56%；各月保持盈利",
      activeSheet: "月度利润表",
      highlight: "A1:F7",
    },
    {
      id: "analyze-profitability",
      title: "分析盈利能力",
      assistantText:
        "综合毛利率为 37.4%，处于正常区间；6 月净利率提升到 13.45%，但销售管理费用增速略快于收入。",
      toolInput: "按月计算毛利率和净利率，定位利润波动及费用压力",
      toolOutput: "综合毛利率 37.4%；6月净利率 13.45%；4月净利润环比下降 16.3%",
      activeSheet: "月度利润表",
      highlight: "B2:F7",
    },
    {
      id: "analyze-solvency",
      title: "分析偿债能力",
      assistantText:
        "期末流动比率为 1.40，低于 1.5 的参考线；资产负债率升至 56.46%，同时所有者权益下降，需要关注杠杆增长。",
      toolInput: "读取「资产负债表」A1:C6，计算流动比率、资产负债率和权益变动",
      toolOutput: "流动比率 1.40；资产负债率 56.46%；所有者权益较期初下降 4.22%",
      activeSheet: "资产负债表",
      highlight: "A1:C6",
      toolExecutionDuration: 820,
    },
  ],
  writeTitle: "生成财务健康诊断",
  writeAssistantText:
    "我已把盈利、偿债和资本结构的关键指标整理为财务健康诊断表，并为偏离参考区间的指标附上管理建议。",
  writeToolInput: "将 6 项财务指标、评价和建议写入「财务健康诊断」A2:E7",
  writeToolOutput: "写入 6 项指标；标记 2 项高风险、1 项关注指标和 3 项正常指标",
  verifyAssistantText:
    "复核完成，收入增长、毛利率和净利率计算正确；流动比率、负债率和权益变动与资产负债表一致。",
  verifyToolOutput: "6 项指标均可追溯到源表；高风险 2 项、关注 1 项、正常 3 项",
  finalText:
    "财务状况分析完成：公司盈利保持增长，但短期偿债缓冲下降、资产负债率偏高且权益减少，建议优先控制负债扩张和费用增速。",
});
