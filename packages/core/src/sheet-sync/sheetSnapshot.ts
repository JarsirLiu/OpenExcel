import type { FortuneCell } from "../excel/celldataUtils.js";

export type SheetSnapshot = {
  celldata: FortuneCell[];
  config: Record<string, unknown> | null;
};

export function cloneSheetSnapshot(snapshot: SheetSnapshot): SheetSnapshot {
  return {
    celldata: snapshot.celldata.map((cell) => ({ ...cell, v: { ...cell.v } })),
    config: snapshot.config ? structuredClone(snapshot.config) : null,
  };
}
