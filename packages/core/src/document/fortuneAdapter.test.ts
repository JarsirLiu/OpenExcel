import { describe, expect, it } from "vitest";
import { chunksToFortuneCelldata, fortuneCelldataToChunks } from "./fortuneAdapter.js";
import { collectDocumentStyles } from "./style.js";

describe("Fortune document adapter", () => {
  it("round-trips sparse cells through the OpenExcel chunk model", () => {
    const celldata = [
      { r: 0, c: 0, v: { v: "Name", m: "Name", bl: 1 } },
      { r: 130, c: 65, v: { v: 120, m: "120", f: "A1*2" } },
    ];
    const chunks = fortuneCelldataToChunks(celldata, 4);
    const restored = chunksToFortuneCelldata(chunks, {}, collectDocumentStyles(celldata));

    expect(restored).toEqual(celldata);
  });

  it("builds dense import data without duplicating chunk state", () => {
    const celldata = Array.from({ length: 512 }, (_, index) => ({
      r: index,
      c: index % 8,
      v: { v: index, m: String(index) },
    }));

    const chunks = fortuneCelldataToChunks(celldata, 7);

    expect(chunks.size).toBe(4);
    expect(chunks.get("0:0")?.revision).toBe(7);
    expect(chunksToFortuneCelldata(chunks)).toEqual(celldata);
  });
});
