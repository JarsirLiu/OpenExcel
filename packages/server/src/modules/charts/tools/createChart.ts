import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { createChartMutation } from "../application/chartMutationService.js";
import { toCreateChartSpec } from "./chartToolInput.js";
import { toCreateChartToolResult } from "./chartToolResult.js";

export const createChart = {
  ...excelToolSpecs.createChart,
  contextSchema: runToolContextSchema,
  execute: async (
    input: Parameters<typeof toCreateChartSpec>[0],
    {
      context,
      toolCallId,
    }: {
      context: { runId: number; workspaceId: number; db?: Prisma.TransactionClient };
      toolCallId?: string;
    },
  ) => {
    const result = await createChartMutation(context.workspaceId, toCreateChartSpec(input), {
      runId: context.runId,
      db: context.db,
      mutationId: toolCallId ? `ai:${context.runId}:${toolCallId}` : undefined,
      commandHash: JSON.stringify(input),
    });
    return toCreateChartToolResult(result);
  },
};
