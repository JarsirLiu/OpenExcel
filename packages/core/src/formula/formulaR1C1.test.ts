import { describe, expect, it } from "vitest";
import { formulaToR1C1 } from "./formulaR1C1.js";

describe("formulaToR1C1", () => {
  it("does not treat function names as cell references", () => {
    expect(formulaToR1C1("=LOG10(A1)", 0, 0)).toBe("=LOG10(RC)");
  });

  it("converts ranges and preserves formula text", () => {
    expect(formulaToR1C1("=SUM(A1:A10)", 9, 1)).toBe("=SUM(R[-9]C[-1]:RC[-1])");
  });

  it("preserves absolute and mixed references", () => {
    expect(formulaToR1C1("=$A$1+A$1+$A1", 4, 1)).toBe("=R1C1+R1C[-1]+R[-4]C1");
  });

  it("converts references after a quoted sheet name", () => {
    expect(formulaToR1C1("='销售表'!A1", 0, 0)).toBe("='销售表'!RC");
  });

  it("preserves cell-like text inside quoted sheet names", () => {
    expect(formulaToR1C1("='A1'!B2", 1, 1)).toBe("='A1'!RC");
    expect(formulaToR1C1("='Bob''s A1'!B2", 1, 1)).toBe("='Bob''s A1'!RC");
  });

  it("preserves cell-like text inside named ranges", () => {
    expect(formulaToR1C1("=MY_A1+1", 0, 0)).toBe("=MY_A1+1");
    expect(formulaToR1C1("=销售A1+1", 0, 0)).toBe("=销售A1+1");
  });

  it("preserves strings and structured references", () => {
    expect(formulaToR1C1('=IF(A1="A1",Table1[A1],0)', 0, 0)).toBe('=IF(RC="A1",Table1[A1],0)');
  });
});
