import type { DemoCell, DemoPatch, DemoStep, DemoWorkbook } from "../../runtime/replayTypes";

const blue = "#00B0F0";
const green = "#92D050";
const yellow = "#FFFF00";

const cell = (value: string | number, formula?: string, background?: string): DemoCell => ({
  value,
  ...(formula ? { formula } : {}),
  ...(background ? { background } : {}),
});

type Product = {
  code: string;
  barcode: string;
  name: string;
  mnemonic: string;
  category: string;
  unit: string;
  stock: string;
  cost: string;
  sale: string;
  purchase: number;
  purchaseReturn: number;
  retailReturn: number;
  sales: number;
  end: number;
};

const products: Product[] = [
  {
    code: "10000002",
    barcode: "6928804010220",
    name: "雪碧碳酸饮料清爽柠檬味500ml",
    mnemonic: "xbtsylqsnmw500ml",
    category: "饮料",
    unit: "瓶",
    stock: "38.000",
    cost: "2.42",
    sale: "3.50",
    purchase: 48,
    purchaseReturn: 0,
    retailReturn: 0,
    sales: 8,
    end: 40,
  },
  {
    code: "10000003",
    barcode: "6923644223458",
    name: "蒙牛纯牛奶利乐包250ml",
    mnemonic: "mncnnllb250ml",
    category: "饮料",
    unit: "盒",
    stock: "52.000",
    cost: "2.30",
    sale: "3.00",
    purchase: 72,
    purchaseReturn: 0,
    retailReturn: 0,
    sales: 6,
    end: 66,
  },
  {
    code: "10000004",
    barcode: "6928804011326",
    name: "芬达碳酸饮料橙味500ml",
    mnemonic: "fdtsylcw500ml",
    category: "饮料",
    unit: "瓶",
    stock: "42.000",
    cost: "2.42",
    sale: "3.50",
    purchase: 48,
    purchaseReturn: 0,
    retailReturn: 0,
    sales: 2,
    end: 46,
  },
  {
    code: "10000005",
    barcode: "6921168520015",
    name: "农夫山泉饮用天然水1.5L",
    mnemonic: "nfsqyytrs15L",
    category: "饮料",
    unit: "瓶",
    stock: "4.000",
    cost: "2.00",
    sale: "3.00",
    purchase: 24,
    purchaseReturn: 0,
    retailReturn: 0,
    sales: 9,
    end: 15,
  },
  {
    code: "10000006",
    barcode: "6907749000473",
    name: "金龙泉纯清啤酒8度听装330ml",
    mnemonic: "jlqcqpj8dtz330ml",
    category: "烟酒",
    unit: "瓶",
    stock: "31.000",
    cost: "1.67",
    sale: "2.50",
    purchase: 48,
    purchaseReturn: 0,
    retailReturn: 0,
    sales: 8,
    end: 40,
  },
  {
    code: "10000007",
    barcode: "6924862101085",
    name: "美年达碳酸饮料橙味600ml",
    mnemonic: "mndtsylcw600ml",
    category: "饮料",
    unit: "瓶",
    stock: "40.000",
    cost: "2.25",
    sale: "3.00",
    purchase: 48,
    purchaseReturn: 0,
    retailReturn: 0,
    sales: 8,
    end: 40,
  },
  {
    code: "10000008",
    barcode: "6901285991219",
    name: "怡宝饮用纯净水555ml/瓶",
    mnemonic: "ybyycjs555mlp",
    category: "饮料",
    unit: "瓶",
    stock: "24.000",
    cost: "1.00",
    sale: "2.00",
    purchase: 48,
    purchaseReturn: 0,
    retailReturn: 0,
    sales: 16,
    end: 32,
  },
  {
    code: "10000009",
    barcode: "6934350402716",
    name: "天利肉松面包90g",
    mnemonic: "tlrsmb90g",
    category: "食品",
    unit: "袋",
    stock: "0.000",
    cost: "1.50",
    sale: "2.00",
    purchase: 10,
    purchaseReturn: 9,
    retailReturn: 0,
    sales: 1,
    end: 0,
  },
  {
    code: "10000010",
    barcode: "6972792860961",
    name: "沙琪玛",
    mnemonic: "sqm",
    category: "食品",
    unit: "袋",
    stock: "0.000",
    cost: "8.00",
    sale: "10.00",
    purchase: 7,
    purchaseReturn: 5,
    retailReturn: 0,
    sales: 2,
    end: 0,
  },
  {
    code: "10000011",
    barcode: "6921555581049",
    name: "粉丝馆够味酸辣粉103g",
    mnemonic: "fsggwslf103g",
    category: "食品",
    unit: "盒",
    stock: "35.000",
    cost: "3.98",
    sale: "5.20",
    purchase: 60,
    purchaseReturn: 12,
    retailReturn: 0,
    sales: 8,
    end: 40,
  },
];

const priceColumns = [
  "机构",
  "编码",
  "条码",
  "商品名称",
  "规格",
  "单位",
  "库存数量",
  "成本价",
  "成本金额",
  "售价",
  "售价金额",
  "参考毛利率",
  "最新进价",
  "最高进价",
  "最低进价",
  "主供应商",
  "类别",
  "品牌",
];

const quantityColumns = [
  "编码",
  "条码",
  "商品名称",
  "助记码",
  "分类",
  "规格",
  "单位",
  "供应商",
  "期初数量",
  "期初金额",
  "初始化库存数量",
  "初始化库存金额",
  "采购进货数量",
  "采购进货金额",
  "采购退货数量",
  "采购退货金额",
  "领用入库数量",
  "领用入库金额",
  "领用出库数量",
  "领用出库金额",
  "调拨入库数量",
  "调拨入库金额",
  "调拨出库数量",
  "调拨出库金额",
  "损溢入库数量",
  "损溢入库金额",
  "损溢出库数量",
  "损溢出库金额",
  "盘盈数量",
  "盘盈金额",
  "盘亏数量",
  "盘亏金额",
  "零售退货入库数量",
  "零售退货入库金额",
  "零售销售出库数量",
  "零售销售出库金额",
  "线上零售退货入库数量",
  "线上零售退货入库金额",
  "线上零售销售出库数量",
  "线上零售销售出库金额",
  "成本调整数量",
  "成本调整金额",
  "扣补金额",
  "期末数量",
  "期末金额",
];

const reportColumns = [
  "产品类别",
  "产品名称",
  "单位",
  "进货单价",
  "进货数量",
  "进货金额",
  "销售单价",
  "销售数量",
  "销售金额",
  "退货数量",
  "退货金额",
  "零售退货\n入库数量",
  "零售退货\n入库金额",
  "利润",
  "成本调\n整数量",
  "成本调\n整金额",
  "期末存量",
  "期末金额",
  "备注",
];

const priceHeaderRow = priceColumns.map((value, index) =>
  cell(value, undefined, [7, 10].includes(index + 1) ? blue : undefined),
);

const priceRows: DemoCell[][] = [
  [
    cell(
      "综合筛选:                                         \t区域:                                             \t机构: 单位超市 \n品牌:                                             \t供应商:                                           \t商品分类: \n商品:                                             \t商品状态: 全部                                    \t库存状态: 全部\n库存异常: 全部                                    \t",
    ),
    ...Array.from({ length: 17 }, () => cell("")),
  ],
  priceHeaderRow,
  ...products.map((product) => [
    cell("单位超市 "),
    cell(product.code),
    cell(product.barcode),
    cell(product.name),
    cell(""),
    cell(product.unit),
    cell(product.stock),
    cell(product.cost, undefined, blue),
    cell((Number(product.stock) * Number(product.cost)).toFixed(2)),
    cell(product.sale, undefined, blue),
    cell((Number(product.stock) * Number(product.sale)).toFixed(2)),
    cell(
      `${(((Number(product.sale) - Number(product.cost)) / Number(product.sale)) * 100).toFixed(2)}%`,
    ),
    cell(product.name === "粉丝馆够味酸辣粉103g" ? "3.84" : product.cost),
    cell(product.name === "粉丝馆够味酸辣粉103g" ? "4.16" : product.cost),
    cell(product.name === "粉丝馆够味酸辣粉103g" ? "3.840" : `${Number(product.cost).toFixed(3)}`),
    cell("自购"),
    cell(product.category),
    cell(""),
  ]),
  [
    cell("合计"),
    ...Array.from({ length: 5 }, () => cell("")),
    cell("5680.000"),
    cell(""),
    cell("34697.17"),
    cell(""),
    cell("43128.70"),
    ...Array.from({ length: 7 }, () => cell("")),
  ],
];

const zeroPairs = (count: number) => Array.from({ length: count }, () => ["0.000", "0.00"]).flat();

const quantityRows: DemoCell[][] = [
  quantityColumns.map((value, index) =>
    cell(value, undefined, index >= 12 && [32, 34, 40, 41, 43].includes(index) ? green : undefined),
  ),
  ...products.map((product) => {
    const purchaseAmount = Number(product.cost) * product.purchase;
    const purchaseReturnAmount = Number(product.cost) * product.purchaseReturn;
    const salesAmount = Number(product.cost) * product.sales;
    const endAmount = Number(product.cost) * product.end;
    const values = [
      product.code,
      product.barcode,
      product.name,
      product.mnemonic,
      product.category,
      "",
      product.unit,
      "自购",
      "0.000",
      "0.00",
      "0.000",
      "0.00",
      `${product.purchase}.000`,
      purchaseAmount.toFixed(2),
      `${product.purchaseReturn}.000`,
      purchaseReturnAmount.toFixed(2),
      ...zeroPairs(8),
      `${product.retailReturn}.000`,
      (Number(product.cost) * product.retailReturn).toFixed(2),
      `${product.sales}.000`,
      salesAmount.toFixed(2),
      ...zeroPairs(2),
      "0.000",
      "0.00",
      "0.00",
      `${product.end}.000`,
      endAmount.toFixed(2),
    ];
    return values.map((value, index) =>
      cell(value, undefined, [12, 14, 32, 34, 40, 41, 43].includes(index) ? green : undefined),
    );
  }),
  [
    cell(""),
    cell("合计"),
    ...Array.from({ length: 10 }, () => cell("")),
    cell("5790.000"),
    cell("25159.49"),
    cell("192.000"),
    cell("729.04"),
    ...zeroPairs(8).map((value) => cell(value)),
    cell("2.000"),
    cell("10.00"),
    cell("1537.000"),
    cell("7705.74"),
    ...zeroPairs(2).map((value) => cell(value)),
    cell("24.000"),
    cell("230.00"),
    cell("0.00"),
    cell("4039.000"),
    cell("16504.71"),
  ],
];

const reportHeaderRow = reportColumns.map((value, index) => {
  const column = index + 1;
  const background = [4, 7].includes(column)
    ? blue
    : [5, 8, 10, 12, 15, 16, 17].includes(column)
      ? green
      : undefined;
  return cell(value, undefined, background);
});

const reportFormulaRow = (product: Product, rowNumber: number, filled = false): DemoCell[] => {
  const cost = filled ? product.cost : "";
  const purchase = filled ? product.purchase : "";
  const sale = filled ? product.sale : "";
  const sales = filled ? product.sales : "";
  const purchaseReturn = filled ? product.purchaseReturn : "";
  const retailReturn = filled ? product.retailReturn : "";
  const end = filled ? product.end : "";
  const formulaValue = (value: number | string, formula: string) => cell(value, formula);
  return [
    cell(product.category),
    cell(product.name),
    cell(product.unit),
    cell(cost, undefined, blue),
    cell(purchase, undefined, green),
    formulaValue(
      filled ? Number(product.cost) * product.purchase : "",
      `=D${rowNumber}*E${rowNumber}`,
    ),
    cell(sale, undefined, blue),
    cell(sales, undefined, green),
    formulaValue(
      filled ? Number(product.sale) * product.sales : "",
      `=G${rowNumber}*H${rowNumber}`,
    ),
    cell(purchaseReturn, undefined, green),
    formulaValue(
      filled ? Number(product.cost) * product.purchaseReturn : "",
      `=D${rowNumber}*J${rowNumber}`,
    ),
    cell(retailReturn, undefined, green),
    formulaValue(
      filled ? Number(product.cost) * product.retailReturn : "",
      `=D${rowNumber}*L${rowNumber}`,
    ),
    formulaValue(
      filled ? Number(product.sale) - Number(product.cost) : "",
      `=G${rowNumber}-D${rowNumber}`,
    ),
    cell(0, undefined, green),
    cell(0, undefined, green),
    formulaValue(
      filled ? end : "",
      `=E${rowNumber}-H${rowNumber}-J${rowNumber}+L${rowNumber}-O${rowNumber}`,
    ),
    formulaValue(filled ? Number(product.cost) * product.end : "", `=D${rowNumber}*Q${rowNumber}`),
    cell(""),
  ];
};

const reportTotalRow = (filled = false): DemoCell[] => {
  const values = reportColumns.map(() => cell(""));
  values[0] = cell("合计", undefined, yellow);
  const totals: Record<number, [string, string | number]> = {
    5: ["=SUM(E3:E12)", filled ? 413 : ""],
    6: ["=SUM(F3:F12)", filled ? 991.88 : ""],
    8: ["=SUM(H3:H12)", filled ? 68 : ""],
    9: ["=SUM(I3:I12)", filled ? 219.6 : ""],
    10: ["=SUM(J3:J12)", filled ? 26 : ""],
    11: ["=SUM(K3:K12)", filled ? 101.26 : ""],
    12: ["=SUM(L3:L12)", filled ? 0 : ""],
    13: ["=SUM(M3:M12)", filled ? 0 : ""],
    15: ["=SUM(O3:O12)", filled ? 0 : ""],
    16: ["=SUM(P3:P12)", filled ? 0 : ""],
    17: ["=SUM(Q3:Q12)", filled ? 319 : ""],
    18: ["=SUM(R3:R12)", filled ? 737.92 : ""],
  };
  for (const [column, [formula, value]] of Object.entries(totals)) {
    values[Number(column) - 1] = cell(value, formula, yellow);
  }
  return values;
};

const targetWorkbookName = "3.超市产品进货、出货统计表-5.18";
const priceWorkbookName = "1.系统单价表";
const quantityWorkbookName = "2.单品进销存20260516202238";
const targetSheetName = "4月";

export const inventoryReconciliationPrompt =
  "请核对文件《3.超市产品进货、出货统计表-5.18》。以表3 B列产品名称为匹配键：从文件《1.系统单价表》中补齐表3的进货单价和销售单价，再从文件《2.单品进销存20260516202238》中补齐进货数量、退货数量、销售数量、零售退货入库数量和期末存量。保留金额、利润和期末金额公式，并检查匹配结果。";

export const inventoryInitialWorkbooks: DemoWorkbook[] = [
  {
    name: priceWorkbookName,
    publicId: "demo-system-price-table",
    sheets: [{ name: "库存查询", columns: priceColumns, rows: priceRows }],
  },
  {
    name: quantityWorkbookName,
    publicId: "demo-single-product-inventory",
    sheets: [{ name: "单品进销存", columns: quantityColumns, rows: quantityRows }],
  },
  {
    name: targetWorkbookName,
    publicId: "demo-supermarket-product-report",
    sheets: [
      {
        name: targetSheetName,
        columns: reportColumns,
        rows: [
          reportColumns.map((_, index) => cell(index === 0 ? "超市产品进货、出货明细" : "")),
          reportHeaderRow,
          ...products.map((product, index) => reportFormulaRow(product, index + 3)),
          reportTotalRow(),
          reportColumns.map(() => cell("")),
        ],
      },
    ],
  },
];

const pricePatches: DemoPatch[] = products.map((product, index) => ({
  workbook: targetWorkbookName,
  sheet: targetSheetName,
  row: index + 3,
  startCol: 4,
  values: [
    cell(product.cost, undefined, blue),
    cell("", undefined, green),
    cell("", `=D${index + 3}*E${index + 3}`),
    cell(product.sale, undefined, blue),
    cell("", undefined, green),
    cell("", `=G${index + 3}*H${index + 3}`),
    cell("", undefined, green),
    cell("", `=D${index + 3}*J${index + 3}`),
    cell("", undefined, green),
    cell("", `=D${index + 3}*L${index + 3}`),
    cell(Number(product.sale) - Number(product.cost), `=G${index + 3}-D${index + 3}`),
  ],
}));

const quantityPatches: DemoPatch[] = products.map((product, index) => {
  const rowNumber = index + 3;
  return {
    workbook: targetWorkbookName,
    sheet: targetSheetName,
    row: rowNumber,
    startCol: 5,
    values: [
      cell(product.purchase, undefined, green),
      cell(Number(product.cost) * product.purchase, `=D${rowNumber}*E${rowNumber}`),
      cell(product.sale, undefined, blue),
      cell(product.sales, undefined, green),
      cell(Number(product.sale) * product.sales, `=G${rowNumber}*H${rowNumber}`),
      cell(product.purchaseReturn, undefined, green),
      cell(Number(product.cost) * product.purchaseReturn, `=D${rowNumber}*J${rowNumber}`),
      cell(product.retailReturn, undefined, green),
      cell(Number(product.cost) * product.retailReturn, `=D${rowNumber}*L${rowNumber}`),
      cell(Number(product.sale) - Number(product.cost), `=G${rowNumber}-D${rowNumber}`),
      cell(0, undefined, green),
      cell(0, undefined, green),
      cell(product.end, `=E${rowNumber}-H${rowNumber}-J${rowNumber}+L${rowNumber}-O${rowNumber}`),
    ],
  };
});

export const inventoryTimeline: DemoStep[] = [
  {
    id: "read-report",
    phase: "分析",
    title: "读取表3核对表",
    toolName: "readSheetData",
    toolInput: `读取文件《${targetWorkbookName}》的 Sheet「${targetSheetName}」A1:S14，识别产品名称和待补齐列`,
    toolOutput:
      "读取 10 条商品记录；表3的价格列和 5 个数量匹配列为空，金额、利润和期末金额公式已保留",
    assistantText: "我先读取表3核对表，确认产品名称在 B 列，并标记蓝色价格列和绿色数量列。",
    tokens: ["我先读取表3核对表，确认产品名称在 B 列，并标记蓝色价格列和绿色数量列。"],
    activeWorkbook: targetWorkbookName,
    activeSheet: targetSheetName,
    highlight: "A1:S14",
  },
  {
    id: "read-prices",
    phase: "分析",
    title: "读取表1系统单价",
    toolName: "readSheetData",
    toolInput: `读取文件《${priceWorkbookName}》的 Sheet「库存查询」A1:R13，按商品名称建立成本价和售价索引`,
    toolOutput: "读取原始系统单价表的 10 条商品记录，成本价位于 H 列，售价位于 J 列",
    assistantText: "再读取独立的表1系统单价文件，按商品名称提取 H 列成本价和 J 列售价。",
    tokens: ["再读取独立的表1系统单价文件，按商品名称提取 H 列成本价和 J 列售价。"],
    activeWorkbook: priceWorkbookName,
    activeSheet: "库存查询",
    highlight: "A1:R13",
  },
  {
    id: "read-quantities",
    phase: "分析",
    title: "读取表2单品进销存",
    toolName: "readSheetData",
    toolInput: `读取文件《${quantityWorkbookName}》的 Sheet「单品进销存」A1:AS12，提取 M、O、AG、AI、AR 列`,
    toolOutput: "读取原始单品进销存文件的 10 条商品记录，数量字段均可按商品名称匹配",
    assistantText:
      "最后读取独立的表2单品进销存文件，提取采购进货、采购退货、零售退货入库、零售销售和期末数量。",
    tokens: [
      "最后读取独立的表2单品进销存文件，提取采购进货、采购退货、零售退货入库、零售销售和期末数量。",
    ],
    activeWorkbook: quantityWorkbookName,
    activeSheet: "单品进销存",
    highlight: "A1:AS12",
  },
  {
    id: "write-prices",
    phase: "写入",
    title: "写入表3价格",
    toolName: "writeCells",
    toolInput: "以表3 B列商品名称匹配表1，写入表3 D3:D12 进货单价和 G3:G12 销售单价",
    toolOutput: "已匹配 10 个商品的成本价和售价；利润公式随价格写入后立即更新",
    assistantText: "价格索引已建立。我先把表1的成本价和售价写回表3，保留原有利润公式。",
    tokens: ["价格索引已建立。我先把表1的成本价和售价写回表3，保留原有利润公式。"],
    activeWorkbook: targetWorkbookName,
    activeSheet: targetSheetName,
    highlight: "D2:N12",
    patch: pricePatches,
  },
  {
    id: "write-quantities",
    phase: "写入",
    title: "写入表3数量",
    toolName: "writeCells",
    toolInput: "以表3 B列商品名称匹配表2，写入表3 E、H、J、L、Q 列，并更新金额和期末存量公式",
    toolOutput:
      "已写入 50 个数量字段；进货金额、销售金额、退货金额、零售退货金额、期末存量和期末金额已同步计算",
    assistantText:
      "价格核对完成。现在把表2的五类数量写入表3，让金额、利润、期末存量和合计公式落地。",
    tokens: ["价格核对完成。现在把表2的五类数量写入表3，让金额、利润、期末存量和合计公式落地。"],
    activeWorkbook: targetWorkbookName,
    activeSheet: targetSheetName,
    highlight: "E2:R13",
    patch: [
      ...quantityPatches,
      {
        workbook: targetWorkbookName,
        sheet: targetSheetName,
        row: 13,
        startCol: 5,
        values: reportTotalRow(true).slice(4, 18),
      },
    ],
  },
  {
    id: "verify",
    phase: "复核",
    title: "复核表3结果",
    toolName: "readSheetData",
    toolInput: `重新读取文件《${targetWorkbookName}》的 Sheet「${targetSheetName}」D2:R13，检查匹配列和公式列`,
    toolOutput: "10 个商品均完成匹配；天利肉松面包、沙琪玛的采购退货已保留，期末存量按公式为 0",
    assistantText:
      "我重新读取表3结果区域，确认三个独立文件之间的商品名称全部匹配，并保留采购退货造成的库存变化。",
    tokens: [
      "我重新读取表3结果区域，确认三个独立文件之间的商品名称全部匹配，并保留采购退货造成的库存变化。",
    ],
    activeWorkbook: targetWorkbookName,
    activeSheet: targetSheetName,
    highlight: "D2:R13",
  },
  {
    id: "finish",
    phase: "完成",
    title: "完成三表核对",
    assistantText:
      "三表核对完成。表1和表2保持独立文件，表3已按商品名称写入价格与数量，金额、利润、期末存量和合计继续使用公式。",
    tokens: [
      "三表核对完成。表1和表2保持独立文件，表3已按商品名称写入价格与数量，金额、利润、期末存量和合计继续使用公式。",
    ],
    activeWorkbook: targetWorkbookName,
    activeSheet: targetSheetName,
  },
];

export const inventoryStats = [
  { label: "独立文件", value: "3" },
  { label: "匹配商品", value: "10" },
  { label: "待填字段", value: "70" },
];
