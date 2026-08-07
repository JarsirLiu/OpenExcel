import { describe, expect, it } from "vitest";
import { ManualSheetEditor } from "./manualSheetEditor";

describe("ManualSheetEditor", () => {
  it("diffs a manual edit from the baseline left by an AI mutation", () => {
    const editor = new ManualSheetEditor();
    editor.reset([
      {
        id: 60,
        celldata: [{ r: 0, c: 0, v: { v: "initial", m: "initial" } }],
      } as never,
    ]);
    editor.replaceFromServerSnapshot(60, {
      celldata: [{ r: 0, c: 0, v: { v: "ai", m: "ai" } }],
      config: null,
    });

    const [result] = editor.handleChange(
      [{ id: 60, data: [[{ v: "manual", m: "manual" }]] }],
      60,
      new Set([60]),
    );

    expect(result?.change).toEqual({
      kind: "patch",
      sheetId: 60,
      changeSet: {
        valueChanges: [{ row: 1, col: 1, cell: { v: "manual", m: "manual" } }],
        formulaCacheChanges: [],
        formatChanges: [],
        configChanges: [{ config: {} }],
      },
    });
  });
});
