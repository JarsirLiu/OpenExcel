import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { type RunToolContext, runToolContextSchema } from "../../../shared/tools/context.js";
import { chartUpdatedOutputSchema } from "../../../shared/tools/outputSchemas.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { updateChartMutation } from "../application/chartMutationService.js";
import { toUpdateChartPatch } from "./chartToolInput.js";
import { toUpdateChartToolResult } from "./chartToolResult.js";

export const updateChart = defineServerTool("updateChart", {
  contextSchema: runToolContextSchema,
  outputSchema: chartUpdatedOutputSchema,
  execute: async (input, { context, toolCallId }) => {
    const executionContext = context as RunToolContext & { db?: Prisma.TransactionClient };
    const result = await updateChartMutation(
      context.workspaceId,
      input.chartId,
      toUpdateChartPatch(input.patch as Parameters<typeof toUpdateChartPatch>[0]),
      {
        runId: context.runId,
        db: executionContext.db,
        mutationId: `ai:${context.runId}:${toolCallId}`,
        commandHash: JSON.stringify(input),
      },
    );
    return toUpdateChartToolResult(result, input.chartId);
  },
});
