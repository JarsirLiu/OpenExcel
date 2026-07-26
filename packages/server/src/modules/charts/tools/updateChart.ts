import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { updateChartMutation } from "../application/chartMutationService.js";
import { toUpdateChartPatch } from "./chartToolInput.js";
import { toUpdateChartToolResult } from "./chartToolResult.js";

export const updateChart = {
  ...excelToolSpecs.updateChart,
  contextSchema: runToolContextSchema,
  execute: async (
    input: {
      chartId: string;
      patch: Parameters<typeof toUpdateChartPatch>[0];
    },
    {
      context,
      toolCallId,
    }: {
      context: { runId: number; workspaceId: number; db?: Prisma.TransactionClient };
      toolCallId?: string;
    },
  ) => {
    const result = await updateChartMutation(
      context.workspaceId,
      input.chartId,
      toUpdateChartPatch(input.patch),
      {
        runId: context.runId,
        db: context.db,
        mutationId: toolCallId ? `ai:${context.runId}:${toolCallId}` : undefined,
        commandHash: JSON.stringify(input),
      },
    );
    return toUpdateChartToolResult(result, input.chartId);
  },
};
