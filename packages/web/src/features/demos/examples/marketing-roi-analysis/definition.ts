import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

export const marketingRoiAnalysisDemo = createAnalysisScenario({
  id: "marketing-roi-analysis",
  marketing: {
    category: "销售",
    marketingTitle: "营销 ROI 分析",
    summary: "贯通投放、线索、订单和收入，判断哪些渠道真正带来回报，哪些预算应该收缩。",
    coverImage: "/demo-covers/marketing-roi.webp",
    coverAlt: "桌面上的营销图表、笔记本和分析工具",
    proofMetric: "5 个渠道 · ROI 4.22",
    featuredOrder: 7,
    theme: "sage",
  },
  workspaceId: -180,
  workspaceName: "营销分析演示",
  sessionName: "多渠道广告投放 ROI 分析 Demo",
  prompt:
    "请核算各广告渠道的点击率、转化率、获客成本和ROI，对比上月表现，识别应增投、优化和缩减的渠道，并生成投放优化清单。",
  workbookName: "品牌广告投放月报",
  sourceSheets: [
    {
      name: "本月投放",
      columns: ["渠道", "投放成本", "曝光量", "点击量", "有效线索", "成交订单", "成交收入"],
      rows: [
        demoRow("搜索广告", money(280000), 4200000, 126000, 5200, 860, money(1180000)),
        demoRow("信息流广告", money(360000), 12800000, 192000, 4100, 610, money(760000)),
        demoRow("短视频达人", money(220000), 6800000, 238000, 3600, 720, money(1040000)),
        demoRow("行业媒体", money(120000), 950000, 28500, 1650, 330, money(520000)),
        demoRow("社群私域", money(60000), 420000, 33600, 2100, 580, money(890000)),
      ],
    },
    {
      name: "上月ROI",
      columns: ["渠道", "上月ROI", "上月获客成本"],
      rows: [
        demoRow("搜索广告", demoCell(3.7, { numberFormat: "0.00" }), money(350)),
        demoRow("信息流广告", demoCell(2.5, { numberFormat: "0.00" }), money(520)),
        demoRow("短视频达人", demoCell(3.9, { numberFormat: "0.00" }), money(330)),
        demoRow("行业媒体", demoCell(4.1, { numberFormat: "0.00" }), money(390)),
        demoRow("社群私域", demoCell(12.8, { numberFormat: "0.00" }), money(112)),
      ],
    },
  ],
  resultSheet: {
    name: "投放优化清单",
    columns: ["渠道", "本月ROI", "获客成本", "订单转化率", "诊断", "预算建议"],
    rows: [
      demoRow(
        "社群私域",
        demoCell(14.83, { numberFormat: "0.00" }),
        money(103.45),
        percent(0.2762),
        resultCell("高效增长"),
        "预算增加30%，扩大高意向人群",
      ),
      demoRow(
        "行业媒体",
        demoCell(4.33, { numberFormat: "0.00" }),
        money(363.64),
        percent(0.2),
        resultCell("稳定"),
        "维持预算并复用高质量内容",
      ),
      demoRow(
        "搜索广告",
        demoCell(4.21, { numberFormat: "0.00" }),
        money(325.58),
        percent(0.1654),
        resultCell("改善"),
        "增加高转化关键词预算",
      ),
      demoRow(
        "短视频达人",
        demoCell(4.73, { numberFormat: "0.00" }),
        money(305.56),
        percent(0.2),
        resultCell("增长"),
        "增投头部内容并淘汰低效达人",
      ),
      demoRow(
        "信息流广告",
        demoCell(2.11, { numberFormat: "0.00" }),
        money(590.16),
        percent(0.1488),
        resultCell("低效", "danger"),
        "预算缩减35%，重做素材和定向",
      ),
    ],
  },
  analysisSteps: [
    {
      id: "read-campaign-data",
      title: "读取本月投放",
      assistantText: "我先读取各渠道成本、曝光、点击、线索、订单和收入，建立完整的营销漏斗。",
      toolInput: "读取「本月投放」A1:G6，计算点击率、线索率、订单转化率和ROI",
      toolOutput: "总投放 1,040,000 元，成交收入 4,390,000 元，整体 ROI 4.22",
      activeSheet: "本月投放",
      highlight: "A1:G6",
    },
    {
      id: "calculate-channel-roi",
      title: "核算渠道效率",
      assistantText:
        "社群私域 ROI 达到 14.83，获客成本只有 103 元；信息流 ROI 仅 2.11，获客成本最高，效率差距明显。",
      toolInput: "逐渠道计算收入/成本、成本/订单和订单/线索，并进行排名",
      toolOutput: "社群私域 ROI 14.83 最高；信息流 ROI 2.11 最低且获客成本 590.16 元",
      activeSheet: "本月投放",
      highlight: "A2:G6",
    },
    {
      id: "compare-last-month",
      title: "对比上月表现",
      assistantText:
        "对比上月，搜索、短视频、行业媒体和私域均有改善；信息流 ROI 从 2.50 降至 2.11，获客成本继续上升。",
      toolInput: "读取「上月ROI」A1:C6，与本月指标匹配并计算变化",
      toolOutput: "4 个渠道 ROI 提升；信息流 ROI 下降 15.6%，获客成本上升 13.5%",
      activeSheet: "上月ROI",
      highlight: "A1:C6",
      toolExecutionDuration: 820,
    },
  ],
  writeTitle: "生成投放优化清单",
  writeAssistantText:
    "我已将每个渠道的 ROI、获客成本和订单转化率汇总，并给出明确的增投、维持或缩减建议。",
  writeToolInput: "将 5 个渠道的计算指标和预算建议写入「投放优化清单」A2:F6",
  writeToolOutput: "写入 5 个渠道优化建议；建议增投 2 个、维持优化 2 个、缩减 1 个",
  verifyAssistantText:
    "复核完成，所有 ROI 和获客成本均由本月成本、订单和收入直接计算，环比方向与上月表一致。",
  verifyToolOutput: "5 个渠道指标复核一致；ROI 合计口径为成交收入/投放成本",
  finalText:
    "广告 ROI 分析完成：建议重点增投社群私域和优质短视频，保留搜索及行业媒体，缩减信息流预算并重做素材定向。",
});
