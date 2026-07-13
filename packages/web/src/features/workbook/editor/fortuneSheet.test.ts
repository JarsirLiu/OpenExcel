import { describe, expect, it } from "vitest";
import { buildFortuneSheetViewportUpdates, type FortuneSheetRuntime } from "./fortuneSheet";

describe("FortuneSheet adapter update payloads", () => {
  it("updates only the requested sheet and uses canonical celldata", () => {
    const firstSheet = Object.freeze({
      id: "1",
      data: Object.freeze([[Object.freeze({ v: 1 })]]),
      name: "Sheet 1",
    }) as unknown as FortuneSheetRuntime;
    const secondSheet = Object.freeze({
      id: "2",
      data: Object.freeze([[Object.freeze({ v: 2 })]]),
      name: "Sheet 2",
    }) as unknown as FortuneSheetRuntime;
    const celldata = [{ r: 0, c: 0, v: { v: 2, m: "2" } }];

    const result = buildFortuneSheetViewportUpdates(
      [firstSheet, secondSheet],
      2,
      celldata,
      129,
      64,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).not.toBe(secondSheet);
    expect(result[0]?.id).toBe("2");
    expect(result[0]?.name).toBe("Sheet 2");
    expect(result[0]).not.toHaveProperty("data");
    expect(result[0]?.celldata).toBe(celldata);
    expect(result[0]?.row).toBe(129);
    expect(result[0]?.column).toBe(64);
    expect(firstSheet).toHaveProperty("data");
    expect(secondSheet).toHaveProperty("data");
  });

  it("returns no update for an unknown sheet", () => {
    const source = Object.freeze({
      id: "1",
      data: Object.freeze([[Object.freeze({ v: 1 })]]),
      name: "Sheet 1",
    }) as unknown as FortuneSheetRuntime;

    const result = buildFortuneSheetViewportUpdates([source], 2, [], 129, 64);

    expect(result).toEqual([]);
  });
});
