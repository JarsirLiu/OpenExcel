import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

const schoolUnits = [
  "党委办公室",
  "校长办公室",
  "发展规划处",
  "教务处",
  "科学技术处",
  "人力资源处",
  "财务处",
  "审计处",
  "学生工作部",
  "国际合作处",
  "资产管理处",
  "后勤保障处",
  "材料科学与工程学院",
  "人工智能学院",
  "生命科学学院",
  "环境与资源学院",
  "经济管理学院",
  "人文与社会科学学院",
  "建筑与城市规划学院",
  "外国语学院",
  "数学与统计学院",
  "物理与光电学院",
  "艺术与设计学院",
  "体育学院",
  "图书馆",
  "信息化建设中心",
  "实验室与设备管理处",
  "继续教育学院",
  "创新创业学院",
  "校医院",
  "档案馆",
  "教师发展中心",
  "工程训练中心",
  "分析测试中心",
  "学术交流中心",
  "校园安全中心",
];

const unitTypes = ["党政管理", "教学单位", "直属服务", "科研平台"];
const expenseSubjects = [
  "办公运行费",
  "教学业务费",
  "设备维护费",
  "差旅会议费",
  "劳务服务费",
  "专项活动费",
];
const monthlyWeights = [0.13, 0.15, 0.16, 0.17, 0.18, 0.21];
const executionPatterns = [
  { spendRate: 0.62, committedRate: 0.45 },
  { spendRate: 0.78, committedRate: 0.12 },
  { spendRate: 0.14, committedRate: 0.18 },
  { spendRate: 0.31, committedRate: 0.19 },
  { spendRate: 0.46, committedRate: 0.22 },
  { spendRate: 0.58, committedRate: 0.17 },
  { spendRate: 0.39, committedRate: 0.24 },
  { spendRate: 0.53, committedRate: 0.16 },
  { spendRate: 0.27, committedRate: 0.21 },
  { spendRate: 0.64, committedRate: 0.14 },
  { spendRate: 0.42, committedRate: 0.23 },
  { spendRate: 0.35, committedRate: 0.18 },
];

function getBudgetRisk(adjustedBudget: number, halfYearSpend: number, committedAmount: number) {
  const executionRate = halfYearSpend / adjustedBudget;
  if (halfYearSpend + committedAmount > adjustedBudget) {
    return {
      label: "预计资金缺口",
      tone: "danger" as const,
      suggestion: "暂停新增承诺并提交预算统筹方案",
    };
  }
  if (executionRate >= 0.72) {
    return {
      label: "执行进度偏快",
      tone: "warning" as const,
      suggestion: "复核下半年刚性支出和月度用款计划",
    };
  }
  if (executionRate < 0.18) {
    return {
      label: "执行进度偏慢",
      tone: "warning" as const,
      suggestion: "确认项目进度并评估预算收回或调整",
    };
  }
  return {
    label: "执行正常",
    tone: "normal" as const,
    suggestion: "按月继续跟踪预算执行",
  };
}

const departmentBudgets = schoolUnits.map((unit, index) => {
  const pattern = executionPatterns[index % executionPatterns.length];
  const originalBudget = 720000 + ((index * 387000 + 156000) % 3680000);
  const adjustment =
    index % 2 === 0 ? [120000, -80000, 180000, -140000][Math.floor(index / 2) % 4] : 0;
  const adjustedBudget = originalBudget + adjustment;
  const halfYearSpend = Math.round(adjustedBudget * pattern.spendRate);
  const committedAmount = Math.round(adjustedBudget * pattern.committedRate);
  const risk = getBudgetRisk(adjustedBudget, halfYearSpend, committedAmount);

  return {
    id: `DW${String(index + 1).padStart(3, "0")}`,
    unit,
    type: unitTypes[Math.floor(index / 9) % unitTypes.length],
    manager: ["顾清越", "梁景行", "方砚秋", "程念安", "宋闻溪", "韩书昀"][index % 6],
    originalBudget,
    adjustment,
    adjustedBudget,
    halfYearSpend,
    committedAmount,
    executionRate: halfYearSpend / adjustedBudget,
    availableAfterCommitment: adjustedBudget - halfYearSpend - committedAmount,
    risk,
  };
});

const budgetRows = departmentBudgets.map((department) =>
  demoRow(
    department.id,
    department.unit,
    department.type,
    department.manager,
    money(department.originalBudget),
    money(department.adjustment),
    money(department.adjustedBudget),
    "2026年度",
  ),
);

const monthlyExpenseRows = departmentBudgets.flatMap((department, departmentIndex) => {
  let allocated = 0;
  return monthlyWeights.map((weight, monthIndex) => {
    const amount =
      monthIndex === monthlyWeights.length - 1
        ? department.halfYearSpend - allocated
        : Math.round(department.halfYearSpend * weight);
    allocated += amount;
    return demoRow(
      `ZC26${String(departmentIndex + 1).padStart(3, "0")}${monthIndex + 1}`,
      department.id,
      `2026-${String(monthIndex + 1).padStart(2, "0")}`,
      expenseSubjects[(departmentIndex + monthIndex) % expenseSubjects.length],
      money(amount),
      department.manager,
      "已入账",
    );
  });
});

const adjustmentRows = departmentBudgets
  .filter((department) => department.adjustment !== 0)
  .map((department, index) =>
    demoRow(
      `YS2026${String(index + 1).padStart(3, "0")}`,
      department.id,
      department.adjustment > 0 ? "追加预算" : "压减预算",
      money(department.adjustment),
      `2026-${String((index % 6) + 1).padStart(2, "0")}-${String(((index * 3) % 24) + 3).padStart(2, "0")}`,
      "已审批",
      department.adjustment > 0 ? "新增年度重点任务" : "统筹低执行率结余",
    ),
  );

const commitmentRows = departmentBudgets.flatMap((department, departmentIndex) => {
  const firstAmount = Math.round(department.committedAmount * 0.57);
  const secondAmount = department.committedAmount - firstAmount;
  return [firstAmount, secondAmount].map((amount, itemIndex) =>
    demoRow(
      `DF26${String(departmentIndex + 1).padStart(3, "0")}${itemIndex + 1}`,
      department.id,
      itemIndex === 0 ? "已签合同待支付" : "已审批报销待支付",
      itemIndex === 0 ? "下半年设备及服务合同" : "跨月报销及劳务结算",
      money(amount),
      `2026-${String((departmentIndex % 3) + 7).padStart(2, "0")}-${String(((departmentIndex * 2 + itemIndex * 5) % 24) + 3).padStart(2, "0")}`,
      "待支付",
    ),
  );
});

const resultRows = departmentBudgets.map((department) =>
  demoRow(
    department.id,
    department.unit,
    department.type,
    money(department.adjustedBudget),
    money(department.halfYearSpend),
    money(department.committedAmount),
    money(department.availableAfterCommitment),
    percent(department.executionRate),
    resultCell(department.risk.label, department.risk.tone),
    department.risk.suggestion,
  ),
);

const budgetStats = departmentBudgets.reduce(
  (stats, department) => {
    stats.budget += department.adjustedBudget;
    stats.spend += department.halfYearSpend;
    stats.commitment += department.committedAmount;
    if (department.risk.label !== "执行正常") stats.riskCount += 1;
    if (department.risk.label === "预计资金缺口") stats.gapCount += 1;
    if (department.risk.label === "执行进度偏快") stats.fastCount += 1;
    if (department.risk.label === "执行进度偏慢") stats.slowCount += 1;
    return stats;
  },
  { budget: 0, spend: 0, commitment: 0, riskCount: 0, gapCount: 0, fastCount: 0, slowCount: 0 },
);

const formatAmount = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

export const departmentBudgetMonitoringDemo = createAnalysisScenario({
  id: "department-budget-monitoring",
  marketing: {
    category: "财务",
    marketingTitle: "学校预算执行与部门经费预警",
    summary: "汇总部门预算、月度支出和待支付事项，提前发现资金缺口与执行进度异常。",
    coverImage: "/demo-covers/department-budget-monitoring.webp",
    coverAlt: "财务人员使用计算器核对预算报表",
    proofMetric: `36 个部门 · 306 条业务记录 · ${budgetStats.riskCount} 项预警`,
    featuredOrder: 4,
    theme: "sage",
  },
  workspaceId: -240,
  workspaceName: "学校财务演示",
  sessionName: "学校预算执行与部门经费预警 Demo",
  prompt:
    "请汇总部门年度预算、预算调整、上半年月度支出和待支付事项，计算调整后预算、累计支出、执行率及承诺后可用额度，识别预计资金缺口、执行偏快和执行偏慢的部门，并生成预算执行预警表。",
  workbookName: "明川大学2026年度部门预算执行台账",
  sourceSheets: [
    {
      name: "部门预算",
      columns: [
        "部门编码",
        "部门名称",
        "部门类型",
        "预算负责人",
        "年初预算",
        "审批调整",
        "调整后预算",
        "预算年度",
      ],
      rows: budgetRows,
    },
    {
      name: "月度支出",
      columns: ["凭证号", "部门编码", "会计期间", "支出科目", "支出金额", "经办人", "入账状态"],
      rows: monthlyExpenseRows,
    },
    {
      name: "预算调整",
      columns: ["调整单号", "部门编码", "调整类型", "调整金额", "审批日期", "审批状态", "调整原因"],
      rows: adjustmentRows,
    },
    {
      name: "待支付事项",
      columns: [
        "事项编号",
        "部门编码",
        "事项类型",
        "事项摘要",
        "待支付金额",
        "预计支付日期",
        "状态",
      ],
      rows: commitmentRows,
    },
  ],
  resultSheet: {
    name: "部门预算预警",
    columns: [
      "部门编码",
      "部门名称",
      "部门类型",
      "调整后预算",
      "上半年支出",
      "待支付承诺",
      "承诺后可用",
      "执行率",
      "预警结论",
      "处理建议",
    ],
    rows: resultRows,
  },
  analysisSteps: [
    {
      id: "normalize-department-budgets",
      title: "统一部门预算口径",
      assistantText: "我先按部门编码核对年初预算和已审批调整，形成 36 个部门统一的调整后年度预算。",
      toolInput: "读取「部门预算」A1:H37 和「预算调整」A1:G19，按部门编码核对 18 条调整",
      toolOutput: `完成 36 个部门匹配；18 条调整全部已审批；调整后预算合计 ${formatAmount(budgetStats.budget)} 元`,
      activeSheet: "部门预算",
      highlight: "A1:H37",
    },
    {
      id: "aggregate-department-expenses",
      title: "汇总上半年月度支出",
      assistantText: "接下来汇总 1 至 6 月已入账支出，按部门计算累计发生额和半年预算执行率。",
      toolInput: "读取「月度支出」A1:G217，按部门编码汇总 216 条已入账支出",
      toolOutput: `216 条月度支出全部匹配；上半年累计支出 ${formatAmount(budgetStats.spend)} 元；无缺失部门编码`,
      activeSheet: "月度支出",
      highlight: "A1:G217",
    },
    {
      id: "include-payment-commitments",
      title: "纳入待支付资金承诺",
      assistantText:
        "我将已签合同和已审批报销的待支付金额纳入占用，计算承诺后可用额度，避免只看账面支出低估资金压力。",
      toolInput: "读取「待支付事项」A1:G73，汇总 72 条有效资金承诺并计算承诺后可用额度",
      toolOutput: `待支付承诺合计 ${formatAmount(budgetStats.commitment)} 元；识别预计资金缺口 ${budgetStats.gapCount} 个部门`,
      activeSheet: "待支付事项",
      highlight: "A1:G73",
    },
    {
      id: "detect-budget-execution-risks",
      title: "识别预算执行风险",
      assistantText: "最后综合执行率和承诺后可用额度，分别标记资金缺口、执行偏快和执行偏慢的部门。",
      toolInput: "计算部门执行率及承诺后可用额度，执行半年预算预警规则",
      toolOutput: `识别 ${budgetStats.riskCount} 个预警部门：资金缺口 ${budgetStats.gapCount} 个、执行偏快 ${budgetStats.fastCount} 个、执行偏慢 ${budgetStats.slowCount} 个`,
      activeSheet: "部门预算",
      highlight: "E2:H37",
      toolExecutionDuration: 900,
    },
  ],
  writeTitle: "生成部门预算执行预警表",
  writeAssistantText:
    "我已将预算、支出、待支付承诺和风险结论写入部门预警表，并为三类异常生成对应的财务跟进建议。",
  writeToolInput: "将 36 个部门的预算执行结果写入「部门预算预警」A2:J37",
  writeToolOutput: `写入 36 条部门结果；正常 27 个，预警 ${budgetStats.riskCount} 个`,
  verifyAssistantText:
    "复核完成：36 个部门、216 条支出、18 条预算调整和 72 条待支付事项均已覆盖，预算、支出和承诺金额与源表一致。",
  verifyToolOutput: `36 个部门全部匹配；预算 ${formatAmount(budgetStats.budget)} 元；支出 ${formatAmount(budgetStats.spend)} 元；待支付 ${formatAmount(budgetStats.commitment)} 元；预警 ${budgetStats.riskCount} 个`,
  finalText: `部门预算执行分析完成：共检查 36 个部门、216 条月度支出和 72 条待支付事项，发现 ${budgetStats.riskCount} 个预警部门，其中预计资金缺口 ${budgetStats.gapCount} 个、执行偏快 ${budgetStats.fastCount} 个、执行偏慢 ${budgetStats.slowCount} 个；预警表已生成。`,
});
