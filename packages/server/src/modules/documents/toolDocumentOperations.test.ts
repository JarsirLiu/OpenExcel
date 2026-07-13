import { describe, expect, it } from "vitest";
import {
  clearOperationToDocument,
  rangeForWriteOperation,
  writeOperationToDocument,
} from "./toolDocumentOperations.js";

describe("tool document operations", () => {
  it("converts one-based cell writes to canonical coordinates", () => {
    expect(
      writeOperationToDocument({
        type: "cell",
        row: 3,
        col: 2,
        value: 42,
        formula: "=A1+1",
      }),
    ).toEqual({
      type: "setCell",
      row: 2,
      col: 1,
      value: { value: 42, displayValue: "42", formula: "A1+1" },
    });
  });

  it("creates a dense canonical range operation for range fills", () => {
    expect(
      writeOperationToDocument({
        type: "range",
        startRow: 2,
        startCol: 2,
        endRow: 3,
        endCol: 3,
        value: "ok",
      }),
    ).toEqual({
      type: "setRangeValues",
      range: { startRow: 1, startCol: 1, endRow: 2, endCol: 2 },
      values: [
        ["ok", "ok"],
        ["ok", "ok"],
      ],
    });
  });

  it("converts clear operations without touching renderer data", () => {
    expect(clearOperationToDocument({ type: "cell", row: 4, col: 5 })).toEqual({
      type: "clearRange",
      range: { startRow: 3, startCol: 4, endRow: 3, endCol: 4 },
    });
    expect(
      rangeForWriteOperation({
        type: "range",
        startRow: 2,
        startCol: 3,
        endRow: 4,
        endCol: 5,
        value: true,
      }),
    ).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 });
  });
});
