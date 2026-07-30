import { describe, expect, it } from "vitest";
import { toSheetToolPatchResult } from "./sheetToolResult.js";

describe("toSheetToolPatchResult", () => {
  it("projects the core mutation as the chat delta", () => {
    const mutation = {
      type: "write" as const,
      operations: [
        { type: "range" as const, startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "x" },
      ],
    };

    expect(
      toSheetToolPatchResult({
        mutationId: "mutation-1",
        sheetId: 7,
        baseRevision: 2,
        revision: 3,
        mutation,
        changeSummary: { changedCellCount: 1, changedRanges: ["A1"], operationCount: 1 },
        snapshot: { celldata: [], config: null },
      }),
    ).toEqual({
      delta: mutation,
      baseRevision: 2,
      revision: 3,
      changeSummary: { changedCellCount: 1, changedRanges: ["A1"], operationCount: 1 },
    });
  });
});
