import type { FortuneCell } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { buildDocumentOperations } from "./documentSync";

describe("buildDocumentOperations", () => {
  it("skips the renderer-only header row and writes changed cells", () => {
    const previous: FortuneCell[] = [
      { r: 0, c: 0, v: { v: "Name", m: "Name" } },
      { r: 1, c: 0, v: { v: "Alice", m: "Alice" } },
    ];
    const next: FortuneCell[] = [
      { r: 0, c: 0, v: { v: "Changed header", m: "Changed header" } },
      { r: 1, c: 0, v: { v: "Bob", m: "Bob" } },
    ];

    expect(buildDocumentOperations(previous, next, 1)).toEqual([
      {
        type: "setCell",
        row: 0,
        col: 0,
        value: { value: "Bob", displayValue: "Bob" },
      },
    ]);
  });

  it("persists merge creation and removal as object operations", () => {
    const previous: FortuneCell[] = [{ r: 1, c: 0, v: { v: "A", m: "A" } }];
    const next: FortuneCell[] = [
      {
        r: 1,
        c: 0,
        v: { v: "A", m: "A", mc: { r: 1, c: 0, rs: 1, cs: 2 } },
      },
      { r: 1, c: 1, v: { v: "", m: "", mc: { r: 1, c: 0, rs: 1, cs: 2 } } },
    ];

    expect(buildDocumentOperations(previous, next, 0)).toContainEqual({
      type: "createObject",
      object: {
        id: "merge:1:0:1:1",
        type: "custom",
        position: { startRow: 1, startCol: 0, endRow: 1, endCol: 1 },
        data: { kind: "merge" },
      },
    });
  });
});
