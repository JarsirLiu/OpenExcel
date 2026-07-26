import { z } from "zod";

export const workspaceToolContextSchema = z.object({
  workspaceId: z.coerce.number().int().positive(),
});

export const runToolContextSchema = workspaceToolContextSchema.extend({
  runId: z.coerce.number().int().positive(),
});

export type WorkspaceToolContext = z.infer<typeof workspaceToolContextSchema>;
export type RunToolContext = z.infer<typeof runToolContextSchema>;
