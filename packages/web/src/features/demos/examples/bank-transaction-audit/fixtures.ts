import type { DemoCell, DemoPatch, DemoStep, DemoWorkbook } from "../../runtime/replayTypes";

const headerBlue = "#DCE6F1";
const ruleBlue = "#EAF2F8";
const warningRed = "#FCE8E6";
const warningAmber = "#FFF4CE";
const successGreen = "#E2F0D9";
const moneyFormat = "#,##0.00";

const cell = (value: string | number, background?: string, numberFormat?: string): DemoCell => ({
  value,
  ...(background ? { background } : {}),
  ...(numberFormat ? { numberFormat } : {}),
});

type AuditResult = {
  status: "正常" | "异常";
  reason: string;
  risk: "低" | "中" | "高";
  category?: string;
};

type BankTransaction = {
  serial: string;
  time: string;
  counterparty: string;
  summary: string;
  income: number;
  expense: number;
  balance: number;
  audit: AuditResult;
};

export const bankAuditTransactions: BankTransaction[] = [
  {
    serial: "TX20260701001",
    time: "2026-07-01 09:05",
    counterparty: "星河商贸有限公司",
    summary: "销售货款",
    income: 180000,
    expense: 0,
    balance: 1180000,
    audit: { status: "正常", reason: "未发现异常", risk: "低" },
  },
  {
    serial: "TX20260701002",
    time: "2026-07-01 10:18",
    counterparty: "华东包装材料厂",
    summary: "采购付款",
    income: 0,
    expense: 125000,
    balance: 1055000,
    audit: { status: "正常", reason: "未发现异常", risk: "低" },
  },
  {
    serial: "TX20260701003",
    time: "2026-07-01 11:42",
    counterparty: "鸿远供应链有限公司",
    summary: "项目回款",
    income: 560000,
    expense: 0,
    balance: 1615000,
    audit: { status: "异常", reason: "单笔收入超过 500,000 元", risk: "高", category: "大额交易" },
  },
  {
    serial: "TX20260701004",
    time: "2026-07-01 13:16",
    counterparty: "",
    summary: "办公设备采购",
    income: 0,
    expense: 68000,
    balance: 1547000,
    audit: { status: "异常", reason: "对方户名缺失", risk: "中", category: "字段缺失" },
  },
  {
    serial: "TX20260701005",
    time: "2026-07-01 14:20",
    counterparty: "启明咨询有限公司",
    summary: "咨询服务费",
    income: 0,
    expense: 25000,
    balance: 1522000,
    audit: { status: "异常", reason: "流水号重复", risk: "中", category: "重复流水" },
  },
  {
    serial: "TX20260701005",
    time: "2026-07-01 14:21",
    counterparty: "启明咨询有限公司",
    summary: "咨询服务费",
    income: 0,
    expense: 25000,
    balance: 1497000,
    audit: { status: "异常", reason: "流水号重复", risk: "中", category: "重复流水" },
  },
  {
    serial: "TX20260701007",
    time: "2026-07-01 15:03",
    counterparty: "云帆信息技术有限公司",
    summary: "系统服务结算",
    income: 12000,
    expense: 12000,
    balance: 1497000,
    audit: {
      status: "异常",
      reason: "同笔交易收入与支出同时存在",
      risk: "高",
      category: "收支逻辑",
    },
  },
  {
    serial: "TX20260701008",
    time: "2026-07-01 15:48",
    counterparty: "北辰零售有限公司",
    summary: "渠道回款",
    income: 85000,
    expense: 0,
    balance: 1582000,
    audit: { status: "正常", reason: "未发现异常", risk: "低" },
  },
  {
    serial: "TX20260701009",
    time: "2026-07-01 16:12",
    counterparty: "城际物流有限公司",
    summary: "物流费用",
    income: 0,
    expense: 42000,
    balance: 1545000,
    audit: {
      status: "异常",
      reason: "余额应为 1,540,000.00，实际为 1,545,000.00",
      risk: "高",
      category: "余额异常",
    },
  },
  {
    serial: "TX20260701010",
    time: "2026-07-01 16:35",
    counterparty: "远景科技有限公司",
    summary: "临时借款往来",
    income: 300000,
    expense: 0,
    balance: 1845000,
    audit: {
      status: "异常",
      reason: "借款往来，且 23 分钟后出现同额反向交易",
      risk: "高",
      category: "短时往返",
    },
  },
  {
    serial: "TX20260701011",
    time: "2026-07-01 16:58",
    counterparty: "远景科技有限公司",
    summary: "临时借款退回",
    income: 0,
    expense: 300000,
    balance: 1545000,
    audit: {
      status: "异常",
      reason: "与上一笔交易构成短时同额资金往返",
      risk: "高",
      category: "短时往返",
    },
  },
  {
    serial: "TX20260701012",
    time: "2026-07-01 17:09",
    counterparty: "嘉禾物业管理有限公司",
    summary: "费用冲销",
    income: 0,
    expense: 0,
    balance: 1545000,
    audit: { status: "异常", reason: "收入与支出均为 0", risk: "中", category: "收支逻辑" },
  },
  {
    serial: "TX20260702001",
    time: "2026-07-02 09:14",
    counterparty: "安达设备有限公司",
    summary: "设备维护费",
    income: 0,
    expense: 95000,
    balance: 1450000,
    audit: { status: "正常", reason: "未发现异常", risk: "低" },
  },
  {
    serial: "TX20260702002",
    time: "2026-07-02 10:27",
    counterparty: "盛源原料有限公司",
    summary: "原材料采购",
    income: 0,
    expense: 880000,
    balance: 570000,
    audit: { status: "异常", reason: "单笔支出超过 500,000 元", risk: "高", category: "大额交易" },
  },
  {
    serial: "TX20260702003",
    time: "2026-07-02 11:03",
    counterparty: "新港贸易有限公司",
    summary: "销售回款",
    income: 120000,
    expense: 0,
    balance: 690000,
    audit: { status: "正常", reason: "未发现异常", risk: "低" },
  },
  {
    serial: "TX20260702004",
    time: "2026-07-02 13:32",
    counterparty: "泰和人力资源有限公司",
    summary: "劳务服务费",
    income: 0,
    expense: 50000,
    balance: 650000,
    audit: {
      status: "异常",
      reason: "余额应为 640,000.00，实际为 650,000.00",
      risk: "高",
      category: "余额异常",
    },
  },
];

const transactionHeaders = [
  "交易流水号",
  "交易时间",
  "对方户名",
  "交易摘要",
  "收入金额",
  "支出金额",
  "账户余额",
  "核查状态",
  "异常原因",
  "风险等级",
];

const transactionRows: DemoCell[][] = [
  transactionHeaders.map((value) => cell(value, headerBlue)),
  ...bankAuditTransactions.map((transaction) => [
    cell(transaction.serial),
    cell(transaction.time),
    cell(transaction.counterparty),
    cell(transaction.summary),
    cell(transaction.income, undefined, moneyFormat),
    cell(transaction.expense, undefined, moneyFormat),
    cell(transaction.balance, undefined, moneyFormat),
    cell(""),
    cell(""),
    cell(""),
  ]),
];

const ruleRows: DemoCell[][] = [
  [
    cell("规则编号", ruleBlue),
    cell("核查项目", ruleBlue),
    cell("核查条件", ruleBlue),
    cell("风险等级", ruleBlue),
  ],
  [cell("R01"), cell("必填字段"), cell("流水号、交易时间、对方户名不得为空"), cell("中")],
  [cell("R02"), cell("重复流水"), cell("交易流水号必须唯一"), cell("中")],
  [cell("R03"), cell("收支逻辑"), cell("收入和支出必须且只能有一项大于 0"), cell("高")],
  [cell("R04"), cell("余额连续性"), cell("本期余额 = 上期余额 + 收入 - 支出"), cell("高")],
  [cell("R05"), cell("大额交易"), cell("单笔收入或支出超过 500,000 元"), cell("高")],
  [cell("R06"), cell("短时资金往返"), cell("24 小时内同一对手方出现同额反向交易"), cell("高")],
  [cell("期初余额"), cell(1000000, undefined, moneyFormat), cell("核查第一笔流水时使用"), cell("")],
];

const exceptionHeaders = [
  "交易流水号",
  "交易时间",
  "对方户名",
  "交易摘要",
  "收入金额",
  "支出金额",
  "风险等级",
  "异常原因",
];
const exceptionRows: DemoCell[][] = [
  exceptionHeaders.map((value) => cell(value, headerBlue)),
  ...Array.from({ length: 11 }, () => exceptionHeaders.map(() => cell(""))),
];

const summaryRows: DemoCell[][] = [
  [cell("核查指标", headerBlue), cell("结果", headerBlue), cell("说明", headerBlue)],
  ...Array.from({ length: 9 }, () => [cell(""), cell(""), cell("")]),
];

export const bankAuditInitialWorkbooks: DemoWorkbook[] = [
  {
    name: "银行流水核查演示",
    publicId: "demo-bank-audit-workbook",
    sheets: [
      { name: "银行流水", columns: transactionHeaders, rows: transactionRows },
      {
        name: "核查规则",
        columns: ["规则编号", "核查项目", "核查条件", "风险等级"],
        rows: ruleRows,
      },
      { name: "异常明细", columns: exceptionHeaders, rows: exceptionRows },
      { name: "核查汇总", columns: ["核查指标", "结果", "说明"], rows: summaryRows },
    ],
  },
];

const statusPatches: DemoPatch[] = bankAuditTransactions.map((transaction, index) => {
  const background = transaction.audit.status === "异常" ? warningRed : successGreen;
  return {
    sheet: "银行流水",
    row: index + 2,
    startCol: 8,
    values: [
      cell(transaction.audit.status, background),
      cell(transaction.audit.reason, background),
      cell(transaction.audit.risk, transaction.audit.risk === "高" ? warningRed : background),
    ],
  };
});

const exceptionPatches: DemoPatch[] = bankAuditTransactions
  .filter((transaction) => transaction.audit.status === "异常")
  .map((transaction, index) => ({
    sheet: "异常明细",
    row: index + 2,
    startCol: 1,
    values: [
      cell(transaction.serial),
      cell(transaction.time),
      cell(transaction.counterparty),
      cell(transaction.summary),
      cell(transaction.income, undefined, moneyFormat),
      cell(transaction.expense, undefined, moneyFormat),
      cell(transaction.audit.risk, transaction.audit.risk === "高" ? warningRed : warningAmber),
      cell(transaction.audit.reason),
    ],
  }));

const summaryData: DemoCell[][] = [
  [cell("核查交易总数"), cell(16), cell("银行流水第 2 至 17 行")],
  [cell("正常交易"), cell(5, successGreen), cell("未触发任何核查规则")],
  [cell("异常交易"), cell(11, warningRed), cell("异常率 68.75%")],
  [cell("高风险交易"), cell(7, warningRed), cell("建议优先人工复核")],
  [cell("中风险交易"), cell(4, warningAmber), cell("建议补充凭证或基础信息")],
  [cell("大额交易"), cell(2), cell("超过 500,000 元")],
  [cell("重复流水"), cell(2), cell("同一流水号出现两次")],
  [cell("余额异常"), cell(2), cell("账面余额与连续计算不一致")],
  [cell("其他异常"), cell(5), cell("字段缺失、收支逻辑和短时往返")],
];

const summaryPatches: DemoPatch[] = summaryData.map((values, index) => ({
  sheet: "核查汇总",
  row: index + 2,
  startCol: 1,
  values,
}));

export const bankAuditPrompt =
  "请核查《银行流水核查演示》中的全部交易流水。检查重复流水、必填字段缺失、收入支出逻辑、余额连续性和大额异常交易。将核查状态及异常原因写回原表，并把所有异常交易整理到「异常明细」Sheet，最后生成「核查汇总」。请保留原表格式和已有数据。";

export const bankAuditTimeline: DemoStep[] = [
  {
    id: "inspect-transactions",
    phase: "分析",
    title: "识别流水结构",
    toolName: "readSheetData",
    toolInput: "读取「银行流水」A1:J17，识别流水号、交易时间、对方户名、收支金额和余额列",
    toolOutput:
      "读取 16 笔交易；E、F 列分别为收入和支出，G 列为账户余额，H:J 为待写入的核查结果区域",
    assistantText:
      "我先读取银行流水结构，确认核查范围和关键字段。当前共有 16 笔交易，H 到 J 列预留用于写入核查状态、异常原因和风险等级。",
    tokens: [
      "我先读取银行流水结构，确认核查范围和关键字段。当前共有 16 笔交易，H 到 J 列预留用于写入核查状态、异常原因和风险等级。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "银行流水",
    highlight: "A1:J17",
  },
  {
    id: "read-rules",
    phase: "分析",
    title: "读取核查规则",
    toolName: "readSheetData",
    toolInput: "读取「核查规则」A1:D8，提取期初余额、大额阈值和各项核查条件",
    toolOutput:
      "加载 6 项规则；期初余额 1,000,000 元；大额交易阈值 500,000 元；短时往返窗口 24 小时",
    assistantText:
      "核查规则已加载：除必填、重复和收支逻辑外，还要逐笔验证余额连续性，并关注超过 50 万元的大额交易和 24 小时内的同额资金往返。",
    tokens: [
      "核查规则已加载：除必填、重复和收支逻辑外，还要逐笔验证余额连续性，并关注超过 50 万元的大额交易和 24 小时内的同额资金往返。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "核查规则",
    highlight: "A1:D8",
  },
  {
    id: "find-missing-fields",
    phase: "核查",
    title: "定位缺失字段",
    toolName: "findSheetCells",
    toolInput: "在「银行流水」A2:C17 中查找空单元格，检查流水号、交易时间和对方户名",
    toolOutput: "发现 1 个必填字段缺失：C5 对方户名为空；流水号和交易时间完整",
    assistantText: "必填字段检查发现一处问题：第 5 行的对方户名为空。流水号和交易时间没有缺失。",
    tokens: ["必填字段检查发现一处问题：第 5 行的对方户名为空。流水号和交易时间没有缺失。"],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "银行流水",
    highlight: "A2:C17",
    toolExecutionDuration: 520,
  },
  {
    id: "check-duplicate-and-cashflow",
    phase: "核查",
    title: "检查重复及收支逻辑",
    toolName: "readSheetData",
    toolInput: "读取 A2:F17，对流水号去重并检查每笔交易的收入、支出是否符合互斥规则",
    toolOutput: "TX20260701005 重复 2 次；第 8 行收入和支出同时为 12,000；第 13 行收入和支出均为 0",
    assistantText:
      "发现两类结构性异常：流水号 TX20260701005 重复出现；另外一笔交易收入与支出同时存在，还有一笔交易收支均为零。",
    tokens: [
      "发现两类结构性异常：流水号 TX20260701005 重复出现；另外一笔交易收入与支出同时存在，还有一笔交易收支均为零。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "银行流水",
    highlight: "A2:F17",
  },
  {
    id: "check-balance-and-risk",
    phase: "核查",
    title: "核对余额及风险交易",
    toolName: "readSheetData",
    toolInput: "根据期初余额逐行核对 E:G，并检查大额交易和同一对手方的短时同额反向交易",
    toolOutput:
      "发现 2 笔余额不连续、2 笔大额交易；远景科技在 23 分钟内发生 300,000 元同额收支往返",
    assistantText:
      "余额连续性检查发现两处账面差异；同时识别出两笔超过 50 万元的大额交易，以及远景科技在 23 分钟内发生的 30 万元同额资金往返。",
    tokens: [
      "余额连续性检查发现两处账面差异；同时识别出两笔超过 50 万元的大额交易，以及远景科技在 23 分钟内发生的 30 万元同额资金往返。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "银行流水",
    highlight: "C2:G17",
    toolExecutionDuration: 920,
  },
  {
    id: "write-audit-status",
    phase: "写入",
    title: "回写核查结论",
    toolName: "writeCells",
    toolInput: "将每笔交易的核查状态、异常原因和风险等级写入「银行流水」H2:J17",
    toolOutput: "已写入 48 个核查结果字段：5 笔正常，11 笔异常，其中高风险 7 笔、中风险 4 笔",
    assistantText:
      "核查结论已经写回原始流水。16 笔交易中有 5 笔正常、11 笔异常；高风险交易会优先标红，方便财务人员复核。",
    tokens: [
      "核查结论已经写回原始流水。16 笔交易中有 5 笔正常、11 笔异常；高风险交易会优先标红，方便财务人员复核。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "银行流水",
    highlight: "H1:J17",
    patch: statusPatches,
    toolExecutionDuration: 980,
  },
  {
    id: "write-exceptions",
    phase: "写入",
    title: "生成异常明细",
    toolName: "writeCells",
    toolInput: "提取全部异常交易，写入「异常明细」A2:H12，并保留金额格式和风险等级",
    toolOutput: "已生成 11 条异常明细，包含原始流水信息、风险等级和可复核的异常原因",
    assistantText:
      "我把 11 笔异常交易整理到了独立的「异常明细」Sheet，保留原流水信息，并附上风险等级和具体异常原因。",
    tokens: [
      "我把 11 笔异常交易整理到了独立的「异常明细」Sheet，保留原流水信息，并附上风险等级和具体异常原因。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "异常明细",
    highlight: "A1:H12",
    patch: exceptionPatches,
    toolExecutionDuration: 1080,
  },
  {
    id: "write-summary",
    phase: "写入",
    title: "生成核查汇总",
    toolName: "writeCells",
    toolInput: "将核查数量、风险等级及异常类型统计写入「核查汇总」A2:C10",
    toolOutput: "已生成 9 项核查指标；异常率 68.75%，高风险交易 7 笔，需优先人工复核",
    assistantText: "核查汇总已经生成，包含异常率、风险等级分布以及大额、重复、余额等异常类型统计。",
    tokens: ["核查汇总已经生成，包含异常率、风险等级分布以及大额、重复、余额等异常类型统计。"],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "核查汇总",
    highlight: "A1:C10",
    patch: summaryPatches,
  },
  {
    id: "verify-results",
    phase: "复核",
    title: "复核核查结果",
    toolName: "readSheetData",
    toolInput: "重新读取「银行流水」H2:J17 与「核查汇总」A1:C10，验证明细和汇总数量一致",
    toolOutput: "核查状态共 16 条；异常明细 11 条；汇总正常 5、异常 11，数量一致",
    assistantText:
      "复核完成：原表共 16 条核查状态，异常明细 11 条，汇总中的正常 5 笔、异常 11 笔与明细完全一致。",
    tokens: [
      "复核完成：原表共 16 条核查状态，异常明细 11 条，汇总中的正常 5 笔、异常 11 笔与明细完全一致。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "核查汇总",
    highlight: "A1:C10",
  },
  {
    id: "finish",
    phase: "完成",
    title: "完成银行流水核查",
    assistantText:
      "银行流水核查完成：已在原表标记异常、生成异常明细和核查汇总。建议优先复核 7 笔高风险交易，并补充缺失对手方及相关业务凭证。",
    tokens: [
      "银行流水核查完成：已在原表标记异常、生成异常明细和核查汇总。建议优先复核 7 笔高风险交易，并补充缺失对手方及相关业务凭证。",
    ],
    activeWorkbook: "银行流水核查演示",
    activeSheet: "核查汇总",
  },
];
