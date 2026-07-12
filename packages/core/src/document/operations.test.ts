import { describe, expect, it } from "vitest";
import {
  applyDocumentOperation,
  applyDocumentOperations,
  coalesceDocumentOperations,
  createDocumentState,
  readDocumentCell,
} from "./operations.js";

describe("document operations", () => {
  it("coalesces only lossless horizontal scalar writes", () => {
    expect(
      coalesceDocumentOperations([
        { type: "setCell", row: 2, col: 3, value: { value: "A", displayValue: "A" } },
        { type: "setCell", row: 2, col: 4, value: { value: 42, displayValue: "42" } },
        {
          type: "setCell",
          row: 2,
          col: 5,
          value: { value: 7, displayValue: "7", styleId: "style_1" },
        },
      ]),
    ).toEqual([
      {
        type: "setRangeValues",
        range: { startRow: 2, startCol: 3, endRow: 2, endCol: 4 },
        values: [["A", 42]],
      },
      {
        type: "setCell",
        row: 2,
        col: 5,
        value: { value: 7, displayValue: "7", styleId: "style_1" },
      },
    ]);
  });

  it("writes and clears cells without materializing unrelated chunks", () => {
    const initial = createDocumentState();
    const written = applyDocumentOperation(
      initial,
      {
        type: "setRangeValues",
        range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
        values: [
          ["Name", "Value"],
          ["East", 120],
        ],
      },
      1,
    );

    expect(written.chunks.size).toBe(1);
    expect(readDocumentCell(written, 1, 1)?.value).toBe(120);

    const cleared = applyDocumentOperation(
      written,
      { type: "clearRange", range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 } },
      2,
    );
    expect(cleared.chunks.size).toBe(0);
  });

  it("stores chart-like objects separately from cell chunks", () => {
    const state = applyDocumentOperation(
      createDocumentState(),
      {
        type: "createObject",
        object: {
          id: "chart-1",
          type: "chart",
          position: { startRow: 0, startColumn: 4 },
          data: { chartType: "bar", sourceRange: "A1:B4" },
        },
      },
      1,
    );

    expect(state.chunks.size).toBe(0);
    expect(state.objects.get("chart-1")?.data.sourceRange).toBe("A1:B4");

    const updated = applyDocumentOperation(
      state,
      {
        type: "updateObject",
        id: "chart-1",
        patch: { data: { title: "Revenue" } },
      },
      2,
    );
    expect(updated.objects.get("chart-1")?.data.title).toBe("Revenue");

    const removed = applyDocumentOperation(updated, { type: "deleteObject", id: "chart-1" }, 3);
    expect(removed.objects.has("chart-1")).toBe(false);
  });

  it("rejects range matrices with the wrong dimensions", () => {
    expect(() =>
      applyDocumentOperation(
        createDocumentState(),
        {
          type: "setRangeValues",
          range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
          values: [["only one row"]],
        },
        1,
      ),
    ).toThrow("Range values must match the target range dimensions");
  });

  it("applies a batch without mutating the input state", () => {
    const initial = applyDocumentOperation(
      createDocumentState(),
      { type: "setCell", row: 0, col: 0, value: { value: "before" } },
      1,
    );

    const updated = applyDocumentOperations(
      initial,
      [
        { type: "setCell", row: 0, col: 0, value: { value: "after" } },
        { type: "setCell", row: 128, col: 64, value: { value: 42 } },
      ],
      1,
    );

    expect(readDocumentCell(initial, 0, 0)?.value).toBe("before");
    expect(readDocumentCell(initial, 128, 64)).toBeNull();
    expect(readDocumentCell(updated, 0, 0)?.value).toBe("after");
    expect(readDocumentCell(updated, 128, 64)?.value).toBe(42);
    expect(updated.chunks.size).toBe(2);
  });

  it("writes large ranges across chunk boundaries", () => {
    const updated = applyDocumentOperation(
      createDocumentState(),
      {
        type: "setRangeValues",
        range: { startRow: 127, startCol: 63, endRow: 128, endCol: 64 },
        values: [
          ["a", "b"],
          ["c", "d"],
        ],
      },
      1,
    );

    expect(readDocumentCell(updated, 127, 63)?.value).toBe("a");
    expect(readDocumentCell(updated, 127, 64)?.value).toBe("b");
    expect(readDocumentCell(updated, 128, 63)?.value).toBe("c");
    expect(readDocumentCell(updated, 128, 64)?.value).toBe("d");
    expect(updated.chunks.size).toBe(4);
  });
});
