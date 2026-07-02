import { z } from "zod";

export const sheetMutationContextSchema = z.object({
  runId: z.coerce.number().int().positive(),
});

export type SheetMutationContext = z.infer<typeof sheetMutationContextSchema>;
