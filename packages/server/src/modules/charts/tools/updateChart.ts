import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import { updateChartMutation } from "../application/chartMutationService.js";
import { toUpdateChartPatch } from "./chartToolInput.js";

export const updateChart = {
  ...excelToolSpecs.updateChart,
  contextSchema: runToolContextSchema,
  execute: async (
    input: {
      chartId: string;
      patch: Parameters<typeof toUpdateChartPatch>[0];
    },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    return updateChartMutation(
      context.workspaceId,
      input.chartId,
      toUpdateChartPatch(input.patch),
      { runId: context.runId },
    );
  },
};
