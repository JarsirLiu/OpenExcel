import { z } from "zod";

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const rangeSchema = z.object({
  startRow: z.number().int().nonnegative(),
  startCol: z.number().int().nonnegative(),
  endRow: z.number().int().nonnegative(),
  endCol: z.number().int().nonnegative(),
});
const cellValueSchema = z.object({
  value: scalarSchema,
  displayValue: z.string().optional(),
  formula: z.string().optional(),
  styleId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const objectSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["chart", "image", "comment", "custom"]),
  position: z.record(z.string(), z.unknown()),
  data: z.record(z.string(), z.unknown()),
});

export const documentOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setCell"),
    row: z.number().int().nonnegative(),
    col: z.number().int().nonnegative(),
    value: cellValueSchema.nullable(),
  }),
  z.object({
    type: z.literal("setRangeValues"),
    range: rangeSchema,
    values: z.array(z.array(scalarSchema)),
    formulas: z.array(z.array(z.string().nullable())).optional(),
  }),
  z.object({ type: z.literal("clearRange"), range: rangeSchema }),
  z.object({ type: z.literal("createObject"), object: objectSchema }),
  z.object({
    type: z.literal("updateObject"),
    id: z.string().min(1),
    patch: z.object({
      position: z.record(z.string(), z.unknown()).optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  z.object({ type: z.literal("deleteObject"), id: z.string().min(1) }),
  z.object({ type: z.literal("replaceSnapshot"), sourceFormat: z.string().min(1) }),
]);

export const applyDocumentOperationSchema = z.object({
  operation: documentOperationSchema,
  expectedRevision: z.number().int().nonnegative().optional(),
});

export const applyDocumentOperationsSchema = z.object({
  operations: z.array(documentOperationSchema).min(1).max(10_000),
  expectedRevision: z.number().int().nonnegative().optional(),
});

export const applyDocumentLayoutSchema = z.object({
  config: z.unknown(),
  expectedRevision: z.number().int().nonnegative().optional(),
});

export type ApplyDocumentOperationInput = z.infer<typeof applyDocumentOperationSchema>;
export type ApplyDocumentOperationsInput = z.infer<typeof applyDocumentOperationsSchema>;
export type ApplyDocumentLayoutInput = z.infer<typeof applyDocumentLayoutSchema>;
