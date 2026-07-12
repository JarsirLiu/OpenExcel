import { describe, expect, it } from "vitest";
import {
  documentValueToFortuneValue,
  fortuneCelldataToChunks,
  fortuneCellToDocumentValue,
} from "./fortuneAdapter.js";
import { cellStyleId, collectDocumentStyles } from "./style.js";

describe("canonical cell styles", () => {
  it("creates the same style id regardless of property order", () => {
    expect(cellStyleId({ bg: "#fff", bd: { r: { s: 1 } }, fc: "#000" })).toBe(
      cellStyleId({ fc: "#000", bd: { r: { s: 1 } }, bg: "#fff" }),
    );
  });

  it("moves renderer style fields into a reusable style id", () => {
    const value = fortuneCellToDocumentValue({
      v: 42,
      m: "42",
      bg: "#fff",
      fc: "#111",
      bl: 1,
      mc: { r: 0, c: 0, rs: 1, cs: 1 },
    });

    expect(value.styleId).toBeDefined();
    expect(value.metadata).toEqual({ mc: { r: 0, c: 0, rs: 1, cs: 1 } });
    const chunk = fortuneCelldataToChunks([
      {
        r: 0,
        c: 0,
        v: { v: 42, m: "42", bg: "#fff", fc: "#111", bl: 1 },
      },
    ]).get("0:0");
    expect(chunk?.cells["0,0"]).toMatchObject({ styleId: value.styleId });
    expect(chunk?.cells["0,0"].metadata).toBeUndefined();
    expect(
      documentValueToFortuneValue(
        value,
        collectDocumentStyles([
          {
            r: 0,
            c: 0,
            v: {
              v: 42,
              m: "42",
              bg: "#fff",
              fc: "#111",
              bl: 1,
            },
          },
        ]),
      ),
    ).toMatchObject({ bg: "#fff", fc: "#111", bl: 1 });
  });
});
