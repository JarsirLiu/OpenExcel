import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });
const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

const procurementProjects = [
  "智慧教室交互终端采购",
  "中心机房存储扩容",
  "生物实验室显微成像系统",
  "图书馆中文数据库续订",
  "学生公寓空调更新",
  "校园消防设施改造",
  "食堂油烟净化设备采购",
  "艺术中心舞台灯光升级",
  "工程训练中心数控设备",
  "校园骨干网络交换机采购",
  "化学实验室通风柜更新",
  "档案数字化加工服务",
  "研究生公寓家具采购",
  "校医院检验设备更新",
  "体育馆木地板维护工程",
  "迎新系统软件开发服务",
];

const suppliers = [
  "澄远教学设备有限公司",
  "北辰数科系统集成有限公司",
  "启衡精密仪器有限公司",
  "文澜学术资源有限公司",
  "岭南校园设施有限公司",
  "安澈消防工程有限公司",
  "清源环保科技有限公司",
  "弦歌舞台技术有限公司",
  "匠川智能制造有限公司",
  "云岫网络技术有限公司",
  "科仪实验室装备有限公司",
  "墨舟档案技术有限公司",
  "朴木教育家具有限公司",
  "康屿医疗器械有限公司",
  "赛场建筑维护有限公司",
  "知行校园软件有限公司",
];

const departments = [
  "教务处",
  "信息化建设中心",
  "实验室与设备管理处",
  "图书馆",
  "后勤保障处",
  "保卫处",
  "资产管理处",
  "学生工作部",
];

const paymentStages = ["预付款", "到货款", "验收款"];
const paymentWeights = [0.35, 0.4, 0.25];
const contractPatterns = [
  { paidRate: 1.04, acceptedRate: 1, overdue: false },
  { paidRate: 0.83, acceptedRate: 0.48, overdue: false },
  { paidRate: 0.36, acceptedRate: 0, overdue: false },
  { paidRate: 0.42, acceptedRate: 0.42, overdue: true },
  { paidRate: 0.28, acceptedRate: 0.35, overdue: false },
  { paidRate: 0.62, acceptedRate: 0.68, overdue: false },
  { paidRate: 0.76, acceptedRate: 0.8, overdue: false },
  { paidRate: 1, acceptedRate: 1, overdue: false },
  { paidRate: 0.15, acceptedRate: 0.2, overdue: false },
  { paidRate: 0.47, acceptedRate: 0.52, overdue: false },
  { paidRate: 0.69, acceptedRate: 0.73, overdue: false },
  { paidRate: 0.88, acceptedRate: 0.91, overdue: false },
  { paidRate: 0.33, acceptedRate: 0.38, overdue: false },
  { paidRate: 0.57, acceptedRate: 0.61, overdue: false },
  { paidRate: 0.72, acceptedRate: 0.76, overdue: false },
  { paidRate: 0.95, acceptedRate: 1, overdue: false },
];

function getContractRisk(
  contractAmount: number,
  paidAmount: number,
  acceptedAmount: number,
  overdue: boolean,
) {
  const paidRate = paidAmount / contractAmount;
  const acceptedRate = acceptedAmount / contractAmount;
  if (paidAmount > contractAmount) {
    return {
      label: "超合同金额付款",
      tone: "danger" as const,
      suggestion: "暂停后续支付并追查超付审批依据",
    };
  }
  if (paidAmount > 0 && acceptedAmount === 0) {
    return {
      label: "未验收先付款",
      tone: "danger" as const,
      suggestion: "补充到货验收材料并复核付款条件",
    };
  }
  if (paidRate - acceptedRate > 0.2) {
    return {
      label: "付款进度超验收",
      tone: "warning" as const,
      suggestion: "核对合同节点并暂缓下一阶段付款",
    };
  }
  if (overdue && acceptedRate < 1) {
    return {
      label: "合同逾期未完成",
      tone: "warning" as const,
      suggestion: "联系归口部门确认延期或违约处理",
    };
  }
  return {
    label: "履约正常",
    tone: "normal" as const,
    suggestion: "按合同节点继续跟踪",
  };
}

const schoolContracts = Array.from({ length: 48 }, (_, index) => {
  const pattern = contractPatterns[index % contractPatterns.length];
  const contractAmount = 160000 + ((index * 137000 + 83000) % 1180000);
  const paidAmount = Math.round(contractAmount * pattern.paidRate);
  const acceptedAmount = Math.round(contractAmount * pattern.acceptedRate);
  const risk = getContractRisk(contractAmount, paidAmount, acceptedAmount, pattern.overdue);
  const cycle = Math.floor(index / procurementProjects.length) + 1;

  return {
    id: `CG2026${String(index + 1).padStart(3, "0")}`,
    project: `${procurementProjects[index % procurementProjects.length]}${cycle > 1 ? `（第${cycle}批）` : ""}`,
    supplier: suppliers[index % suppliers.length],
    department: departments[index % departments.length],
    contractAmount,
    paidAmount,
    acceptedAmount,
    paidRate: paidAmount / contractAmount,
    acceptedRate: acceptedAmount / contractAmount,
    signedDate: `2026-${String((index % 4) + 1).padStart(2, "0")}-${String(((index * 3) % 24) + 3).padStart(2, "0")}`,
    dueDate: pattern.overdue
      ? "2026-05-31"
      : `2026-${String((index % 4) + 9).padStart(2, "0")}-${String(((index * 2) % 20) + 8).padStart(2, "0")}`,
    overdue: pattern.overdue,
    risk,
  };
});

const contractRows = schoolContracts.map((contract) =>
  demoRow(
    contract.id,
    contract.project,
    contract.supplier,
    contract.department,
    money(contract.contractAmount),
    contract.signedDate,
    contract.dueDate,
    contract.overdue ? "已逾期" : "履约中",
  ),
);

const paymentRows = schoolContracts.flatMap((contract, contractIndex) => {
  let allocated = 0;
  return paymentStages.map((stage, stageIndex) => {
    const amount =
      stageIndex === paymentStages.length - 1
        ? contract.paidAmount - allocated
        : Math.round(contract.paidAmount * paymentWeights[stageIndex]);
    allocated += amount;
    return demoRow(
      `ZF26${String(contractIndex + 1).padStart(3, "0")}${stageIndex + 1}`,
      contract.id,
      stage,
      `2026-${String(((contractIndex + stageIndex) % 6) + 1).padStart(2, "0")}-${String(((contractIndex * 4 + stageIndex * 5) % 25) + 2).padStart(2, "0")}`,
      money(amount),
      "已支付",
      stageIndex === 2 && contract.risk.label !== "履约正常" ? "待补充" : "已核验",
      contract.department,
    );
  });
});

const acceptanceRows = schoolContracts.flatMap((contract, contractIndex) => {
  const firstAmount = Math.round(contract.acceptedAmount * 0.58);
  const secondAmount = contract.acceptedAmount - firstAmount;
  return [firstAmount, secondAmount].map((amount, batchIndex) =>
    demoRow(
      `YS26${String(contractIndex + 1).padStart(3, "0")}${batchIndex + 1}`,
      contract.id,
      `第${batchIndex + 1}批`,
      amount > 0
        ? `2026-${String(((contractIndex + batchIndex + 1) % 6) + 1).padStart(2, "0")}-${String(((contractIndex * 3 + batchIndex * 7) % 24) + 3).padStart(2, "0")}`
        : "",
      money(amount),
      amount > 0 ? "验收通过" : "待验收",
      amount > 0 ? "材料齐全" : "尚未提交验收单",
    ),
  );
});

const resultRows = schoolContracts.map((contract) =>
  demoRow(
    contract.id,
    contract.project,
    contract.department,
    money(contract.contractAmount),
    money(contract.paidAmount),
    money(contract.acceptedAmount),
    percent(contract.paidRate),
    percent(contract.acceptedRate),
    resultCell(contract.risk.label, contract.risk.tone),
    contract.risk.suggestion,
  ),
);

const contractStats = schoolContracts.reduce(
  (stats, contract) => {
    stats.contractAmount += contract.contractAmount;
    stats.paidAmount += contract.paidAmount;
    if (contract.risk.label !== "履约正常") stats.riskCount += 1;
    if (contract.risk.label === "超合同金额付款") stats.overpaidCount += 1;
    if (contract.risk.label === "未验收先付款") stats.noAcceptanceCount += 1;
    if (contract.risk.label === "付款进度超验收") stats.aheadCount += 1;
    if (contract.risk.label === "合同逾期未完成") stats.overdueCount += 1;
    return stats;
  },
  {
    contractAmount: 0,
    paidAmount: 0,
    riskCount: 0,
    overpaidCount: 0,
    noAcceptanceCount: 0,
    aheadCount: 0,
    overdueCount: 0,
  },
);

const formatAmount = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

export const schoolProcurementAuditDemo = createAnalysisScenario({
  id: "school-procurement-audit",
  marketing: {
    category: "财务",
    marketingTitle: "采购合同与付款进度核查",
    summary: "贯通采购合同、付款单与验收记录，定位超付、未验收付款、进度倒挂和逾期履约。",
    coverImage: "/demo-covers/school-procurement-audit.webp",
    coverAlt: "采购人员在办公桌前共同审阅合同文件",
    proofMetric: `48 份合同 · 240 条业务记录 · ${contractStats.riskCount} 项风险`,
    featuredOrder: 3,
    theme: "sand",
  },
  workspaceId: -230,
  workspaceName: "学校财务演示",
  sessionName: "采购合同与付款进度核查 Demo",
  prompt:
    "请关联采购合同台账、付款记录和验收记录，逐份计算合同金额、累计付款、累计验收、付款比例和验收比例，识别超合同金额付款、未验收先付款、付款进度超过验收及合同逾期未完成，并生成采购付款风险清单。",
  workbookName: "明川大学2026年度采购合同执行台账",
  sourceSheets: [
    {
      name: "采购合同",
      columns: [
        "合同编号",
        "采购项目",
        "供应商",
        "归口部门",
        "合同金额",
        "签订日期",
        "约定完成日期",
        "履约状态",
      ],
      rows: contractRows,
    },
    {
      name: "付款记录",
      columns: [
        "支付单号",
        "合同编号",
        "付款阶段",
        "支付日期",
        "支付金额",
        "支付状态",
        "发票状态",
        "申请部门",
      ],
      rows: paymentRows,
    },
    {
      name: "验收记录",
      columns: ["验收单号", "合同编号", "验收批次", "验收日期", "验收金额", "验收状态", "材料情况"],
      rows: acceptanceRows,
    },
  ],
  resultSheet: {
    name: "采购付款风险",
    columns: [
      "合同编号",
      "采购项目",
      "归口部门",
      "合同金额",
      "累计付款",
      "累计验收",
      "付款比例",
      "验收比例",
      "风险结论",
      "处理建议",
    ],
    rows: resultRows,
  },
  analysisSteps: [
    {
      id: "match-contract-payments",
      title: "关联合同与付款记录",
      assistantText: "我先按合同编号汇总全部已支付记录，并核对每笔付款的阶段、发票状态和申请部门。",
      toolInput: "读取「采购合同」A1:H49 和「付款记录」A1:H145，按合同编号汇总已支付金额",
      toolOutput: `48 份合同全部匹配；汇总 144 笔付款，合同总额 ${formatAmount(contractStats.contractAmount)} 元，累计付款 ${formatAmount(contractStats.paidAmount)} 元`,
      activeSheet: "付款记录",
      highlight: "A1:H145",
    },
    {
      id: "match-contract-acceptance",
      title: "核对验收进度",
      assistantText:
        "接下来将两批验收记录归集到合同，计算累计验收金额和验收比例，并标出尚未提交验收材料的付款。",
      toolInput: "读取「验收记录」A1:G97，按合同编号汇总 96 条验收记录",
      toolOutput: `96 条验收记录全部关联合同；发现未验收先付款 ${contractStats.noAcceptanceCount} 份，付款进度超过验收 ${contractStats.aheadCount} 份`,
      activeSheet: "验收记录",
      highlight: "A1:G97",
    },
    {
      id: "detect-procurement-risks",
      title: "识别合同付款风险",
      assistantText:
        "我将合同金额、付款比例、验收比例和约定完成日期组合判断，按风险优先级生成可直接跟进的合同清单。",
      toolInput: "逐份比较合同金额、累计付款、累计验收及履约期限，执行采购付款风险规则",
      toolOutput: `识别 ${contractStats.riskCount} 份风险合同：超付 ${contractStats.overpaidCount} 份、未验收付款 ${contractStats.noAcceptanceCount} 份、进度倒挂 ${contractStats.aheadCount} 份、逾期未完成 ${contractStats.overdueCount} 份`,
      activeSheet: "采购合同",
      highlight: "A1:H49",
      toolExecutionDuration: 900,
    },
  ],
  writeTitle: "生成采购付款风险清单",
  writeAssistantText:
    "我已将合同、付款和验收进度写入风险清单，并为超付、材料缺失、进度倒挂和逾期合同分别生成处理建议。",
  writeToolInput: "将 48 份合同的核查结果写入「采购付款风险」A2:J49",
  writeToolOutput: `写入 48 条合同结果；正常 36 份，风险合同 ${contractStats.riskCount} 份`,
  verifyAssistantText:
    "复核完成：48 份合同、144 笔付款和 96 条验收记录均已覆盖，付款及验收合计与源表一致，每份风险合同均可追溯到原始单据。",
  verifyToolOutput: `48 份合同全部匹配；144 笔付款无遗漏；96 条验收记录无孤立合同；风险 ${contractStats.riskCount} 份`,
  finalText: `采购合同核查完成：共检查 48 份合同、144 笔付款和 96 条验收记录，发现 ${contractStats.riskCount} 份风险合同，其中超合同付款 ${contractStats.overpaidCount} 份、未验收先付款 ${contractStats.noAcceptanceCount} 份、付款进度超验收 ${contractStats.aheadCount} 份、逾期未完成 ${contractStats.overdueCount} 份；风险清单已生成。`,
});
