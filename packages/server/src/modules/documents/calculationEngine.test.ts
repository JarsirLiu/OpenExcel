import { describe, expect, it } from "vitest";
import { FormulaCalculationEngine } from "./calculationEngine.js";

describe("FormulaCalculationEngine", () => {
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
});
