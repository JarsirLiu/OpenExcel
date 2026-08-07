import type { FortuneCell, SheetConfig } from "@openexcel/core";

export type SheetEditorSnapshot = {
  config: SheetConfig | null;
  configSignature: string;
  cellsByKey: Map<string, FortuneCell>;
  formulaKeys: Set<string>;
};

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function cloneFortuneCellValue(value: FortuneCell["v"]): FortuneCell["v"] {
  const clone = { ...value };
  if (value.mc) clone.mc = { ...value.mc };
  if (value.ct) clone.ct = { ...value.ct, s: value.ct.s ? [...value.ct.s] : value.ct.s };
  if (value.bd) {
    clone.bd = {
      ...value.bd,
      ...(value.bd.t ? { t: { ...value.bd.t } } : {}),
      ...(value.bd.b ? { b: { ...value.bd.b } } : {}),
      ...(value.bd.l ? { l: { ...value.bd.l } } : {}),
      ...(value.bd.r ? { r: { ...value.bd.r } } : {}),
    };
  }
  return clone;
}

export function configSignature(config: SheetConfig | null): string {
  return JSON.stringify(config);
}

export function createSheetEditorSnapshot(
  celldata: readonly FortuneCell[],
  config: SheetConfig | null,
): SheetEditorSnapshot {
  const clonedCelldata = celldata.map((cell) => ({
    ...cell,
    v: cloneFortuneCellValue(cell.v),
  }));
  const cellsByKey = new Map(clonedCelldata.map((cell) => [cellKey(cell.r, cell.c), cell]));
  return {
    config: config ? structuredClone(config) : null,
    configSignature: configSignature(config),
    cellsByKey,
    formulaKeys: new Set(
      [...cellsByKey.entries()]
        .filter(([, cell]) => typeof cell.v.f === "string" && cell.v.f.length > 0)
        .map(([key]) => key),
    ),
  };
}

export function materializeSheetEditorSnapshot(snapshot: SheetEditorSnapshot): FortuneCell[] {
  return [...snapshot.cellsByKey.values()].sort(
    (left, right) => left.r - right.r || left.c - right.c,
  );
}
