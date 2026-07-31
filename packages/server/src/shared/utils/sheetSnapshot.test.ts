import { describe, expect, it } from "vitest";
import {
  serializeSheetSnapshot,
  sheetRecordToSnapshot,
  snapshotMergesJson,
} from "./sheetSnapshot.js";

describe("sheetRecordToSnapshot", () => {
  it("reads canonical cells from SheetChunk payloads", () => {
    const snapshot = sheetRecordToSnapshot({
      config: null,
      chunks: [
        {
          payload: JSON.stringify({
            celldata: [
              {
                r: 0,
                c: 0,
                v: { v: "A", m: "A", mc: { r: 0, c: 0, rs: 1, cs: 2 } },
              },
              { r: 0, c: 1, v: { mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
            ],
          }),
        },
      ],
    });

    expect(snapshotMergesJson(snapshot)).toBe(JSON.stringify([{ row: [0, 0], col: [0, 1] }]));
    expect(snapshot.celldata).toHaveLength(2);
  });

  it("returns an empty snapshot when the sheet has no chunks", () => {
    expect(sheetRecordToSnapshot({ config: null, chunks: [] })).toEqual({
      celldata: [],
      config: null,
    });
  });

  it("fails when Sheet config JSON is invalid", () => {
    expect(() => sheetRecordToSnapshot({ config: "[]", chunks: [] })).toThrow(
      "Invalid Sheet config",
    );
  });

  it("serializes cells for an undo snapshot without Sheet legacy fields", () => {
    const persisted = serializeSheetSnapshot({
      celldata: [{ r: 0, c: 0, v: { v: 44805, m: "2022/9/1" } }],
      config: null,
    });

    expect(JSON.parse(persisted.celldata)).toHaveLength(1);
    expect(persisted).not.toHaveProperty("merges");
    expect(persisted).not.toHaveProperty("uploadedData");
  });
});
