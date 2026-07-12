import {
  decodeDocumentChunk,
  encodeDocumentJson,
  extractFormulaReferences,
  parseFormula,
} from "@openexcel/core";
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
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
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
      formulaDependency: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ targetSheetId: 1, targetAddress: "B1" }])
          .mockResolvedValueOnce([{ targetSheetId: 1, targetAddress: "C1" }])
          .mockResolvedValue([]),
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
    expect(chunkUpsert).toHaveBeenCalledTimes(1);
    expect(formulaUpdate).toHaveBeenCalledTimes(2);

    const finalUpsert = chunkUpsert.mock.calls.at(-1)?.[0];
    const finalChunk = decodeDocumentChunk(finalUpsert.update.data, finalUpsert.update.codec);
    expect(finalChunk.cells["0,1"]?.value).toBe(20);
    expect(finalChunk.cells["0,2"]?.value).toBe(40);
  });

  it("recalculates a cross-sheet multi-criteria formula into canonical storage", async () => {
    const sourceChunk = {
      rowBlock: 0,
      colBlock: 0,
      revision: 0,
      codec: "json-v1",
      data: encodeDocumentJson({
        cells: {
          "0,0": { value: "门店A" },
          "0,1": { value: "商品1" },
          "0,2": { value: 0.18 },
          "1,0": { value: "门店A" },
          "1,1": { value: "商品2" },
          "1,2": { value: 0.13 },
          "2,0": { value: "门店B" },
          "2,1": { value: "商品1" },
          "2,2": { value: 0.05 },
        },
      }),
    };
    const reportChunk = {
      rowBlock: 0,
      colBlock: 0,
      revision: 0,
      codec: "json-v1",
      data: encodeDocumentJson({
        cells: {
          "0,0": { value: "门店A" },
          "0,1": { value: "商品1" },
          "0,2": {
            value: null,
            formula: "=SUMIFS('外来表'!$C$1:$C$3,'外来表'!$A$1:$A$3,A1,'外来表'!$B$1:$B$3,B1)",
          },
        },
      }),
    };
    const formula = "=SUMIFS('外来表'!$C$1:$C$3,'外来表'!$A$1:$A$3,A1,'外来表'!$B$1:$B$3,B1)";
    const chunkUpsert = vi.fn();
    const formulaUpdate = vi.fn();
    const tx = {
      sheet: {
        findMany: vi.fn().mockResolvedValue([
          { id: 1, name: "报表" },
          { id: 2, name: "外来表" },
        ]),
      },
      formulaCell: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              sheetId: 1,
              address: "C1",
              formula,
              dependencies: encodeDocumentJson(extractFormulaReferences(formula)),
              ast: encodeDocumentJson(parseFormula(formula)),
            },
          ]),
        update: formulaUpdate,
      },
      formulaDependency: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ targetSheetId: 1, targetAddress: "C1" }])
          .mockResolvedValue([]),
      },
      sheetChunk: {
        findMany: vi.fn().mockResolvedValueOnce([reportChunk]).mockResolvedValueOnce([sourceChunk]),
        upsert: chunkUpsert,
      },
    } as never;

    const results = await recalculateAffectedFormulas(
      tx,
      7,
      [{ sheetId: 2, range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 } }],
      2,
    );

    expect(results).toEqual([
      {
        sheetName: "报表",
        row: 0,
        col: 2,
        value: 0.18,
        formula,
      },
    ]);
    expect(formulaUpdate).toHaveBeenCalledWith({
      where: { sheetId_address: { sheetId: 1, address: "C1" } },
      data: { cachedValue: encodeDocumentJson({ value: 0.18, error: null }) },
    });
    expect(chunkUpsert).toHaveBeenCalledTimes(1);

    const finalUpsert = chunkUpsert.mock.calls[0]?.[0];
    const finalChunk = decodeDocumentChunk(finalUpsert.update.data, finalUpsert.update.codec);
    expect(finalChunk.cells["0,2"]?.value).toBe(0.18);
    expect(finalChunk.cells["0,2"]?.displayValue).toBe("0.18");
  });
});
