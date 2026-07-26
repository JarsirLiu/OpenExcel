import { z } from "zod";

const recordOutput = z.record(z.string(), z.unknown());

export const workbookCreatedOutputSchema = z
  .object({
    id: z.number().int().positive(),
    publicId: z.string().min(1),
    name: z.string(),
    order: z.number().int().nonnegative(),
    sheets: z.number().int().positive(),
    initialSheet: z.object({
      id: z.number().int().positive(),
      sheetNo: z.number().int().positive(),
      name: z.string(),
      order: z.number().int().nonnegative(),
    }),
  })
  .passthrough();

export const sheetCreatedOutputSchema = z
  .object({
    workbookId: z.number().int().positive(),
    id: z.number().int().positive(),
    sheetNo: z.number().int().positive(),
    name: z.string(),
    order: z.number().int().nonnegative(),
  })
  .passthrough();

export const sheetMutationOutputSchema = z.object({ success: z.literal(true) }).passthrough();

export const sheetReadOutputSchema = recordOutput;
export const sheetObjectOutputSchema = recordOutput;
export const sheetCellMatchesOutputSchema = recordOutput;
export const chartListOutputSchema = z.array(z.unknown());

export const chartCreatedOutputSchema = z.object({
  success: z.literal(true),
  chartId: z.string().min(1),
  workbookId: z.number().int().positive(),
  sheetId: z.number().int().positive(),
});

export const chartUpdatedOutputSchema = z.object({
  success: z.literal(true),
  chartId: z.string().min(1),
});

export const chartDeletedOutputSchema = z.object({
  success: z.literal(true),
  chartId: z.string().min(1),
});
