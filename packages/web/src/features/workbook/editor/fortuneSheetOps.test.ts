import { describe, expect, it } from "vitest";
import { collectFortuneSheetOpHints } from "./fortuneSheetOps";

describe("collectFortuneSheetOpHints", () => {
  it("does not require a snapshot for direct cell operations", () => {
    const hints = collectFortuneSheetOpHints(
      [
        { op: "replace", id: "60", path: ["data", 0, 0, "v"], value: 9 },
        {
          op: "replace",
          id: "60",
          path: ["data", 0, 1],
          value: { v: 9, m: "9", f: "=SUM(A1:A1)" },
        },
      ],
      60,
    );

    expect(hints.get(60)).toEqual({
      requiresSnapshot: false,
      changedCellKeys: new Set(["0,0", "0,1"]),
    });
  });

  it("requires a snapshot for structural or non-cell changes", () => {
    const hints = collectFortuneSheetOpHints(
      [{ op: "insertRowCol", id: "60", path: [], value: undefined }],
      60,
    );

    expect(hints.get(60)?.requiresSnapshot).toBe(true);
  });

  it("ignores runtime calcChain changes", () => {
    const hints = collectFortuneSheetOpHints(
      [{ op: "replace", id: "60", path: ["calcChain"], value: [] }],
      60,
    );

    expect(hints.get(60)).toBeUndefined();
  });
});
