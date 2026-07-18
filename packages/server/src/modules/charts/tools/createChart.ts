import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import { createChartMutation } from "../application/chartMutationService.js";
import { toCreateChartSpec } from "./chartToolInput.js";

export const createChart = {
  ...excelToolSpecs.createChart,
  contextSchema: runToolContextSchema,
  execute: async (
    input: Parameters<typeof toCreateChartSpec>[0],
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    return createChartMutation(context.workspaceId, toCreateChartSpec(input), {
      runId: context.runId,
    });
  },
};
