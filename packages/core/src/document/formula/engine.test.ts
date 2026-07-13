import { describe, expect, it } from "vitest";
import { FormulaCalculationEngine, parseFormula } from "./index.js";

describe("FormulaCalculationEngine", () => {
  it("parses formulas into serializable AST nodes", () => {
    const ast = parseFormula("=SUMIFS('外来表'!$C$1:$C$3,'外来表'!$A$1:$A$3,A1)");

    expect(ast).toMatchObject({ type: "function", name: "SUMIFS" });
    expect(JSON.parse(JSON.stringify(ast))).toEqual(ast);
  });

  it("calculates dependent formulas and propagates changes", () => {
    const engine = new FormulaCalculationEngine([
      {
        name: "Sheet1",
        cells: [
          { row: 0, col: 0, value: { value: 10 } },
          { row: 0, col: 1, value: { value: 20 } },
          { row: 0, col: 2, value: { value: null, formula: "=A1+B1" } },
          { row: 0, col: 3, value: { value: null, formula: "=C1*2" } },
        ],
      },
    ]);

    expect(engine.calculateFormula("Sheet1", 0, 2).value).toBe(30);
    expect(engine.calculateFormula("Sheet1", 0, 3).value).toBe(60);

    const changed = engine.applyCells([{ sheetName: "Sheet1", row: 0, col: 0, value: 15 }]);

    expect(changed.map((cell) => [cell.row, cell.col, cell.value])).toEqual([
      [0, 0, 15],
      [0, 2, 35],
      [0, 3, 70],
    ]);
    engine.destroy();
  });

  it("supports ranges, functions, cross-sheet references, and cycle errors", () => {
    const engine = new FormulaCalculationEngine([
      {
        name: "Data",
        cells: [
          { row: 0, col: 0, value: { value: 2 } },
          { row: 1, col: 0, value: { value: 3 } },
          { row: 2, col: 0, value: { value: 5 } },
        ],
      },
      {
        name: "Summary",
        cells: [
          { row: 0, col: 0, value: { value: null, formula: "=SUM(Data!A1:A3)" } },
          { row: 0, col: 1, value: { value: null, formula: "=A1/2" } },
          { row: 1, col: 0, value: { value: null, formula: "=B2" } },
          { row: 1, col: 1, value: { value: null, formula: "=A2" } },
        ],
      },
    ]);

    expect(engine.calculateFormula("Summary", 0, 0).value).toBe(10);
    expect(engine.calculateFormula("Summary", 0, 1).value).toBe(5);
    expect(engine.calculateFormula("Summary", 1, 0).error).toBe("CYCLE");
    engine.destroy();
  });

  it("supports cross-sheet multi-criteria lookups", () => {
    const engine = new FormulaCalculationEngine([
      {
        name: "外来表",
        cells: [
          { row: 0, col: 0, value: { value: "门店A" } },
          { row: 0, col: 1, value: { value: "商品1" } },
          { row: 0, col: 2, value: { value: 0.18 } },
          { row: 1, col: 0, value: { value: "门店A" } },
          { row: 1, col: 1, value: { value: "商品2" } },
          { row: 1, col: 2, value: { value: 0.13 } },
          { row: 2, col: 0, value: { value: "门店B" } },
          { row: 2, col: 1, value: { value: "商品1" } },
          { row: 2, col: 2, value: { value: 0.05 } },
        ],
      },
      {
        name: "报表",
        cells: [
          { row: 0, col: 0, value: { value: "门店A" } },
          { row: 0, col: 1, value: { value: "商品1" } },
          {
            row: 0,
            col: 2,
            value: {
              value: null,
              formula: "=SUMIFS('外来表'!$C$1:$C$3,'外来表'!$A$1:$A$3,A1,'外来表'!$B$1:$B$3,B1)",
            },
          },
          {
            row: 0,
            col: 3,
            value: { value: null, formula: "=13%+5%" },
          },
          {
            row: 0,
            col: 4,
            value: {
              value: null,
              formula: "=IFERROR(INDEX('外来表'!$C$1:$C$3,MATCH(A1,'外来表'!$A$1:$A$3,0)),0)",
            },
          },
        ],
      },
    ]);

    expect(engine.calculateFormula("报表", 0, 2).value).toBe(0.18);
    expect(engine.calculateFormula("报表", 0, 3).value).toBe(0.18);
    expect(engine.calculateFormula("报表", 0, 4).value).toBe(0.18);
    engine.destroy();
  });

  it("supports vertical, horizontal, and approximate lookups", () => {
    const engine = new FormulaCalculationEngine([
      {
        name: "Data",
        cells: [
          { row: 0, col: 0, value: { value: 1 } },
          { row: 0, col: 1, value: { value: "低" } },
          { row: 0, col: 2, value: { value: 10 } },
          { row: 1, col: 0, value: { value: 2 } },
          { row: 1, col: 1, value: { value: "中" } },
          { row: 1, col: 2, value: { value: 20 } },
          { row: 2, col: 0, value: { value: 3 } },
          { row: 2, col: 1, value: { value: "高" } },
          { row: 2, col: 2, value: { value: 30 } },
        ],
      },
      {
        name: "Horizontal",
        cells: [
          { row: 0, col: 0, value: { value: 1 } },
          { row: 0, col: 1, value: { value: 2 } },
          { row: 0, col: 2, value: { value: 3 } },
          { row: 1, col: 0, value: { value: "低" } },
          { row: 1, col: 1, value: { value: "中" } },
          { row: 1, col: 2, value: { value: "高" } },
        ],
      },
      {
        name: "Summary",
        cells: [
          { row: 0, col: 0, value: { value: 2 } },
          { row: 0, col: 1, value: { value: null, formula: "=VLOOKUP(A1,Data!A1:C3,3,FALSE)" } },
          { row: 0, col: 2, value: { value: null, formula: "=VLOOKUP(2.5,Data!A1:C3,3,TRUE)" } },
          { row: 0, col: 3, value: { value: null, formula: "=MATCH(2.5,Data!A1:A3,1)" } },
          {
            row: 0,
            col: 4,
            value: { value: null, formula: "=HLOOKUP(2,Horizontal!A1:C2,2,FALSE)" },
          },
        ],
      },
    ]);

    expect(engine.calculateFormula("Summary", 0, 1).value).toBe(20);
    expect(engine.calculateFormula("Summary", 0, 2).value).toBe(20);
    expect(engine.calculateFormula("Summary", 0, 3).value).toBe(2);
    expect(engine.calculateFormula("Summary", 0, 4).value).toBe("中");
    engine.destroy();
  });

  it("supports arithmetic, conditional aggregates, text functions, and 2D index", () => {
    const engine = new FormulaCalculationEngine([
      {
        name: "Data",
        cells: [
          { row: 0, col: 0, value: { value: 1 } },
          { row: 0, col: 1, value: { value: 10 } },
          { row: 0, col: 2, value: { value: "North" } },
          { row: 1, col: 0, value: { value: 2 } },
          { row: 1, col: 1, value: { value: 20 } },
          { row: 1, col: 2, value: { value: "South" } },
          { row: 2, col: 0, value: { value: 3 } },
          { row: 2, col: 1, value: { value: 30 } },
          { row: 2, col: 2, value: { value: "North" } },
        ],
      },
      {
        name: "Summary",
        cells: [
          { row: 0, col: 0, value: { value: null, formula: "=SUMPRODUCT(Data!A1:A3,Data!B1:B3)" } },
          {
            row: 0,
            col: 1,
            value: { value: null, formula: '=AVERAGEIF(Data!C1:C3,"North",Data!B1:B3)' },
          },
          { row: 0, col: 2, value: { value: null, formula: "=INDEX(Data!A1:C3,2,3)" } },
          { row: 0, col: 3, value: { value: null, formula: "=ROUNDUP(-1.231,2)" } },
          { row: 0, col: 4, value: { value: null, formula: "=ROUNDDOWN(-1.239,2)" } },
          { row: 0, col: 5, value: { value: null, formula: "=MOD(-3,2)" } },
          {
            row: 0,
            col: 6,
            value: { value: null, formula: '=SUBSTITUTE(TRIM("  a   b  ")," ","-")' },
          },
          {
            row: 0,
            col: 7,
            value: { value: null, formula: '=IFNA(MATCH(99,Data!A1:A3,0),"missing")' },
          },
          { row: 0, col: 8, value: { value: null, formula: "=ISERROR(1/0)" } },
        ],
      },
    ]);

    expect(engine.calculateFormula("Summary", 0, 0).value).toBe(140);
    expect(engine.calculateFormula("Summary", 0, 1).value).toBe(20);
    expect(engine.calculateFormula("Summary", 0, 2).value).toBe("South");
    expect(engine.calculateFormula("Summary", 0, 3).value).toBe(-1.24);
    expect(engine.calculateFormula("Summary", 0, 4).value).toBe(-1.23);
    expect(engine.calculateFormula("Summary", 0, 5).value).toBe(1);
    expect(engine.calculateFormula("Summary", 0, 6).value).toBe("a-b");
    expect(engine.calculateFormula("Summary", 0, 7).value).toBe("missing");
    expect(engine.calculateFormula("Summary", 0, 8).value).toBe(true);
    engine.destroy();
  });

  it("evaluates lazy branches without touching the unused branch", () => {
    const engine = new FormulaCalculationEngine([
      {
        name: "Sheet1",
        cells: [
          { row: 0, col: 0, value: { value: null, formula: "=IF(TRUE,1,1/0)" } },
          { row: 0, col: 1, value: { value: null, formula: "=IFERROR(1/0,2)" } },
          { row: 0, col: 2, value: { value: null, formula: "=IFNA(MATCH(9,A1:A1,0),3)" } },
          { row: 0, col: 3, value: { value: 1 } },
          { row: 0, col: 4, value: { value: null, formula: "=XLOOKUP(2,A1:A1,A1:A1,1/0)" } },
          { row: 0, col: 5, value: { value: null, formula: "=XLOOKUP(1,A1:A1,A1:A1,1/0)" } },
        ],
      },
    ]);

    expect(engine.calculateFormula("Sheet1", 0, 0).value).toBe(1);
    expect(engine.calculateFormula("Sheet1", 0, 1).value).toBe(2);
    expect(engine.calculateFormula("Sheet1", 0, 2).value).toBe(3);
    expect(engine.calculateFormula("Sheet1", 0, 4).error).toBe("DIV_BY_ZERO");
    expect(engine.calculateFormula("Sheet1", 0, 5).value).toBe(1);
    engine.destroy();
  });
});
