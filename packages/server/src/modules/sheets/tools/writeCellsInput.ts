export type CellWriteValue = string | number | boolean;

export type WriteCellOperation =
  | { type: "cell"; row: number; col: number; value: CellWriteValue; formula?: string }
  | {
      type: "range";
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
      value: CellWriteValue;
      formula?: string;
    };

export type WriteCellsInput = {
  sheetId: number;
  operations: WriteCellOperation[];
};

export function normalizeWriteOperations(input: WriteCellsInput): WriteCellsInput {
  return {
    sheetId: input.sheetId,
    operations: input.operations.map((operation) =>
      operation.type === "cell"
        ? {
            type: "cell",
            row: operation.row,
            col: operation.col,
            value: operation.value,
            ...(operation.formula !== undefined ? { formula: operation.formula } : {}),
          }
        : {
            type: "range",
            startRow: operation.startRow,
            startCol: operation.startCol,
            endRow: operation.endRow,
            endCol: operation.endCol,
            value: operation.value,
            ...(operation.formula !== undefined ? { formula: operation.formula } : {}),
          },
    ),
  };
}
