import type { FortuneCell } from "./celldataUtils.js";

export type FortuneCalcChainItem = {
  r: number;
  c: number;
  id: string;
};

/** Builds the editor-only formula dependency seed from the current Sheet identity. */
export function buildFortuneCalcChain(
  celldata: readonly FortuneCell[],
  sheetId: string | number,
): FortuneCalcChainItem[] {
  const id = String(sheetId);
  return celldata
    .filter((cell) => typeof cell.v?.f === "string" && cell.v.f.trim() !== "")
    .map((cell) => ({ r: cell.r, c: cell.c, id }));
}
