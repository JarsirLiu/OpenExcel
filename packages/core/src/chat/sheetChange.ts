import { z } from "zod";

const sheetChangeValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const sheetChangeCellSchema = z.object({
  row: z.number().int().positive(),
  col: z.number().int().positive(),
  value: sheetChangeValueSchema,
  formula: z.string().trim().min(1).optional(),
});

export const sheetChangeClearCellSchema = z.object({
  row: z.number().int().positive(),
  col: z.number().int().positive(),
});

const sheetChangeRangePayloadSchema = z.object({
  startRow: z.number().int().positive(),
  startCol: z.number().int().positive(),
  endRow: z.number().int().positive(),
  endCol: z.number().int().positive(),
});

export const sheetChangeRangeSchema = sheetChangeRangePayloadSchema.refine(
  (range) => range.endRow >= range.startRow && range.endCol >= range.startCol,
  {
    message: "Invalid sheet range",
  },
);

export const sheetChangeClearRangeSchema = sheetChangeRangePayloadSchema.refine(
  (range) => range.endRow >= range.startRow && range.endCol >= range.startCol,
  {
    message: "Invalid sheet range",
  },
);

export const sheetChangeRangeOperationSchema = z.object({
  type: z.literal("range"),
  ...sheetChangeRangePayloadSchema.shape,
}).refine(
  (range) => range.endRow >= range.startRow && range.endCol >= range.startCol,
  {
    message: "Invalid sheet range",
  },
);

const sheetChangeClearCellOperationSchema = z.object({
  type: z.literal("cell"),
  ...sheetChangeClearCellSchema.shape,
});

export const sheetChangeClearOperationSchema = z.union([
  sheetChangeClearCellOperationSchema,
  sheetChangeRangeOperationSchema,
]);

export const sheetChangeDeltaSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("write"),
    cells: z.array(sheetChangeCellSchema).min(1),
    merges: z.array(sheetChangeRangeSchema).optional(),
  }),
  z.object({
    type: z.literal("clear"),
    operations: z.array(sheetChangeClearOperationSchema).min(1),
  }),
  z.object({
    type: z.literal("merge"),
    operations: z.array(sheetChangeRangeOperationSchema).min(1),
  }),
  z.object({
    type: z.literal("unmerge"),
    operations: z.array(sheetChangeRangeOperationSchema).min(1),
  }),
]);

export const sheetChangePatchOutputSchema = z.object({
  sheetInfo: z.object({
    sheetId: z.number().int(),
    sheetNo: z.number().int().optional(),
    sheetName: z.string().min(1),
  }),
  delta: sheetChangeDeltaSchema.nullish(),
}).passthrough();

export type SheetChangeCell = z.infer<typeof sheetChangeCellSchema>;
export type SheetChangeClearCell = z.infer<typeof sheetChangeClearCellSchema>;
export type SheetChangeRange = z.infer<typeof sheetChangeRangeSchema>;
export type SheetChangeClearRange = z.infer<typeof sheetChangeClearRangeSchema>;
export type SheetChangeRangeOperation = z.infer<typeof sheetChangeRangeOperationSchema>;
export type SheetChangeClearOperation = z.infer<typeof sheetChangeClearOperationSchema>;
export type SheetChangeDelta = z.infer<typeof sheetChangeDeltaSchema>;
export type SheetChangePatchOutput = z.infer<typeof sheetChangePatchOutputSchema>;
