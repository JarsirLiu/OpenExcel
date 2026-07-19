export type DemoCell = {
  value: string | number;
  formula?: string;
};

export type DemoSheet = {
  name: string;
  columns: string[];
  rows: DemoCell[][];
};

export type DemoPatch = {
  sheet: string;
  row: number;
  startCol: number;
  values: DemoCell[];
};

export type DemoStep = {
  id: string;
  phase: "分析" | "匹配" | "写入" | "汇总" | "完成";
  title: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  assistantText: string;
  tokens: string[];
  activeSheet?: string;
  highlight?: string;
  patch?: DemoPatch | DemoPatch[];
};

const cell = (value: string | number, formula?: string): DemoCell => ({ value, formula });

const feeRows = [
  [
    "2023001001",
    "经济学院",
    "2023",
    4800,
    1200,
    0,
    0,
    6000,
    6000,
    0,
    "已缴清",
    "家长代缴，学号匹配",
  ],
  [
    "2023001002",
    "信息学院",
    "2023",
    5200,
    1200,
    1000,
    3200,
    5200,
    5400,
    200,
    "部分缴费",
    "学费已缴，减免已审核",
  ],
  [
    "2023001003",
    "外国语学院",
    "2023",
    4800,
    0,
    0,
    0,
    10600,
    4800,
    0,
    "重复/超额",
    "同一学号出现两笔相同流水",
  ],
  ["2023001004", "经济学院", "2023", 4800, 1200, 0, 0, 0, 6000, 6000, "未缴", "未找到到账流水"],
  [
    "2023001005",
    "信息学院",
    "2024",
    5200,
    1200,
    1500,
    0,
    4900,
    4900,
    0,
    "已缴清",
    "困难生减免已扣除",
  ],
  ["2023001006", "外国语学院", "2024", 4800, 1200, 0, 0, 6000, 6000, 0, "已缴清", "绿色通道待复核"],
  ["2023001007", "经济学院", "2024", 4800, 1200, 0, 0, 6000, 6000, 0, "已缴清", ""],
  ["2023001008", "信息学院", "2024", 5200, 0, 0, 0, 5200, 5200, 0, "已缴清", ""],
  [
    "2023001009",
    "外国语学院",
    "2024",
    4800,
    1200,
    0,
    0,
    4800,
    6000,
    1200,
    "部分缴费",
    "住宿费尚未缴清",
  ],
  ["2023001010", "经济学院", "2024", 4800, 1200, 0, 0, 6000, 6000, 0, "已缴清", ""],
  [
    "2023001011",
    "信息学院",
    "2024",
    5200,
    1200,
    0,
    0,
    3200,
    6400,
    3200,
    "部分缴费",
    "仅收到部分到账",
  ],
  ["2023001012", "外国语学院", "2024", 4800, 0, 800, 0, 4000, 4000, 0, "已缴清", "校级减免已审核"],
].map((row, rowIndex) => {
  const excelRow = rowIndex + 2;
  return [
    cell(row[0] as string),
    cell(row[1] as string),
    cell(row[2] as string),
    cell(row[3] as number),
    cell(row[4] as number),
    cell(row[5] as number),
    cell(row[6] as number),
    cell(row[7] as number),
    cell(row[8] as number, `=D${excelRow}+E${excelRow}-F${excelRow}`),
    cell(row[9] as number, `=MAX(I${excelRow}-H${excelRow},0)`),
    cell(
      row[10] as string,
      `=IF(H${excelRow}=0,"未缴",IF(H${excelRow}<I${excelRow},"部分缴费",IF(H${excelRow}>I${excelRow},"重复/超额","已缴清")))`,
    ),
    cell(row[11] as string),
  ];
});

export const studentFeePrompt =
  "请核对 2024-2025 学年学生收费台账。根据学号匹配银行到账，结合减免和助学贷款，补齐应收净额、待缴金额、缴费状态公式，并按学院汇总。请保留原始字段，在现有工作簿中完成核对。";

export const studentFeeInitialSheets: DemoSheet[] = [
  {
    name: "学生收费台账",
    columns: [
      "学号",
      "学院",
      "年级",
      "学费",
      "住宿费",
      "减免",
      "助学贷款",
      "银行到账",
      "应收净额",
      "待缴金额",
      "缴费状态",
      "核对备注",
    ],
    rows: [
      [
        cell("学号"),
        cell("学院"),
        cell("年级"),
        cell("学费"),
        cell("住宿费"),
        cell("减免"),
        cell("助学贷款"),
        cell("银行到账"),
        cell("应收净额"),
        cell("待缴金额"),
        cell("缴费状态"),
        cell("核对备注"),
      ],
      ...feeRows.map((row) =>
        row.map((item, index) => (index >= 8 && index <= 10 ? cell("") : item)),
      ),
    ],
  },
  {
    name: "学院收费汇总",
    columns: ["学院", "学生人数", "应收总额", "已缴总额", "欠费总额", "缴费完成率"],
    rows: [
      [
        cell("学院"),
        cell("学生人数"),
        cell("应收总额"),
        cell("已缴总额"),
        cell("欠费总额"),
        cell("缴费完成率"),
      ],
      [cell("经济学院"), cell(""), cell(""), cell(""), cell(""), cell("")],
      [cell("信息学院"), cell(""), cell(""), cell(""), cell(""), cell("")],
      [cell("外国语学院"), cell(""), cell(""), cell(""), cell(""), cell("")],
    ],
  },
];

export const studentFeeSteps: DemoStep[] = [
  {
    id: "inspect",
    phase: "分析",
    title: "读取收费台账",
    toolName: "readSheetData",
    toolInput: "读取学生收费台账 A1:L13，识别金额字段、到账字段和已有公式",
    toolOutput: "读取 12 名学生记录，识别 8 个金额字段；发现应收净额、待缴金额和状态列需要补齐公式",
    assistantText:
      "我先读取学生收费台账，确认学费、住宿费、减免、贷款和银行到账字段，并检查现有计算列。",
    tokens: [
      "我先读取学生收费台账，确认学费、住宿费、减免、贷款和银行到账字段，并检查现有计算列。",
    ],
    activeSheet: "学生收费台账",
    highlight: "A1:L13",
  },
  {
    id: "match",
    phase: "匹配",
    title: "核对到账与异常",
    toolName: "readSheetData",
    toolInput: "读取学生收费台账 A2:H13，按学号核对银行到账，识别分次到账、重复到账和未到账",
    toolOutput: "已核对 12 人：7 人金额相符，3 人部分缴费，1 人重复/超额，1 人未到账",
    assistantText: "我按学号核对银行到账，保留分次到账和重复流水的异常，不把异常金额直接冲掉。",
    tokens: ["我按学号核对银行到账，保留分次到账和重复流水的异常，不把异常金额直接冲掉。"],
    activeSheet: "学生收费台账",
    highlight: "A2:H13",
  },
  {
    id: "write-formulas",
    phase: "写入",
    title: "补齐学生级计算",
    toolName: "writeCells",
    toolInput: "为 I2:K13 写入应收净额、待缴金额和缴费状态公式，并保留异常备注",
    toolOutput:
      "已写入 36 个公式单元格；应收净额 = 学费 + 住宿费 - 减免，待缴金额使用 MAX 防止出现负数",
    assistantText:
      "字段已经匹配完成。现在写入学生级公式，让台账能随着金额调整自动重算，并保留异常备注。",
    tokens: [
      "字段已经匹配完成。现在写入学生级公式，让台账能随着金额调整自动重算，并保留异常备注。",
    ],
    activeSheet: "学生收费台账",
    highlight: "I2:K13",
    patch: feeRows.map((row, index) => {
      const rowNumber = index + 2;
      return {
        sheet: "学生收费台账",
        row: rowNumber,
        startCol: 9,
        values: [
          cell(row[8].value, `=D${rowNumber}+E${rowNumber}-F${rowNumber}`),
          cell(row[9].value, `=MAX(I${rowNumber}-H${rowNumber},0)`),
          cell(
            row[10].value,
            `=IF(H${rowNumber}=0,"未缴",IF(H${rowNumber}<I${rowNumber},"部分缴费",IF(H${rowNumber}>I${rowNumber},"重复/超额","已缴清")))`,
          ),
        ],
      };
    }),
  },
  {
    id: "write-exceptions",
    phase: "写入",
    title: "更新异常行",
    toolName: "writeCells",
    toolInput: "更新异常学生的银行到账、计算结果和核对备注，写入 H3:L5、H10:L12",
    toolOutput: "已更新 5 行异常记录：3 人部分缴费、1 人重复/超额、1 人未缴；公式保留在 I:K 列",
    assistantText: "我再更新异常行，重点标出部分缴费、重复到账和未到账记录，供财务处后续核销。",
    tokens: ["我再更新异常行，重点标出部分缴费、重复到账和未到账记录，供财务处后续核销。"],
    activeSheet: "学生收费台账",
    highlight: "H3:L12",
    patch: [
      {
        sheet: "学生收费台账",
        row: 3,
        startCol: 8,
        values: [
          cell(5200),
          cell(5400, "=D3+E3-F3"),
          cell(200, "=MAX(I3-H3,0)"),
          cell("部分缴费", '=IF(H3=0,"未缴",IF(H3<I3,"部分缴费",IF(H3>I3,"重复/超额","已缴清")))'),
          cell("学费已缴，减免已审核"),
        ],
      },
      {
        sheet: "学生收费台账",
        row: 4,
        startCol: 8,
        values: [
          cell(10600),
          cell(4800, "=D4+E4-F4"),
          cell(0, "=MAX(I4-H4,0)"),
          cell("重复/超额", '=IF(H4=0,"未缴",IF(H4<I4,"部分缴费",IF(H4>I4,"重复/超额","已缴清")))'),
          cell("同一学号出现两笔相同流水"),
        ],
      },
      {
        sheet: "学生收费台账",
        row: 5,
        startCol: 8,
        values: [
          cell(0),
          cell(6000, "=D5+E5-F5"),
          cell(6000, "=MAX(I5-H5,0)"),
          cell("未缴", '=IF(H5=0,"未缴",IF(H5<I5,"部分缴费",IF(H5>I5,"重复/超额","已缴清")))'),
          cell("未找到到账流水"),
        ],
      },
      {
        sheet: "学生收费台账",
        row: 10,
        startCol: 8,
        values: [
          cell(4800),
          cell(6000, "=D10+E10-F10"),
          cell(1200, "=MAX(I10-H10,0)"),
          cell(
            "部分缴费",
            '=IF(H10=0,"未缴",IF(H10<I10,"部分缴费",IF(H10>I10,"重复/超额","已缴清")))',
          ),
          cell("住宿费尚未缴清"),
        ],
      },
      {
        sheet: "学生收费台账",
        row: 12,
        startCol: 8,
        values: [
          cell(3200),
          cell(6400, "=D12+E12-F12"),
          cell(3200, "=MAX(I12-H12,0)"),
          cell(
            "部分缴费",
            '=IF(H12=0,"未缴",IF(H12<I12,"部分缴费",IF(H12>I12,"重复/超额","已缴清")))',
          ),
          cell("仅收到部分到账"),
        ],
      },
    ],
  },
  {
    id: "summary",
    phase: "汇总",
    title: "生成学院汇总",
    toolName: "writeCells",
    toolInput: "在学院收费汇总 A1:F4 写入 COUNTIF、SUMIF 和完成率公式",
    toolOutput: "已生成 3 个学院汇总；汇总公式引用学生收费台账，后续调整学生金额会自动更新",
    assistantText:
      "最后按学院汇总人数、应收、已缴、欠费和完成率，给财务处一张可以继续维护的汇总表。",
    tokens: ["最后按学院汇总人数、应收、已缴、欠费和完成率，给财务处一张可以继续维护的汇总表。"],
    activeSheet: "学院收费汇总",
    highlight: "B2:F4",
    patch: [
      {
        sheet: "学院收费汇总",
        row: 2,
        startCol: 2,
        values: [
          cell(4, "=COUNTIF('学生收费台账'!B2:B13,A2)"),
          cell(24000, "=SUMIF('学生收费台账'!B2:B13,A2,'学生收费台账'!I2:I13)"),
          cell(18000, "=SUMIF('学生收费台账'!B2:B13,A2,'学生收费台账'!H2:H13)"),
          cell(6000, "=SUMIF('学生收费台账'!B2:B13,A2,'学生收费台账'!J2:J13)"),
          cell("75.00%", "=IF(C2=0,0,D2/C2)"),
        ],
      },
      {
        sheet: "学院收费汇总",
        row: 3,
        startCol: 2,
        values: [
          cell(4, "=COUNTIF('学生收费台账'!B2:B13,A3)"),
          cell(21900, "=SUMIF('学生收费台账'!B2:B13,A3,'学生收费台账'!I2:I13)"),
          cell(18500, "=SUMIF('学生收费台账'!B2:B13,A3,'学生收费台账'!H2:H13)"),
          cell(3400, "=SUMIF('学生收费台账'!B2:B13,A3,'学生收费台账'!J2:J13)"),
          cell("84.47%", "=IF(C3=0,0,MIN(D3/C3,1))"),
        ],
      },
      {
        sheet: "学院收费汇总",
        row: 4,
        startCol: 2,
        values: [
          cell(4, "=COUNTIF('学生收费台账'!B2:B13,A4)"),
          cell(20800, "=SUMIF('学生收费台账'!B2:B13,A4,'学生收费台账'!I2:I13)"),
          cell(25400, "=SUMIF('学生收费台账'!B2:B13,A4,'学生收费台账'!H2:H13)"),
          cell(1200, "=SUMIF('学生收费台账'!B2:B13,A4,'学生收费台账'!J2:J13)"),
          cell("100.00%", "=IF(C4=0,0,MIN(D4/C4,1))"),
        ],
      },
    ],
  },
  {
    id: "finish",
    phase: "完成",
    title: "完成对账",
    assistantText:
      "对账完成。原始收费字段已保留，学生级计算和学院汇总都使用公式，异常记录也已单独标注。",
    tokens: [
      "对账完成。原始收费字段已保留，学生级计算和学院汇总都使用公式，异常记录也已单独标注。",
    ],
    activeSheet: "学院收费汇总",
  },
];

export const studentFeeStats = [
  { label: "学生记录", value: "12" },
  { label: "学院", value: "3" },
  { label: "待处理金额", value: "¥10,600" },
];
