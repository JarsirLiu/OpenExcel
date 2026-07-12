import { decodeDocumentJson, encodeDocumentJson, extractFormulaReferences } from "@openexcel/core";
import { describe, expect, it, vi } from "vitest";
import { recalculateAffectedFormulas } from "./recalculation.js";

describe("recalculateAffectedFormulas", () => {
  it("writes dependent formula values back to chunks and cache", async () => {
    const chunk = {
      rowBlock: 0,
      colBlock: 0,
      revision: 0,
      codec: "json-v1",
      data: encodeDocumentJson({
        cells: {
          "0,0": { value: 10, displayValue: "10" },
          "0,1": { value: null, formula: "A1*2" },
          "0,2": { value: null, formula: "B1*2" },
        },
      }),
    };
    const chunkUpsert = vi.fn();
    const formulaUpdate = vi.fn();
    const tx = {
      sheet: {
        findMany: vi.fn().mockResolvedValue([{ id: 1, name: "Sheet1" }]),
      },
      formulaCell: {
        findMany: vi.fn().mockResolvedValue([
          {
            sheetId: 1,
            address: "B1",
            formula: "A1*2",
            dependencies: encodeDocumentJson(extractFormulaReferences("A1*2")),
          },
          {
            sheetId: 1,
            address: "C1",
            formula: "B1*2",
            dependencies: encodeDocumentJson(extractFormulaReferences("B1*2")),
          },
        ]),
        update: formulaUpdate,
      },
      sheetChunk: {
        findMany: vi.fn().mockResolvedValue([chunk]),
        upsert: chunkUpsert,
      },
    } as never;

    const results = await recalculateAffectedFormulas(
      tx,
      7,
      [{ sheetId: 1, range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 } }],
      2,
    );

    expect(results.map((result) => [result.row, result.col, result.value])).toEqual([
      [0, 1, 20],
      [0, 2, 40],
    ]);
    expect(chunkUpsert).toHaveBeenCalledTimes(2);
    expect(formulaUpdate).toHaveBeenCalledTimes(2);

    const finalChunk = decodeDocumentJson<{ cells: Record<string, { value: unknown }> }>(
      chunkUpsert.mock.calls.at(-1)?.[0].update.data,
    );
    expect(finalChunk.cells["0,1"]?.value).toBe(20);
    expect(finalChunk.cells["0,2"]?.value).toBe(40);
  });
});
