import { describe, expect, it } from "vitest";
import { repairSheetFormulaContractsInDatabase } from "./repairSheetFormulaContracts.js";

describe("repairSheetFormulaContractsInDatabase", () => {
  it("canonicalizes formulas and removes persisted calcChain without adding styles", async () => {
    const updates: unknown[] = [];
    const tx = {
      sheet: {
        findMany: async () => [
          {
            id: 1,
            revision: 4,
            config: JSON.stringify({ calcChain: [{ r: 0, c: 0, id: "1" }] }),
            chunks: [
              {
                id: 2,
                payload: JSON.stringify({
                  celldata: [{ r: 0, c: 0, v: { v: 2, m: "2", f: "1+1" } }],
                }),
              },
            ],
          },
        ],
        update: async (input: unknown) => updates.push(input),
      },
      sheetChunk: {
        update: async (input: unknown) => updates.push(input),
      },
    } as never;

    await expect(repairSheetFormulaContractsInDatabase(tx)).resolves.toEqual({
      sheetsScanned: 1,
      sheetsChanged: 1,
      chunksChanged: 1,
    });
    expect(updates[0]).toEqual({
      where: { id: 1 },
      data: { config: null, revision: 5 },
    });
    expect(JSON.parse((updates[1] as { data: { payload: string } }).data.payload)).toEqual({
      celldata: [{ r: 0, c: 0, v: { v: 2, m: "2", f: "=1+1" } }],
    });
  });
});
