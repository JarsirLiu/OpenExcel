import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

const departments = [
  "材料科学与工程学院",
  "人工智能学院",
  "生命科学学院",
  "环境与资源学院",
  "经济管理学院",
  "人文与社会科学学院",
];

const leaders = [
  "顾清越",
  "梁景行",
  "陆知遥",
  "方砚秋",
  "程念安",
  "宋闻溪",
  "韩书昀",
  "林昭野",
  "许澄一",
  "谢临川",
  "周南乔",
  "沈予珩",
];

const projectThemes = [
  "低碳复合材料界面调控",
  "多模态教学模型可信评测",
  "植物逆境响应机制",
  "城市水体微污染治理",
  "县域产业韧性评价",
  "数字人文档案知识图谱",
  "柔性传感器规模化制备",
  "工业视觉缺陷小样本识别",
  "合成生物底盘细胞优化",
  "固废资源化协同处置",
  "科技成果转化效率研究",
  "地方文化遗产数字叙事",
];

const projectTypes = ["国家自然科学基金", "省重点研发计划", "横向合作项目", "校级科研启动"];
const expenseCategories = ["设备费", "材料费", "测试化验费", "差旅会议费", "劳务费", "出版信息费"];
const expenseWeights = [0.24, 0.22, 0.18, 0.15, 0.12, 0.09];
const executionPatterns = [
  { ratio: 1.08, remainingMonths: 5 },
  { ratio: 0.94, remainingMonths: 8 },
  { ratio: 0.18, remainingMonths: 2 },
  { ratio: 0.73, remainingMonths: 7 },
  { ratio: 0.56, remainingMonths: 10 },
  { ratio: 0.82, remainingMonths: 4 },
  { ratio: 1.04, remainingMonths: 6 },
  { ratio: 0.92, remainingMonths: 7 },
  { ratio: 0.21, remainingMonths: 3 },
  { ratio: 0.67, remainingMonths: 9 },
  { ratio: 0.44, remainingMonths: 11 },
  { ratio: 0.78, remainingMonths: 5 },
];

function getRisk(executionRate: number, remainingMonths: number) {
  if (executionRate > 1) {
    return {
      label: "已超预算",
      tone: "danger" as const,
      suggestion: "冻结新增报销并核查预算调整依据",
    };
  }
  if (executionRate >= 0.9 && remainingMonths >= 6) {
    return {
      label: "执行偏快",
      tone: "warning" as const,
      suggestion: "复核大额支出与后续任务资金安排",
    };
  }
  if (executionRate < 0.25 && remainingMonths <= 3) {
    return {
      label: "临近结项执行偏低",
      tone: "warning" as const,
      suggestion: "联系负责人提交结项支出计划",
    };
  }
  return {
    label: "执行正常",
    tone: "normal" as const,
    suggestion: "按月跟踪预算执行",
  };
}

const researchProjects = Array.from({ length: 36 }, (_, index) => {
  const projectNumber = index + 1;
  const pattern = executionPatterns[index % executionPatterns.length];
  const originalBudget = 180000 + ((index * 73000 + 41000) % 420000);
  const adjustment =
    index % 3 === 0 ? [30000, -20000, 50000, -15000][Math.floor(index / 3) % 4] : 0;
  const adjustedBudget = originalBudget + adjustment;
  const actualSpend = Math.round(adjustedBudget * pattern.ratio);
  const executionRate = actualSpend / adjustedBudget;
  const risk = getRisk(executionRate, pattern.remainingMonths);

  return {
    id: `KY2026${String(projectNumber).padStart(3, "0")}`,
    name: `${projectThemes[index % projectThemes.length]}${index >= projectThemes.length ? `（${Math.floor(index / projectThemes.length) + 1}期）` : ""}`,
    type: projectTypes[index % projectTypes.length],
    department: departments[index % departments.length],
    leader: leaders[index % leaders.length],
    originalBudget,
    adjustment,
    adjustedBudget,
    actualSpend,
    executionRate,
    remainingMonths: pattern.remainingMonths,
    risk,
  };
});

const projectRows = researchProjects.map((project) =>
  demoRow(
    project.id,
    project.name,
    project.type,
    project.department,
    project.leader,
    money(project.originalBudget),
    money(project.adjustment),
    money(project.adjustedBudget),
    project.remainingMonths,
  ),
);

const expenseRows = researchProjects.flatMap((project, projectIndex) => {
  let allocated = 0;
  return expenseCategories.map((category, categoryIndex) => {
    const amount =
      categoryIndex === expenseCategories.length - 1
        ? project.actualSpend - allocated
        : Math.round(project.actualSpend * expenseWeights[categoryIndex]);
    allocated += amount;
    const day = String(((projectIndex * 5 + categoryIndex * 3) % 27) + 1).padStart(2, "0");
    const month = String(((projectIndex + categoryIndex) % 6) + 1).padStart(2, "0");

    return demoRow(
      `BX26${String(projectIndex + 1).padStart(3, "0")}${String(categoryIndex + 1).padStart(2, "0")}`,
      project.id,
      `2026-${month}-${day}`,
      category,
      `${project.name.slice(0, 12)}相关${category}`,
      money(amount),
      project.leader,
      "已入账",
    );
  });
});

const adjustmentRows = researchProjects
  .filter((project) => project.adjustment !== 0)
  .map((project, index) =>
    demoRow(
      `TZ2026${String(index + 1).padStart(3, "0")}`,
      project.id,
      project.adjustment > 0 ? "追加预算" : "调减预算",
      money(project.adjustment),
      `2026-${String((index % 6) + 1).padStart(2, "0")}-${String(((index * 2 + 6) % 27) + 1).padStart(2, "0")}`,
      "已审批",
      project.adjustment > 0 ? "任务范围调整" : "结余资金统筹",
    ),
  );

const resultRows = researchProjects.map((project) =>
  demoRow(
    project.id,
    project.name,
    project.department,
    money(project.adjustedBudget),
    money(project.actualSpend),
    money(project.adjustedBudget - project.actualSpend),
    percent(project.executionRate),
    resultCell(project.risk.label, project.risk.tone),
    project.risk.suggestion,
  ),
);

const portfolioStats = researchProjects.reduce(
  (stats, project) => {
    stats.budget += project.adjustedBudget;
    stats.spend += project.actualSpend;
    if (project.risk.label !== "执行正常") stats.riskCount += 1;
    if (project.risk.label === "已超预算") stats.overspentCount += 1;
    if (project.risk.label === "执行偏快") stats.fastCount += 1;
    if (project.risk.label === "临近结项执行偏低") stats.slowCount += 1;
    return stats;
  },
  { budget: 0, spend: 0, riskCount: 0, overspentCount: 0, fastCount: 0, slowCount: 0 },
);

const formatAmount = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

export const researchFundExecutionDemo = createAnalysisScenario({
  id: "research-fund-execution",
  marketing: {
    category: "财务",
    marketingTitle: "科研经费预算执行分析",
    summary: "穿透项目预算、报销明细与预算调整，识别超预算、执行偏快和临近结项执行不足。",
    coverImage: "/demo-covers/research-fund-execution.webp",
    coverAlt: "大学生在实验室共同开展科研实验",
    proofMetric: `36 个项目 · 216 笔支出 · ${portfolioStats.riskCount} 项预警`,
    featuredOrder: 2,
    theme: "slate",
  },
  workspaceId: -220,
  workspaceName: "学校财务演示",
  sessionName: "科研经费预算执行分析 Demo",
  prompt:
    "请汇总科研项目预算、支出明细和预算调整记录，计算每个项目的调整后预算、累计支出、可用余额和执行率，识别超预算、执行偏快及临近结项执行偏低的项目，并生成财务处可跟进的风险清单。",
  workbookName: "明川大学2026年度科研经费执行台账",
  sourceSheets: [
    {
      name: "项目预算",
      columns: [
        "项目编号",
        "项目名称",
        "项目类型",
        "归口单位",
        "负责人",
        "批复预算",
        "审批调整",
        "调整后预算",
        "距结项月数",
      ],
      rows: projectRows,
    },
    {
      name: "支出明细",
      columns: [
        "报销单号",
        "项目编号",
        "入账日期",
        "支出科目",
        "摘要",
        "金额",
        "经办人",
        "入账状态",
      ],
      rows: expenseRows,
    },
    {
      name: "预算调整",
      columns: ["调整单号", "项目编号", "调整类型", "调整金额", "审批日期", "审批状态", "调整原因"],
      rows: adjustmentRows,
    },
  ],
  resultSheet: {
    name: "经费执行分析",
    columns: [
      "项目编号",
      "项目名称",
      "归口单位",
      "调整后预算",
      "累计支出",
      "可用余额",
      "执行率",
      "风险结论",
      "跟进建议",
    ],
    rows: resultRows,
  },
  analysisSteps: [
    {
      id: "review-project-budgets",
      title: "整理项目预算口径",
      assistantText:
        "我先按项目编号整理批复预算，并只纳入已审批的预算调整，形成统一的调整后预算口径。",
      toolInput: "读取「项目预算」A1:I37 和「预算调整」A1:G13，按项目编号核对已审批调整",
      toolOutput: `完成 36 个项目匹配；12 条预算调整全部通过审批；调整后预算合计 ${formatAmount(portfolioStats.budget)} 元`,
      activeSheet: "项目预算",
      highlight: "A1:I37",
    },
    {
      id: "aggregate-research-spend",
      title: "汇总科研支出明细",
      assistantText:
        "接下来汇总全部已入账报销，并交叉检查项目编号、支出科目和经办人，确保每笔支出都归集到对应项目。",
      toolInput: "读取「支出明细」A1:H217，按项目编号汇总 216 笔已入账支出",
      toolOutput: `216 笔支出全部匹配项目；累计支出 ${formatAmount(portfolioStats.spend)} 元；无缺失项目编号`,
      activeSheet: "支出明细",
      highlight: "A1:H217",
    },
    {
      id: "detect-budget-risks",
      title: "识别预算执行风险",
      assistantText:
        "我将执行率与距结项时间组合判断：不仅看是否超预算，也识别尚有较长执行期却消耗过快，以及临近结项但执行明显不足的项目。",
      toolInput: "计算调整后预算、累计支出、余额和执行率，并结合距结项月数执行风险规则",
      toolOutput: `识别 ${portfolioStats.riskCount} 个预警项目：超预算 ${portfolioStats.overspentCount} 个、执行偏快 ${portfolioStats.fastCount} 个、临近结项执行偏低 ${portfolioStats.slowCount} 个`,
      activeSheet: "项目预算",
      highlight: "F2:I37",
      toolExecutionDuration: 880,
    },
  ],
  writeTitle: "生成科研经费执行分析表",
  writeAssistantText:
    "我已把项目级预算、支出、余额、执行率和风险结论写入分析表，并为每类预警给出财务处可以直接执行的跟进建议。",
  writeToolInput: "将 36 个科研项目的执行分析结果写入「经费执行分析」A2:I37",
  writeToolOutput: `写入 36 条项目结果；正常 18 个，风险预警 ${portfolioStats.riskCount} 个`,
  verifyAssistantText:
    "复核完成：36 个项目、216 笔支出和 12 条预算调整均已覆盖，项目支出合计与源表一致，每个预警项目都有明确跟进建议。",
  verifyToolOutput: `36 个项目全部匹配；预算 ${formatAmount(portfolioStats.budget)} 元；支出 ${formatAmount(portfolioStats.spend)} 元；预警 ${portfolioStats.riskCount} 个`,
  finalText: `科研经费执行分析完成：共检查 36 个项目和 216 笔支出，发现 ${portfolioStats.riskCount} 个需要跟进的项目，其中超预算 ${portfolioStats.overspentCount} 个、执行偏快 ${portfolioStats.fastCount} 个、临近结项执行偏低 ${portfolioStats.slowCount} 个；风险清单已生成。`,
});
