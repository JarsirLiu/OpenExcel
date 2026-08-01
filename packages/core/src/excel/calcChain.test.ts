import { describe, expect, it } from "vitest";
import { buildFortuneCalcChain } from "./calcChain.js";

describe("buildFortuneCalcChain", () => {
  it("uses the real Sheet identity for every formula cell", () => {
    expect(
      buildFortuneCalcChain(
        [
          { r: 0, c: 0, v: { v: 1, m: "1" } },
          { r: 0, c: 1, v: { v: 2, m: "2", f: "=A1+1" } },
          { r: 1, c: 1, v: { v: 3, m: "3", f: "=B1+1" } },
        ],
        60,
      ),
    ).toEqual([
      { r: 0, c: 1, id: "60" },
      { r: 1, c: 1, id: "60" },
    ]);
  });
});
