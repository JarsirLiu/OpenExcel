import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

export const logisticsOperationsAnalysisDemo = createAnalysisScenario({
  id: "logistics-operations-analysis",
  marketing: {
    category: "运营",
    marketingTitle: "物流运营分析",
    summary: "分析线路时效、运输成本和异常签收，在同一张表里发现需要优先治理的路线。",
    coverImage: "/demo-covers/logistics-operations.webp",
    coverAlt: "物流园区中排列整齐的货运卡车",
    proofMetric: "6 条线路 · 准时率诊断",
    featuredOrder: 6,
    theme: "slate",
  },
  workspaceId: -200,
  workspaceName: "物流分析演示",
  sessionName: "物流运营分析 Demo",
  prompt:
    "请分析各区域运单的承诺时效、实际时效、运输成本和签收异常，结合运力利用率识别延误、成本过高和运力紧张区域，并生成物流运营诊断。",
  workbookName: "全国物流运营数据",
  sourceSheets: [
    {
      name: "运单明细",
      columns: [
        "运单号",
        "区域",
        "运输方式",
        "距离km",
        "承诺时效h",
        "实际时效h",
        "运输成本",
        "签收状态",
      ],
      rows: [
        demoRow("WB260701", "华东", "公路", 860, 30, 28, money(4200), "正常签收"),
        demoRow("WB260702", "华南", "公路", 1250, 42, 51, money(6800), "延迟签收"),
        demoRow("WB260703", "华北", "铁路", 1680, 54, 49, money(5900), "正常签收"),
        demoRow("WB260704", "西南", "公路", 1420, 48, 63, money(8600), "延迟签收"),
        demoRow("WB260705", "西北", "铁路", 2180, 72, 76, money(8200), "延迟签收"),
        demoRow("WB260706", "华东", "航空", 1160, 12, 11, money(12800), "正常签收"),
        demoRow("WB260707", "华南", "航空", 980, 10, 16, money(14200), "客户拒收"),
        demoRow("WB260708", "西南", "公路", 760, 28, 35, money(5700), "外包装破损"),
      ],
    },
    {
      name: "区域运力",
      columns: ["区域", "可用车辆", "在途车辆", "运力利用率", "准时率目标", "单位公里成本目标"],
      rows: [
        demoRow("华东", 68, 54, percent(0.794), percent(0.95), money(5.2)),
        demoRow("华南", 52, 49, percent(0.942), percent(0.93), money(5.4)),
        demoRow("华北", 46, 35, percent(0.761), percent(0.94), money(4.2)),
        demoRow("西南", 38, 37, percent(0.974), percent(0.9), money(5.5)),
        demoRow("西北", 31, 27, percent(0.871), percent(0.88), money(4.5)),
      ],
    },
  ],
  resultSheet: {
    name: "物流运营诊断",
    columns: ["区域/运单", "问题类型", "关键指标", "风险等级", "运营建议"],
    rows: [
      demoRow(
        "华南",
        "时效与运力",
        "利用率94.2%，2票异常",
        resultCell("高", "danger"),
        "临时调入运力并优化航空承运商",
      ),
      demoRow(
        "西南",
        "时效与运力",
        "利用率97.4%，平均延误11h",
        resultCell("高", "danger"),
        "增加干线班次并设置备用车辆",
      ),
      demoRow(
        "WB260707",
        "拒收与成本",
        "延误6h，成本14,200",
        resultCell("高", "danger"),
        "复盘拒收原因并向承运商索赔",
      ),
      demoRow(
        "WB260704",
        "严重延误",
        "超承诺时效15h",
        resultCell("高", "danger"),
        "优先预警客户并调整西南路由",
      ),
      demoRow(
        "WB260708",
        "货损风险",
        "外包装破损",
        resultCell("中", "warning"),
        "检查装卸环节和包装标准",
      ),
      demoRow(
        "西北",
        "轻度延误",
        "铁路运单延误4h",
        resultCell("中", "warning"),
        "优化铁路中转缓冲时间",
      ),
    ],
  },
  analysisSteps: [
    {
      id: "read-waybills",
      title: "读取运单明细",
      assistantText: "我先读取每票运单的区域、方式、距离、承诺时效、实际时效、成本和签收状态。",
      toolInput: "读取「运单明细」A1:H9，计算逐票延误时长和单位公里成本",
      toolOutput: "读取 8 票运单；4 票超过承诺时效，另有 1 票拒收和 1 票包装破损",
      activeSheet: "运单明细",
      highlight: "A1:H9",
    },
    {
      id: "analyze-delays",
      title: "分析时效异常",
      assistantText:
        "西南公路运单延误最严重，分别超时 15 小时和 7 小时；华南航空运单不仅延误，还发生客户拒收。",
      toolInput: "比较实际与承诺时效，按延误小时和签收异常排序",
      toolOutput: "最大延误 15 小时；华南 2 票异常；西南平均延误 11 小时",
      activeSheet: "运单明细",
      highlight: "B2:H9",
    },
    {
      id: "review-capacity-cost",
      title: "核查运力与成本",
      assistantText:
        "西南运力利用率达到 97.4%，华南达到 94.2%，与延误集中区域高度重合；华南航空运单成本也明显偏高。",
      toolInput: "读取「区域运力」A1:F6，关联运力利用率、准时率目标和单位成本",
      toolOutput: "西南利用率 97.4%、华南 94.2%；两区域均出现集中延误，华南航空成本最高",
      activeSheet: "区域运力",
      highlight: "A1:F6",
      toolExecutionDuration: 860,
    },
  ],
  writeTitle: "生成物流运营诊断",
  writeAssistantText:
    "我已把区域运力风险和重点异常运单合并成物流运营诊断，并给出调度、路由、承运商和货损处理建议。",
  writeToolInput: "将 6 项物流风险及运营建议写入「物流运营诊断」A2:E7",
  writeToolOutput: "写入 6 项诊断：高风险 4 项、中风险 2 项",
  verifyAssistantText:
    "复核完成，所有延误小时、运力利用率和签收异常均与源表一致，重点风险覆盖华南、西南和西北。",
  verifyToolOutput: "6 项诊断全部通过源数据复核；高风险 4 项、中风险 2 项",
  finalText:
    "物流运营分析完成：应优先向华南和西南调配运力，处理拒收及严重延误运单，并优化西南干线路由和装卸包装标准。",
});
