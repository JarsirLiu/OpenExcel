import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

export const salesPerformanceAnalysisDemo = createAnalysisScenario({
  id: "sales-performance-analysis",
  workspaceId: -170,
  workspaceName: "销售分析演示",
  sessionName: "销售经营分析 Demo",
  prompt:
    "请分析各区域销售业绩、目标完成率、客户贡献和产品表现，找出增长机会与业绩短板，生成销售经营诊断和下一步行动建议。",
  workbookName: "全国销售经营月报",
  sourceSheets: [
    {
      name: "区域业绩",
      columns: ["区域", "销售目标", "销售额", "上月销售额", "订单数", "客户数", "毛利额"],
      rows: [
        demoRow("华东", money(4200000), money(4680000), money(4350000), 386, 128, money(1450800)),
        demoRow("华南", money(3600000), money(3310000), money(3520000), 294, 102, money(926800)),
        demoRow("华北", money(3900000), money(4020000), money(3780000), 318, 96, money(1165800)),
        demoRow("西南", money(2600000), money(2190000), money(2050000), 206, 78, money(569400)),
        demoRow("西北", money(1800000), money(1390000), money(1560000), 142, 55, money(333600)),
      ],
    },
    {
      name: "产品销售",
      columns: ["产品线", "销售额", "销量", "毛利率", "退货率", "同比增长"],
      rows: [
        demoRow("智能控制器", money(5320000), 1480, percent(0.34), percent(0.018), percent(0.22)),
        demoRow("工业传感器", money(4180000), 2260, percent(0.29), percent(0.026), percent(0.14)),
        demoRow("边缘网关", money(2730000), 640, percent(0.38), percent(0.014), percent(0.31)),
        demoRow("传统仪表", money(2110000), 3180, percent(0.21), percent(0.062), percent(-0.09)),
        demoRow("软件服务", money(1250000), 188, percent(0.62), percent(0.004), percent(0.46)),
      ],
    },
  ],
  resultSheet: {
    name: "销售经营诊断",
    columns: ["分析对象", "指标", "结果", "诊断", "行动建议"],
    rows: [
      demoRow("华东", "目标完成率", percent(1.1143), resultCell("领先"), "复制重点客户打法到华南"),
      demoRow(
        "华南",
        "目标完成率",
        percent(0.9194),
        resultCell("未达标", "warning"),
        "聚焦存量客户复购并清理低效商机",
      ),
      demoRow(
        "西北",
        "目标完成率",
        percent(0.7722),
        resultCell("高风险", "danger"),
        "重建渠道覆盖和重点客户清单",
      ),
      demoRow(
        "边缘网关",
        "同比增长",
        percent(0.31),
        resultCell("增长机会"),
        "增加行业方案和售前资源",
      ),
      demoRow("软件服务", "毛利率", percent(0.62), resultCell("高价值"), "推动硬件客户订阅转化"),
      demoRow(
        "传统仪表",
        "退货率",
        percent(0.062),
        resultCell("异常", "danger"),
        "排查质量批次并优化产品组合",
      ),
    ],
  },
  analysisSteps: [
    {
      id: "read-regional-sales",
      title: "读取区域业绩",
      assistantText:
        "我先读取各区域目标、实际销售、订单、客户和毛利数据，计算目标完成率及环比变化。",
      toolInput: "读取「区域业绩」A1:G6，计算目标完成率、环比和客户贡献",
      toolOutput: "全国销售额 15,590,000 元；华东、华北达标；华南、西南、西北未达标",
      activeSheet: "区域业绩",
      highlight: "A1:G6",
    },
    {
      id: "diagnose-regions",
      title: "定位区域短板",
      assistantText:
        "华东完成率 111.43% 领先，西北只有 77.22% 且环比下降；华南也未达目标，需要提高存量客户转化。",
      toolInput: "对区域按完成率和环比排序，识别领先区域与高风险区域",
      toolOutput: "华东完成率 111.43%；西北完成率 77.22%、环比下降 10.9%；华南完成率 91.94%",
      activeSheet: "区域业绩",
      highlight: "A2:G6",
    },
    {
      id: "analyze-products",
      title: "分析产品机会",
      assistantText:
        "边缘网关增长 31%，软件服务毛利率 62%，是增长重点；传统仪表同比下降且退货率达到 6.2%，需要收缩并排查质量。",
      toolInput: "读取「产品销售」A1:F6，对比增长、毛利率和退货率",
      toolOutput: "边缘网关同比 +31%；软件服务毛利率 62%；传统仪表同比 -9%、退货率 6.2%",
      activeSheet: "产品销售",
      highlight: "A1:F6",
      toolExecutionDuration: 840,
    },
  ],
  writeTitle: "生成销售经营诊断",
  writeAssistantText:
    "我已把区域业绩短板和产品增长机会合并成销售经营诊断，并为每项结论配置下一步行动。",
  writeToolInput: "将 6 项区域和产品诊断写入「销售经营诊断」A2:E7",
  writeToolOutput: "写入 6 项诊断：区域 3 项、产品 3 项；高风险 2 项",
  verifyAssistantText:
    "复核完成，目标完成率、同比、毛利率和退货率均与源表一致，诊断对象覆盖主要增长点和风险点。",
  verifyToolOutput: "6 项诊断全部可追溯；领先/机会 3 项、关注 1 项、高风险 2 项",
  finalText:
    "销售经营分析完成：应复制华东打法、修复西北渠道，重点推动边缘网关和软件服务，同时处理传统仪表的退货及下滑问题。",
});
