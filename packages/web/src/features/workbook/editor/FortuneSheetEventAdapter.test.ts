import { describe, expect, it } from "vitest";
import { FortuneSheetEventAdapter } from "./FortuneSheetEventAdapter";

describe("FortuneSheetEventAdapter", () => {
  it("persists formula recalculation on another Sheet", () => {
    const adapter = new FortuneSheetEventAdapter();
    adapter.reset([
      {
        id: 60,
        celldata: [
          { r: 0, c: 0, v: { v: 1, m: "1" } },
          { r: 0, c: 1, v: { v: 1, m: "1", f: "=A1" } },
        ],
      } as never,
      {
        id: 61,
        celldata: [{ r: 0, c: 0, v: { v: 1, m: "1", f: "='60'!A1" } }],
      } as never,
    ]);

    adapter.handleOp([{ op: "replace", path: ["data", 0, 0] }], 60);
    const results = adapter.handleChange(
      [
        {
          id: 60,
          data: [
            [
              { v: 2, m: "2" },
              { v: 2, m: "2", f: "=A1" },
            ],
          ],
        },
        {
          id: 61,
          data: [[{ v: 2, m: "2", f: "='60'!A1" }]],
        },
      ],
      60,
    );

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.change)).toEqual([
      {
        kind: "patch",
        sheetId: 60,
        mutation: {
          type: "patch",
          cells: [
            { row: 1, col: 1, cell: { v: 2, m: "2" } },
            { row: 1, col: 2, cell: { v: 2, m: "2", f: "=A1" } },
          ],
        },
      },
      {
        kind: "patch",
        sheetId: 61,
        mutation: {
          type: "patch",
          cells: [{ row: 1, col: 1, cell: { v: 2, m: "2", f: "='60'!A1" } }],
        },
      },
    ]);
  });
});
