import { describe, expect, it, vi } from "vitest";
import { importWorkbookFile, normalizeSheet, workbookNameFromFile } from "./workbookImporter";

vi.mock("./workbookFileAdapter", () => ({
  transformFileToFortuneSheets: vi.fn(async () => [
    {
      id: "rId1",
      name: "数据",
      celldata: [
        {
          r: 0,
          c: 0,
          v: { v: "标题", m: "标题", mc: { r: 0, c: 0, rs: 1, cs: 2 } },
        },
      ],
      config: { merge: { A1: { r: 0, c: 0, rs: 1, cs: 2 } } },
      chart: [],
    },
  ]),
}));

describe("workbookImporter", () => {
  it("derives a workbook name from the uploaded file", () => {
    expect(workbookNameFromFile(new File([], "预算.xlsx"))).toBe("预算");
  });

  it("normalizes FortuneSheet metadata without dropping styles", () => {
    const sheet = normalizeSheet(
      {
        name: "数据",
        celldata: [{ r: 0, c: 0, v: { v: "标题", m: "标题", fc: "#112233" } }],
        config: { columnlen: { 0: 120 } },
        chart: [{ id: "chart-1" }],
      },
      0,
    );

    expect(sheet.name).toBe("数据");
    expect(sheet.celldata[0]?.v.fc).toBe("#112233");
    expect(sheet.config.config).toEqual({ columnlen: { 0: 120 } });
    expect(sheet.config.chart).toEqual([{ id: "chart-1" }]);
  });

  it("fills omitted display values from FortuneExcel for empty styled cells", () => {
    const sheet = normalizeSheet(
      {
        name: "数据",
        celldata: [{ r: 2, c: 3, v: { bg: "#FFFF00", fc: "#000000" } }],
      },
      0,
    );

    expect(sheet.celldata).toEqual([
      { r: 2, c: 3, v: { bg: "#FFFF00", fc: "#000000", v: "", m: "" } },
    ]);
    expect(() => JSON.stringify(sheet)).not.toThrow();
  });

  it("defaults omitted font colors to black for canvas rendering", () => {
    const sheet = normalizeSheet(
      { name: "数据", celldata: [{ r: 0, c: 0, v: { v: "默认黑色" } } as never] },
      0,
    );

    expect(sheet.celldata[0]?.v.fc).toBe("#000000");
  });

  it("flattens single-run inline strings for FortuneSheet rendering", () => {
    const sheet = normalizeSheet(
      {
        name: "数据",
        celldata: [
          {
            r: 3,
            c: 0,
            v: {
              v: "",
              m: "",
              ct: { fa: "General", t: "inlineStr", s: [{ v: "产能利用率", fc: "#000000" }] },
            },
          },
        ],
      },
      0,
    );

    expect(sheet.celldata[0]?.v).toMatchObject({ v: "产能利用率", m: "产能利用率" });
    expect(sheet.celldata[0]?.v.ct).toEqual({ fa: "General", t: "s" });
  });

  it("wraps primitive converter values in the FortuneSheet value shape", () => {
    const sheet = normalizeSheet({ name: "数据", celldata: [{ r: 0, c: 0, v: 123 } as never] }, 0);

    expect(sheet.celldata[0]?.v).toEqual({ v: 123, m: "123", fc: "#000000" });
  });

  it("converts an imported file into the shared import DTO", async () => {
    const imported = await importWorkbookFile(new File([], "预算.xlsx"));

    expect(imported.name).toBe("预算");
    expect(imported.sheets[0]?.name).toBe("数据");
    expect(imported.sheets[0]?.merges).toEqual([{ row: [0, 0], col: [0, 1] }]);
  });
});
