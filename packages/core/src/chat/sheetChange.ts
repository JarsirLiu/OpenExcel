import { z } from "zod";

const sheetChangeValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const sheetChangeMatrixSchema = z.array(z.array(sheetChangeValueSchema).min(1)).min(1);
const sheetChangeValueTypeSchema = z.enum(["date", "string"]);

function validateWritePayload(
  value: { value: string | number | boolean; valueType?: "date" | "string"; formula?: string },
  ctx: z.RefinementCtx,
) {
  if (value.valueType === "date" && typeof value.value !== "string") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Date values must be strings",
    });
  }
  if (value.valueType === "date" && value.formula != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["formula"],
      message: "Date writes cannot include a formula",
    });
  }
}

const sheetChangeWritePayloadSchema = z
  .object({
    value: sheetChangeValueSchema,
    valueType: sheetChangeValueTypeSchema.optional(),
    formula: z.string().trim().min(1).optional(),
  })
  .superRefine(validateWritePayload);

const sheetChangeRangeWritePayloadSchema = z
  .object({
    value: sheetChangeValueSchema.optional(),
    values: sheetChangeMatrixSchema.optional(),
    valueType: sheetChangeValueTypeSchema.optional(),
    formula: z.string().trim().min(1).optional(),
  })
  .superRefine((payload, ctx) => {
    const modes = [
      payload.value !== undefined,
      payload.values !== undefined,
      payload.formula !== undefined,
    ].filter(Boolean).length;
    if (modes !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A write operation must specify exactly one of value, values, or formula",
      });
    }
    if (payload.formula !== undefined && payload.valueType !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valueType"],
        message: "Formula writes cannot specify valueType",
      });
    }
    if (payload.values !== undefined && payload.valueType === "date") {
      for (const row of payload.values) {
        if (row.some((value) => typeof value !== "string")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["values"],
            message: "Date matrices must contain only strings",
          });
          break;
        }
      }
    }
  });

export const sheetChangeCellSchema = z
  .object({
    row: z.number().int().positive(),
    col: z.number().int().positive(),
    ...sheetChangeWritePayloadSchema.shape,
  })
  .superRefine(validateWritePayload);

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

export const sheetChangeWriteRangeSchema = z
  .object({
    type: z.literal("range"),
    ...sheetChangeRangePayloadSchema.shape,
    ...sheetChangeRangeWritePayloadSchema.shape,
  })
  .refine((range) => range.endRow >= range.startRow && range.endCol >= range.startCol, {
    message: "Invalid sheet range",
  })
  .superRefine((range, ctx) => {
    if (
      range.valueType === "date" &&
      range.value !== undefined &&
      typeof range.value !== "string"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Date values must be strings",
      });
    }
  });

export const sheetChangeWriteOperationSchema = z.union([
  z
    .object({ type: z.literal("cell"), ...sheetChangeCellSchema.shape })
    .superRefine(validateWritePayload),
  sheetChangeWriteRangeSchema,
]);

export const sheetChangeClearRangeSchema = sheetChangeRangePayloadSchema.refine(
  (range) => range.endRow >= range.startRow && range.endCol >= range.startCol,
  {
    message: "Invalid sheet range",
  },
);

export const sheetChangeRangeOperationSchema = z
  .object({
    type: z.literal("range"),
    ...sheetChangeRangePayloadSchema.shape,
  })
  .refine((range) => range.endRow >= range.startRow && range.endCol >= range.startCol, {
    message: "Invalid sheet range",
  });

const sheetChangeClearCellOperationSchema = z.object({
  type: z.literal("cell"),
  ...sheetChangeClearCellSchema.shape,
});

export const sheetChangeClearOperationSchema = z.union([
  sheetChangeClearCellOperationSchema,
  sheetChangeRangeOperationSchema,
]);

export const sheetChangeDeltaSchema = z.union([
  z
    .object({
      type: z.literal("write"),
      operations: z.array(sheetChangeWriteOperationSchema).min(1),
      merges: z.array(sheetChangeRangeSchema).optional(),
    })
    .strict(),
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

export const MAX_CHANGED_RANGES = 20;

export const sheetChangeSummarySchema = z.object({
  changedCellCount: z.number().int().nonnegative(),
  changedRanges: z.array(z.string().min(1)).max(MAX_CHANGED_RANGES),
  omittedRangeCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  operationCount: z.number().int().nonnegative(),
});

export const sheetChangeVersionSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
});

export const sheetChangePatchOutputSchema = z
  .object({
    sheetInfo: z.object({
      sheetId: z.number().int(),
      sheetNo: z.number().int().optional(),
      sheetName: z.string().min(1),
    }),
    changeSummary: sheetChangeSummarySchema,
    delta: sheetChangeDeltaSchema.nullish(),
    baseRevision: z.number().int().nonnegative().optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type SheetChangeCell = z.infer<typeof sheetChangeCellSchema>;
export type SheetChangeWriteOperation = z.infer<typeof sheetChangeWriteOperationSchema>;
export type SheetChangeClearCell = z.infer<typeof sheetChangeClearCellSchema>;
export type SheetChangeRange = z.infer<typeof sheetChangeRangeSchema>;
export type SheetChangeClearRange = z.infer<typeof sheetChangeClearRangeSchema>;
export type SheetChangeRangeOperation = z.infer<typeof sheetChangeRangeOperationSchema>;
export type SheetChangeClearOperation = z.infer<typeof sheetChangeClearOperationSchema>;
export type SheetChangeDelta = z.infer<typeof sheetChangeDeltaSchema>;
export type SheetChangeSummary = z.infer<typeof sheetChangeSummarySchema>;
export type SheetChangeVersion = z.infer<typeof sheetChangeVersionSchema>;
export type SheetChangePatchOutput = z.infer<typeof sheetChangePatchOutputSchema>;
