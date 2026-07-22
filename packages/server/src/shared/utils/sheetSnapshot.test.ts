import { describe, expect, it } from "vitest";
import { sheetRecordToSnapshot, snapshotMergesJson } from "./sheetSnapshot.js";

describe("sheetRecordToSnapshot", () => {
  it("materializes legacy merges into the canonical cell snapshot", () => {
    const snapshot = sheetRecordToSnapshot({
      uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "A", m: "A", bg: "#fff" } }]),
      config: null,
      merges: JSON.stringify([{ row: [0, 0], col: [0, 1] }]),
    });

    expect(snapshot.celldata).toEqual([
      {
        r: 0,
        c: 0,
        v: {
          v: "A",
          m: "A",
          bg: "#fff",
          fc: "#000000",
          mc: { r: 0, c: 0, rs: 1, cs: 2 },
        },
      },
      { r: 0, c: 1, v: { mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
    ]);
    expect(snapshotMergesJson(snapshot)).toBe(JSON.stringify([{ row: [0, 0], col: [0, 1] }]));
  });

  it("uses canonical cells when legacy metadata is stale", () => {
    const snapshot = sheetRecordToSnapshot({
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: "A", m: "A", mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
        { r: 0, c: 1, v: { mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
      ]),
      config: null,
      merges: JSON.stringify([{ row: [3, 3], col: [3, 4] }]),
    });

    expect(snapshotMergesJson(snapshot)).toBe(JSON.stringify([{ row: [0, 0], col: [0, 1] }]));
    expect(snapshot.celldata).toHaveLength(2);
  });

  it("ignores malformed legacy merge metadata", () => {
    const snapshot = sheetRecordToSnapshot({
      uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "A", m: "A" } }]),
      config: null,
      merges: JSON.stringify([
        { row: [2, 1], col: [0, 1] },
        { row: [0], col: [0, 1] },
      ]),
    });

    expect(snapshot.celldata).toEqual([{ r: 0, c: 0, v: { v: "A", m: "A", fc: "#000000" } }]);
  });
});
