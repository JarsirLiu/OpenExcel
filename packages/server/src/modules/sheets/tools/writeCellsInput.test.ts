import { describe, expect, it } from "vitest";
import { normalizeWriteOperations } from "./writeCellsInput.js";

describe("write cells input", () => {
  it("preserves the explicit tool coordinate contract", () => {
    const input = {
      sheetId: 7,
      operations: [
        { type: "cell" as const, row: 2, col: 3, value: "value", formula: "=A1" },
        { type: "range" as const, startRow: 4, startCol: 1, endRow: 5, endCol: 2, value: 10 },
      ],
    };

    expect(normalizeWriteOperations(input)).toEqual(input);
  });
});
