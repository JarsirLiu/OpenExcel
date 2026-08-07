import type { FortuneCell } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { serializeSheetChangeSet } from "@/features/sync/sheetSaveTransport";
import { classifySheetChange } from "./sheetChangeSet";
import { createSheetEditorSnapshot } from "./sheetEditorSnapshot";

function changeSet(before: FortuneCell[], after: FortuneCell[]) {
  return classifySheetChange(
    createSheetEditorSnapshot(before, null),
    createSheetEditorSnapshot(after, null),
  );
}

describe("sheetChangeSet", () => {
  it("classifies a formula cache update separately from a value update", () => {
    const result = changeSet(
      [
        { r: 0, c: 0, v: { v: 1, m: "1" } },
        { r: 0, c: 1, v: { v: 2, m: "2", f: "=A1*2" } },
      ],
      [
        { r: 0, c: 0, v: { v: 3, m: "3" } },
        { r: 0, c: 1, v: { v: 6, m: "6", f: "=A1*2" } },
      ],
    );

    expect(result.valueChanges).toEqual([{ row: 1, col: 1, cell: { v: 3, m: "3" } }]);
    expect(result.formulaCacheChanges).toEqual([{ row: 1, col: 2, cell: { v: 6, m: "6" } }]);
    expect(result.formatChanges).toEqual([]);
  });

  it("keeps value and format fields in separate collections", () => {
    const result = changeSet(
      [{ r: 0, c: 0, v: { v: "old", m: "old", bg: "#fff" } }],
      [{ r: 0, c: 0, v: { v: "new", m: "new", bg: "#000" } }],
    );

    expect(result.valueChanges).toEqual([{ row: 1, col: 1, cell: { v: "new", m: "new" } }]);
    expect(result.formatChanges).toEqual([{ row: 1, col: 1, cell: { bg: "#000" } }]);
  });

  it("leaves backend serialization to the save transport", () => {
    const result = changeSet(
      [{ r: 0, c: 0, v: { v: 1, m: "1" } }],
      [{ r: 0, c: 0, v: { v: 2, m: "2", bg: "#fff" } }],
    );

    expect(serializeSheetChangeSet(result)).toEqual({
      type: "patch",
      cells: [{ row: 1, col: 1, cell: { v: 2, m: "2", bg: "#fff" } }],
    });
  });
});
