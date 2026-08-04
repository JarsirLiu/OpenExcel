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
            { row: 1, col: 2, cell: { v: 2, m: "2" } },
          ],
        },
      },
      {
        kind: "patch",
        sheetId: 61,
        mutation: {
          type: "patch",
          cells: [{ row: 1, col: 1, cell: { v: 2, m: "2" } }],
        },
      },
    ]);
  });

  it("ignores changes from sheets that have not been loaded from the server", () => {
    const adapter = new FortuneSheetEventAdapter();
    adapter.reset([
      {
        id: 60,
        celldata: [{ r: 0, c: 0, v: { v: "loaded", m: "loaded" } }],
        config: { config: { columnlen: { 0: 180 } } },
      } as never,
      {
        id: 61,
        celldata: [{ r: 0, c: 0, v: { v: "unloaded", m: "unloaded" } }],
        config: { config: { columnlen: { 0: 240 } }, borderInfo: [{ rangeType: "cell" }] },
      } as never,
    ]);

    const results = adapter.handleChange(
      [
        { id: 60, data: [[{ v: "edited", m: "edited" }]] },
        { id: 61, data: [[{ v: "default", m: "default" }]] },
      ],
      60,
      { loadedSheetIds: new Set([60]), allowUntrackedChanges: true },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.sheetId).toBe(60);
  });

  it("ignores change callbacks that are not tied to a user or AI operation", () => {
    const adapter = new FortuneSheetEventAdapter();
    adapter.reset([
      {
        id: 60,
        celldata: [{ r: 0, c: 0, v: { v: "server", m: "server" } }],
      } as never,
    ]);

    expect(
      adapter.handleChange(
        [{ id: 60, data: [[{ v: "fortune-default", m: "fortune-default" }]] }],
        60,
        { loadedSheetIds: new Set([60]) },
      ),
    ).toEqual([]);
  });
});
