import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const money = (value: number) => demoCell(value, { numberFormat: "#,##0.00" });

const surnames = ["林", "周", "陈", "何", "许", "夏", "程", "苏", "沈", "顾", "梁", "陆"];
const givenNames = ["知夏", "沐阳", "予安", "嘉宁", "明川", "清禾", "远航", "晚晴", "星野", "砚秋"];
const colleges = [
  "材料科学与工程学院",
  "人工智能学院",
  "生命科学学院",
  "环境与资源学院",
  "经济管理学院",
  "人文与社会科学学院",
  "建筑与城市规划学院",
  "外国语学院",
];
const aidTypes = ["国家助学金", "校级困难补助", "勤工助学补贴", "临时困难补助"];
const aidAmounts = [2200, 1800, 1500, 1200];

function getAidRisk(patternIndex: number) {
  if (patternIndex === 0) {
    return {
      label: "疑似重复发放",
      tone: "danger" as const,
      suggestion: "冻结重复流水并联系银行办理退回",
    };
  }
  if (patternIndex === 1) {
    return {
      label: "发放金额不一致",
      tone: "danger" as const,
      suggestion: "复核审批金额和银行批次文件",
    };
  }
  if (patternIndex === 2) {
    return {
      label: "学籍状态不符合",
      tone: "warning" as const,
      suggestion: "核对休学生效日期并追回不应发金额",
    };
  }
  if (patternIndex === 3) {
    return {
      label: "审批后未发放",
      tone: "warning" as const,
      suggestion: "补入下一银行批次并通知学生",
    };
  }
  return {
    label: "发放正常",
    tone: "normal" as const,
    suggestion: "归档审批和银行回单",
  };
}

const aidStudents = Array.from({ length: 120 }, (_, index) => {
  const patternIndex = index % 30;
  const approvedAmount = aidAmounts[index % aidAmounts.length];
  const paymentCount = patternIndex === 0 ? 2 : patternIndex === 3 ? 0 : 1;
  const paymentAmount = patternIndex === 1 ? approvedAmount + 500 : approvedAmount;
  const totalPaid = paymentCount * paymentAmount;
  const risk = getAidRisk(patternIndex);

  return {
    id: `S2026${String(index + 1).padStart(4, "0")}`,
    name: `${surnames[index % surnames.length]}${givenNames[Math.floor(index / surnames.length) % givenNames.length]}`,
    college: colleges[index % colleges.length],
    grade: `${2023 + (index % 3)}级`,
    status: patternIndex === 2 ? "休学" : "在读",
    aidType: aidTypes[index % aidTypes.length],
    approvedAmount,
    paymentCount,
    paymentAmount,
    totalPaid,
    difference: totalPaid - approvedAmount,
    risk,
  };
});

const studentRows = aidStudents.map((student) =>
  demoRow(
    student.id,
    student.name,
    student.college,
    student.grade,
    student.status,
    `6228 **** **** ${String(3100 + Number(student.id.slice(-4))).padStart(4, "0")}`,
  ),
);

const approvalRows = aidStudents.map((student, index) =>
  demoRow(
    `ZZ2026${String(index + 1).padStart(4, "0")}`,
    student.id,
    student.aidType,
    money(student.approvedAmount),
    `2026-06-${String((index % 24) + 2).padStart(2, "0")}`,
    "已审批",
    student.college,
  ),
);

const paymentRows = aidStudents.flatMap((student, studentIndex) =>
  Array.from({ length: student.paymentCount }, (_, paymentIndex) =>
    demoRow(
      `FF26${String(studentIndex + 1).padStart(4, "0")}${paymentIndex + 1}`,
      student.id,
      student.aidType,
      money(student.paymentAmount),
      `2026-07-${String((studentIndex % 20) + 3).padStart(2, "0")}`,
      `BANK-AID-${String(Math.floor(studentIndex / 30) + 1).padStart(2, "0")}`,
      "成功",
    ),
  ),
);

const resultRows = aidStudents.map((student) =>
  demoRow(
    student.id,
    student.name,
    student.college,
    student.aidType,
    money(student.approvedAmount),
    money(student.totalPaid),
    money(student.difference),
    student.status,
    resultCell(student.risk.label, student.risk.tone),
    student.risk.suggestion,
  ),
);

const aidStats = aidStudents.reduce(
  (stats, student) => {
    stats.approved += student.approvedAmount;
    stats.paid += student.totalPaid;
    if (student.risk.label !== "发放正常") stats.riskCount += 1;
    if (student.risk.label === "疑似重复发放") stats.duplicateCount += 1;
    if (student.risk.label === "发放金额不一致") stats.amountMismatchCount += 1;
    if (student.risk.label === "学籍状态不符合") stats.statusCount += 1;
    if (student.risk.label === "审批后未发放") stats.missingCount += 1;
    return stats;
  },
  {
    approved: 0,
    paid: 0,
    riskCount: 0,
    duplicateCount: 0,
    amountMismatchCount: 0,
    statusCount: 0,
    missingCount: 0,
  },
);

const formatAmount = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

export const studentAidDisbursementDemo = createAnalysisScenario({
  id: "student-aid-disbursement",
  marketing: {
    category: "财务",
    marketingTitle: "学生资助资金发放核查",
    summary: "匹配资助审批、学籍状态和银行流水，识别重复发放、金额差异、资格异常与漏发。",
    coverImage: "/demo-covers/student-aid-disbursement.webp",
    coverAlt: "大学生携带书本在校园中结伴行走",
    proofMetric: `120 名学生 · 360 条记录 · ${aidStats.riskCount} 项异常`,
    featuredOrder: 5,
    theme: "sage",
  },
  workspaceId: -250,
  workspaceName: "学校财务演示",
  sessionName: "学生资助资金发放核查 Demo",
  prompt:
    "请关联学生学籍名单、资助审批和银行发放记录，逐人核对资助类型、审批金额、实际到账金额及当前学籍状态，识别重复发放、金额不一致、学籍资格异常和审批后漏发，并生成可交由学生工作部门处理的核查清单。",
  workbookName: "明川大学2026年学生资助发放台账",
  sourceSheets: [
    {
      name: "学生学籍",
      columns: ["学号", "姓名", "学院", "年级", "学籍状态", "银行卡号"],
      rows: studentRows,
    },
    {
      name: "资助审批",
      columns: ["审批单号", "学号", "资助类型", "审批金额", "审批日期", "审批状态", "申请学院"],
      rows: approvalRows,
    },
    {
      name: "银行发放",
      columns: ["发放流水号", "学号", "资助类型", "发放金额", "发放日期", "银行批次", "交易状态"],
      rows: paymentRows,
    },
  ],
  resultSheet: {
    name: "资助发放核查",
    columns: [
      "学号",
      "姓名",
      "学院",
      "资助类型",
      "审批金额",
      "实际发放",
      "发放差额",
      "学籍状态",
      "核查结论",
      "处理建议",
    ],
    rows: resultRows,
  },
  analysisSteps: [
    {
      id: "match-aid-approvals",
      title: "匹配学生与资助审批",
      assistantText: "我先按学号关联学籍名单和资助审批，核对资助类型、审批金额及审批状态。",
      toolInput: "读取「学生学籍」A1:F121 和「资助审批」A1:G121，按学号匹配已审批资助",
      toolOutput: `120 名学生全部匹配审批；审批金额合计 ${formatAmount(aidStats.approved)} 元；无重复审批单号`,
      activeSheet: "资助审批",
      highlight: "A1:G121",
    },
    {
      id: "aggregate-bank-disbursements",
      title: "汇总银行发放流水",
      assistantText:
        "接下来按学号和资助类型汇总成功流水，检查同一学生同一批次的重复交易及审批金额差异。",
      toolInput: "读取「银行发放」A1:G121，汇总 120 笔成功流水并检测重复交易",
      toolOutput: `银行成功流水 120 笔，实际发放 ${formatAmount(aidStats.paid)} 元；重复发放 ${aidStats.duplicateCount} 人，金额不一致 ${aidStats.amountMismatchCount} 人`,
      activeSheet: "银行发放",
      highlight: "A1:G121",
    },
    {
      id: "validate-aid-eligibility",
      title: "复核学籍资格与漏发",
      assistantText:
        "我再核对当前学籍状态，并从审批名单反查银行流水，识别休学期间不应发放和审批后未到账的学生。",
      toolInput: "交叉检查学籍状态、审批名单和银行流水，识别资格异常及漏发",
      toolOutput: `学籍状态不符合 ${aidStats.statusCount} 人；审批后未发放 ${aidStats.missingCount} 人；最终异常 ${aidStats.riskCount} 人`,
      activeSheet: "学生学籍",
      highlight: "A1:F121",
      toolExecutionDuration: 900,
    },
  ],
  writeTitle: "生成学生资助发放核查表",
  writeAssistantText:
    "我已将审批金额、实际发放、差额、学籍状态和处理建议写入核查表，方便财务处与学生工作部门逐人闭环。",
  writeToolInput: "将 120 名学生的资助核查结果写入「资助发放核查」A2:J121",
  writeToolOutput: `写入 120 条学生结果；正常 104 人，异常 ${aidStats.riskCount} 人`,
  verifyAssistantText:
    "复核完成：120 名学生、120 条审批和 120 笔银行流水均已覆盖，审批和发放合计与源表一致，每项异常均可追溯到学生及银行批次。",
  verifyToolOutput: `120 名学生全部匹配；审批 ${formatAmount(aidStats.approved)} 元；发放 ${formatAmount(aidStats.paid)} 元；异常 ${aidStats.riskCount} 人`,
  finalText: `学生资助发放核查完成：共检查 120 名学生和 120 笔银行流水，发现 ${aidStats.riskCount} 项异常，其中重复发放 ${aidStats.duplicateCount} 人、金额不一致 ${aidStats.amountMismatchCount} 人、学籍状态不符合 ${aidStats.statusCount} 人、审批后未发放 ${aidStats.missingCount} 人；核查清单已生成。`,
});
