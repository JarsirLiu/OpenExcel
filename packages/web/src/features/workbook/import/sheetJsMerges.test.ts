import { describe, expect, it } from "vitest";
import { createMergeIndex } from "./sheetJsMerges";

describe("sheetJs merge index", () => {
  it("finds the same merge range for every covered coordinate", () => {
    const index = createMergeIndex([
      { s: { r: 0, c: 0 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
    ]);

    expect(index.find(0, 0)?.config).toEqual({ r: 0, c: 0, rs: 2, cs: 2 });
    expect(index.find(1, 1)?.config).toEqual({ r: 0, c: 0, rs: 2, cs: 2 });
    expect(index.find(0, 4)?.config).toEqual({ r: 0, c: 3, rs: 1, cs: 2 });
    expect(index.find(2, 0)).toBeUndefined();
  });

  it("rejects overlapping merge ranges instead of choosing one arbitrarily", () => {
    expect(() =>
      createMergeIndex([
        { s: { r: 0, c: 0 }, e: { r: 1, c: 1 } },
        { s: { r: 1, c: 1 }, e: { r: 2, c: 2 } },
      ]),
    ).toThrow("重叠");
  });
});
