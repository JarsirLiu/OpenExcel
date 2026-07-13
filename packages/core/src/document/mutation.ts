import { z } from "zod";

const documentCellRangeSchema = z
  .object({
    startRow: z.number().int().nonnegative(),
    startCol: z.number().int().nonnegative(),
    endRow: z.number().int().nonnegative(),
    endCol: z.number().int().nonnegative(),
  })
  .refine((range) => range.endRow >= range.startRow && range.endCol >= range.startCol, {
    message: "Invalid document range",
  });

export const documentMutationSchema = z.object({
  sheetId: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  changedRanges: z.array(documentCellRangeSchema),
  objectIds: z.array(z.string().min(1)),
});

export type DocumentMutation = z.infer<typeof documentMutationSchema>;
