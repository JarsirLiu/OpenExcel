import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { type RunToolContext, runToolContextSchema } from "../../../shared/tools/context.js";
import { chartCreatedOutputSchema } from "../../../shared/tools/outputSchemas.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { createChartMutation } from "../application/chartMutationService.js";
import { toCreateChartSpec } from "./chartToolInput.js";
import { toCreateChartToolResult } from "./chartToolResult.js";

export const createChart = defineServerTool("createChart", {
  contextSchema: runToolContextSchema,
  outputSchema: chartCreatedOutputSchema,
  execute: async (input, { context, toolCallId }) => {
    const executionContext = context as RunToolContext & { db?: Prisma.TransactionClient };
    const result = await createChartMutation(
      context.workspaceId,
      toCreateChartSpec(input as Parameters<typeof toCreateChartSpec>[0]),
      {
        runId: context.runId,
        db: executionContext.db,
        mutationId: `ai:${context.runId}:${toolCallId}`,
        commandHash: JSON.stringify(input),
      },
    );
    return toCreateChartToolResult(result);
  },
});
