import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { deleteChartMutation } from "../application/chartMutationService.js";

export const deleteChart = {
  ...excelToolSpecs.deleteChart,
  contextSchema: runToolContextSchema,
  execute: async (
    input: { chartId: string },
    {
      context,
      toolCallId,
    }: {
      context: { runId: number; workspaceId: number; db?: Prisma.TransactionClient };
      toolCallId?: string;
    },
  ) => {
    return deleteChartMutation(context.workspaceId, input.chartId, {
      runId: context.runId,
      db: context.db,
      mutationId: toolCallId ? `ai:${context.runId}:${toolCallId}` : undefined,
      commandHash: JSON.stringify(input),
    });
  },
};
