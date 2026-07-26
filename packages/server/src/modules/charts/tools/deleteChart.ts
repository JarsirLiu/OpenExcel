import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { type RunToolContext, runToolContextSchema } from "../../../shared/tools/context.js";
import { chartDeletedOutputSchema } from "../../../shared/tools/outputSchemas.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { deleteChartMutation } from "../application/chartMutationService.js";

export const deleteChart = defineServerTool("deleteChart", {
  contextSchema: runToolContextSchema,
  outputSchema: chartDeletedOutputSchema,
  execute: async (input, { context, toolCallId }) => {
    const executionContext = context as RunToolContext & { db?: Prisma.TransactionClient };
    return deleteChartMutation(context.workspaceId, input.chartId, {
      runId: context.runId,
      db: executionContext.db,
      mutationId: `ai:${context.runId}:${toolCallId}`,
      commandHash: JSON.stringify(input),
    });
  },
});
