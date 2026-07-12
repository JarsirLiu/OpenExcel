import { z } from "zod";

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const rangeSchema = z
  .object({
    startRow: z.number().int().nonnegative(),
    startCol: z.number().int().nonnegative(),
    endRow: z.number().int().nonnegative(),
    endCol: z.number().int().nonnegative(),
  })
  .superRefine((range, ctx) => {
    if (range.endRow < range.startRow) {
      ctx.addIssue({
        code: "custom",
        path: ["endRow"],
        message: "End row must not precede start row",
      });
    }
    if (range.endCol < range.startCol) {
      ctx.addIssue({
        code: "custom",
        path: ["endCol"],
        message: "End column must not precede start column",
      });
    }
  });
const cellValueSchema = z.object({
  value: scalarSchema,
  displayValue: z.string().optional(),
  formula: z.string().optional(),
  styleId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const borderSideSchema = z.object({ s: z.number().int(), c: z.string().optional() });
const styleDefinitionSchema = z.object({
  id: z.string().regex(/^style_[0-9a-f]{16}$/),
  style: z.object({
    bg: z.string().optional(),
    fc: z.string().optional(),
    fs: z.number().optional(),
    ff: z.string().optional(),
    bl: z.number().optional(),
    it: z.number().optional(),
    cl: z.number().optional(),
    un: z.number().optional(),
    ht: z.number().optional(),
    vt: z.number().optional(),
    tb: z.string().optional(),
    ct: z.object({ fa: z.string().optional(), t: z.string().optional() }).optional(),
    bd: z
      .object({
        t: borderSideSchema.optional(),
        b: borderSideSchema.optional(),
        l: borderSideSchema.optional(),
        r: borderSideSchema.optional(),
      })
      .optional(),
  }),
});
const operationMetadataSchema = {
  batchId: z.string().trim().min(1).max(128).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
};
const objectSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["chart", "image", "comment", "custom"]),
  position: z.record(z.string(), z.unknown()),
  data: z.record(z.string(), z.unknown()),
});

const setRangeValuesSchema = z
  .object({
    type: z.literal("setRangeValues"),
    range: rangeSchema,
    values: z.array(z.array(scalarSchema)),
    formulas: z.array(z.array(z.string().nullable())).optional(),
  })
  .superRefine((operation, ctx) => {
    const rows = operation.range.endRow - operation.range.startRow + 1;
    const cols = operation.range.endCol - operation.range.startCol + 1;
    if (operation.values.length !== rows || operation.values.some((row) => row.length !== cols)) {
      ctx.addIssue({
        code: "custom",
        path: ["values"],
        message: "Values dimensions must match range",
      });
    }
    if (
      operation.formulas &&
      (operation.formulas.length !== rows || operation.formulas.some((row) => row.length !== cols))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["formulas"],
        message: "Formulas dimensions must match range",
      });
    }
  });

const setRangeStyleSchema = z.object({
  type: z.literal("setRangeStyle"),
  range: rangeSchema,
  styleId: z
    .string()
    .regex(/^style_[0-9a-f]{16}$/)
    .nullable(),
});

export const documentOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setCell"),
    row: z.number().int().nonnegative(),
    col: z.number().int().nonnegative(),
    value: cellValueSchema.nullable(),
  }),
  setRangeValuesSchema,
  setRangeStyleSchema,
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
  ...operationMetadataSchema,
  styles: z.array(styleDefinitionSchema).max(2_000).optional(),
});

export const applyDocumentOperationsSchema = z.object({
  operations: z.array(documentOperationSchema).min(1).max(10_000),
  expectedRevision: z.number().int().nonnegative().optional(),
  ...operationMetadataSchema,
  styles: z.array(styleDefinitionSchema).max(2_000).optional(),
});

export const applyDocumentLayoutSchema = z.object({
  config: z.unknown(),
  expectedRevision: z.number().int().nonnegative().optional(),
  ...operationMetadataSchema,
});

export const compactDocumentOperationsSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
});

export type ApplyDocumentOperationInput = z.infer<typeof applyDocumentOperationSchema>;
export type ApplyDocumentOperationsInput = z.infer<typeof applyDocumentOperationsSchema>;
export type ApplyDocumentLayoutInput = z.infer<typeof applyDocumentLayoutSchema>;
export type CompactDocumentOperationsInput = z.infer<typeof compactDocumentOperationsSchema>;
