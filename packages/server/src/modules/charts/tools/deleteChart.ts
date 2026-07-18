import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import { deleteChartMutation } from "../application/chartMutationService.js";

export const deleteChart = {
  ...excelToolSpecs.deleteChart,
  contextSchema: runToolContextSchema,
  execute: async (
    input: { chartId: string },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    return deleteChartMutation(context.workspaceId, input.chartId, {
      runId: context.runId,
    });
  },
};
