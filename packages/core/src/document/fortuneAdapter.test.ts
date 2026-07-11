import { describe, expect, it } from "vitest";
import { chunksToFortuneCelldata, fortuneCelldataToChunks } from "./fortuneAdapter.js";

describe("Fortune document adapter", () => {
  it("round-trips sparse cells through the OpenExcel chunk model", () => {
    const celldata = [
      { r: 0, c: 0, v: { v: "Name", m: "Name", bl: 1 } },
      { r: 130, c: 65, v: { v: 120, m: "120", f: "A1*2" } },
    ];
    const chunks = fortuneCelldataToChunks(celldata, 4);
    const restored = chunksToFortuneCelldata(chunks);

    expect(restored).toEqual(celldata);
  });
});
